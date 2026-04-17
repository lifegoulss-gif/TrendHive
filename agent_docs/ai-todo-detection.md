# AI To-Do Detection

Read this before touching `apps/whatsapp-worker/src/ai/` or changing the todo-extraction prompt.

## Goal

Automatically detect when a company employee **commits to doing something** during a WhatsApp chat, and create a trackable `Todo` for them.

Example: employee types "I'll send the quote by Friday" → system creates `Todo { title: "Send quote to [contact]", deadline: Friday, assignedTo: employeeId }`.

## What we do NOT want to flag

- Contact (customer) asking a question — only count as todo if employee promises to answer
- Small talk, greetings, completed actions ("Done! Sent it.")
- Statements of fact ("The price is $500") — no commitment
- Low-confidence detections (confidence < 0.7)

## Batching strategy

Analyzing every single message = expensive and noisy. Instead:

- Debounce by conversation: queue analysis 30s after the latest message
- Pull last 5 messages for context (not just the newest)
- Skip if latest message is from contact (INBOUND) — wait for employee reply first
- Skip if message body < 10 chars (emoji, "ok", "yes", etc.)

Rough math: at 50 msgs/employee/day × 5 employees × 10 orgs = 2500 msgs/day. With batching, that's ~500 AI calls/day ≈ $15/month. Without batching: ~$75/month.

## The prompt

System prompt (stored in `apps/whatsapp-worker/src/ai/prompts/extract-todo.ts`):

```
You are a task extraction assistant analyzing WhatsApp conversations between a company EMPLOYEE and a CONTACT (customer, lead, vendor, or prospect).

Your job: detect when the EMPLOYEE commits to doing something — an action, follow-up, deliverable, or promise with a time dimension.

Input format: last 5 messages of a conversation, each labeled [EMPLOYEE] or [CONTACT] with an ISO timestamp.

Output: strict JSON only, no prose, no markdown fences:

{
  "todo_detected": boolean,
  "title": string,         // action-oriented, max 80 chars, start with a verb
  "description": string,   // 1-2 sentences of context including the contact's name if known
  "deadline": string|null, // ISO 8601 datetime, or null if no deadline implied
  "priority": "LOW"|"MEDIUM"|"HIGH"|"URGENT",
  "confidence": number     // 0.0 to 1.0
}

Rules:
- Only flag when the EMPLOYEE makes the commitment, not the contact
- If confidence < 0.7, set todo_detected to false
- Parse relative dates ("tomorrow", "next Monday", "end of week") using the MOST RECENT message's timestamp as the reference point
- Ignore greetings, thank-yous, small talk, and actions already completed
- If the employee is just answering a factual question with no follow-up implied, todo_detected is false
- URGENT = customer explicitly asks for it "today" or "ASAP" and employee agrees
- HIGH = specific deadline within 24h
- MEDIUM = deadline within a week
- LOW = vague "soon" or "when I get a chance"
```

## User message format

```
Conversation between [Employee Name] and [Contact Name or Phone]:

[2026-04-17T10:15:00Z] [CONTACT]: Hey, any update on the pricing?
[2026-04-17T10:16:00Z] [EMPLOYEE]: Let me check with my manager
[2026-04-17T10:20:00Z] [CONTACT]: Cool thanks
[2026-04-17T14:30:00Z] [EMPLOYEE]: Got approval. I'll send you the full quote tomorrow morning.
[2026-04-17T14:31:00Z] [CONTACT]: Perfect, appreciate it
```

Expected output:
```json
{
  "todo_detected": true,
  "title": "Send full quote to [Contact Name]",
  "description": "Employee confirmed manager approval and committed to sending the full pricing quote tomorrow morning.",
  "deadline": "2026-04-18T09:00:00Z",
  "priority": "HIGH",
  "confidence": 0.95
}
```

## API call

Use `claude-sonnet-4-6`. Use structured outputs (tool call forcing JSON schema) — do NOT rely on "output JSON" in the prompt alone, it fails on edge cases.

```ts
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 500,
  system: EXTRACT_TODO_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: buildConversationPrompt(messages) }],
  tools: [TODO_EXTRACTION_TOOL],
  tool_choice: { type: 'tool', name: 'extract_todo' },
});
```

See `apps/whatsapp-worker/src/ai/extract-todo.ts` for the full implementation with retries, logging, and error handling.

## Deduplication

Before creating a Todo, check: does an open Todo already exist for this `assignedToId` with `sourceMessageId` in the same conversation within the last 24h? If yes, update the existing one (extend deadline, refine title) instead of creating a duplicate.

## Failure modes to handle

- JSON parse error: log to Sentry, don't crash, don't retry (the prompt was probably ambiguous)
- Rate limit from Anthropic: exponential backoff up to 5 min
- Confidence < 0.7: save to a `detection_log` table for future prompt tuning, do NOT create Todo
- Anthropic API down: queue job for retry in 15 min (BullMQ `attempts: 5`)

## Tuning workflow

Every Todo created has `sourceMessageId` linked. The admin dashboard has a "False Positive?" button that marks it for review. Those entries feed into `agent_docs/prompt-eval-set.md` which we use to regression-test prompt changes.

Don't edit the prompt without running the eval set first. Changes that improve one case often break three others.
