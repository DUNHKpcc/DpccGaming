# Agent Guidelines

These instructions apply to AI coding agents working in this repository. Merge them with any user request and project-specific constraints.

## Karpathy-Inspired Coding Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. These rules bias toward caution over speed; for trivial tasks, use judgment.

### 1. Think Before Coding

Do not assume. Do not hide confusion. Surface tradeoffs.

Before implementing:
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them instead of silently choosing one.
- If a simpler approach exists, say so and push back when warranted.
- If something is unclear, stop, name what is confusing, and ask.

### 2. Simplicity First

Use the minimum code that solves the problem. Do not add speculative complexity.

- Do not add features beyond what was asked.
- Do not create abstractions for single-use code.
- Do not add unrequested flexibility or configurability.
- Do not add error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.

Ask: would a senior engineer say this is overcomplicated? If yes, simplify.

### 3. Surgical Changes

Touch only what is necessary. Clean up only your own mess.

When editing existing code:
- Do not improve adjacent code, comments, or formatting unrelated to the task.
- Do not refactor things that are not broken.
- Match the existing style, even if you would choose a different one.
- If you notice unrelated dead code, mention it instead of deleting it.

When your changes create orphaned code:
- Remove imports, variables, and functions made unused by your change.
- Do not remove pre-existing dead code unless explicitly asked.

Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

Define success criteria and loop until verified.

Transform tasks into verifiable goals:
- "Add validation" becomes "Write tests for invalid inputs, then make them pass."
- "Fix the bug" becomes "Write a test that reproduces it, then make it pass."
- "Refactor X" becomes "Ensure tests pass before and after."

For multi-step tasks, state a brief plan:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

### 5. MCP&SKILL Policy



Strong success criteria allow independent execution. Weak criteria like "make it work" require clarification.

## Temporary Test Policy

- Do not add permanent test files to this repository unless the user explicitly asks for committed tests.
- When a task needs temporary tests, create them only under the repository root `temp-test/` directory.
- Run the temporary tests needed for the task, then delete those test files before finishing.
- Do not use `test/`, `tests/`, `backend/tests/`, or scattered `*.test.*` files elsewhere in the project.
