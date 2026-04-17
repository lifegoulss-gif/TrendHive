# How to Use This Setup

A surgical CLAUDE.md + companion docs for the UniboxAI WhatsApp SaaS project, built to 2026 best practices.

## What's in here

```
CLAUDE.md                          ← loaded every session (~90 lines, high signal)
.claude/settings.json              ← deterministic hooks (formatting, typecheck, safety)
agent_docs/
├── whatsapp-worker.md             ← loaded on demand when working on worker
├── ai-todo-detection.md           ← loaded on demand when working on AI/todos
└── multi-tenancy.md               ← loaded on demand when writing DB queries
```

You still need to create these companion docs yourself as you build:
- `agent_docs/architecture.md`
- `agent_docs/database.md`
- `agent_docs/auth-and-roles.md`
- `agent_docs/testing.md`
- `agent_docs/deployment.md`
- `TODO.md` (your phase tracker)

Ask Claude Code to draft them when you reach that part of the build — it'll be cheap and accurate once it knows the codebase.

## Setup steps

1. Copy `CLAUDE.md` to your project root
2. Copy `agent_docs/` to your project root
3. Copy `.claude/settings.json` to `.claude/settings.json` in your project root
4. Commit all of it to git — these are team-shared
5. Add a separate `CLAUDE.local.md` to `.gitignore` for your personal notes (optional)

## Why this structure works (the 2026 principles)

**1. Short CLAUDE.md beats long CLAUDE.md.** Claude Code injects a system reminder that tells Claude to ignore CLAUDE.md contents if they aren't relevant. Bloated files get ignored uniformly — not just the new lines, all of them. Frontier models can reliably follow ~150-200 instructions, and Claude Code's own system prompt already uses ~50. Budget carefully.

**2. Progressive disclosure.** The companion docs in `agent_docs/` are only loaded when Claude is working on that area. The CLAUDE.md just tells Claude *which file* to read for *which task* — a reading index, not a knowledge dump.

**3. Pointers over copies.** Companion docs reference code by `file:line`, not by pasting snippets. Snippets go stale. Pointers stay accurate.

**4. Hooks for must-happens, CLAUDE.md for guidance.** CLAUDE.md instructions are advisory (~80% adherence). Hooks are deterministic (100%). Critical things like "format on save" or "don't write to .env" go in `settings.json` where they can't be ignored.

**5. No code style in CLAUDE.md.** That's what Biome is for. Sending Claude to do a linter's job is slow and expensive. Let Biome auto-format via the PostToolUse hook.

## How to maintain it

- Every time you catch Claude making the same mistake twice in a session → add a line to CLAUDE.md OR a companion doc OR a hook
- Every time you add a line, look for a line to delete — aim to keep CLAUDE.md under 120 lines
- When a companion doc crosses 200 lines, split it
- Review CLAUDE.md monthly. Remove anything Claude now gets right without the instruction

## The "is this line earning its spot" test

For every line in CLAUDE.md, ask:
> If I delete this, will Claude make a mistake it wouldn't otherwise make?

If the answer is no, delete it.

## Using `@` imports

You can pull in additional files automatically with `@path/to/file`. Example:

```markdown
See @README.md for the project overview.
Build commands: @package.json
```

This beats duplicating info — Claude reads the file fresh each session, so it stays in sync.

## Starting a session

Paste this into Claude Code for each new task:

```
Current task: [describe it]
Relevant agent_docs: [list the 1-2 docs Claude should read first, or say "you pick"]
Phase: [from TODO.md]
```

That 3-line template gives Claude maximum signal with minimum context pollution.

## The meta-rule

Treat CLAUDE.md like code:
- Review it when things go wrong
- Prune it ruthlessly
- Test changes by observing whether Claude's behavior actually shifts
- Check it into git, let your future self (or teammates) contribute

Good luck. Ship fast.
