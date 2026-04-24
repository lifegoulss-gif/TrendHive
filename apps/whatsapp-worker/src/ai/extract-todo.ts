import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@prisma/client";
import {
  EXTRACT_TODO_SYSTEM_PROMPT,
  TODO_EXTRACTION_TOOL,
  buildConversationPrompt,
} from "./prompts/extract-todo.js";

export interface TodoEnrichmentResult {
  is_actionable: boolean;
  title: string;
  description: string;
  deadline: string | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  is_spam: boolean;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Calls Claude to enrich an already-created todo with better title/priority.
 * The todo was created instantly — this just improves it.
 *
 * Returns null on parse/tool errors. Throws on API errors for BullMQ retry.
 */
export async function extractTodo(
  messages: Message[],
  employeeName: string,
  contactName: string
): Promise<TodoEnrichmentResult | null> {
  const userContent = buildConversationPrompt(messages, employeeName, contactName);

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001", // Haiku for speed + cost on enrichment
      max_tokens: 300,
      system: EXTRACT_TODO_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
      tools: [TODO_EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "enrich_todo" },
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      if (err.status === 429) throw new Error(`Anthropic rate limited: ${err.message}`);
      throw new Error(`Anthropic API error ${err.status}: ${err.message}`);
    }
    throw err;
  }

  const toolUseBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    console.warn("[AI] enrich_todo: no tool_use block in response");
    return null;
  }

  try {
    const result = toolUseBlock.input as TodoEnrichmentResult;
    if (typeof result.is_actionable !== "boolean" || typeof result.title !== "string" || typeof result.is_spam !== "boolean") {
      console.warn("[AI] enrich_todo: malformed output", result);
      return null;
    }
    return result;
  } catch (err) {
    console.warn("[AI] enrich_todo: failed to parse", err);
    return null;
  }
}
