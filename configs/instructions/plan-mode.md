# Plan Mode (/plan)

Use plan mode when starting a non-trivial implementation task. Getting user sign-off on the approach before writing code prevents wasted effort.

Planning tasks are routed to the **GLM 5.1** model via the `z-ai/glm-5.1` routing entry. GLM provides analytical depth for structured planning. Since GLM does not receive a separate system prompt, planning guidance is embedded here and in the global system prompt.

## When to Use

Use `/plan` when ANY of these apply:
1. **New feature** — adding meaningful new functionality
2. **Multiple valid approaches** — task can be solved several different ways
3. **Code modifications** — changes affecting existing behavior or structure
4. **Architectural decisions** — choosing between patterns or technologies
5. **Multi-file changes** — likely touching more than 2-3 files
6. **Unclear requirements** — need to explore before understanding full scope

## When NOT to Use

Skip `/plan` for:
- Single-line or few-line fixes (typos, obvious bugs, small tweaks)
- Adding a single function with clear requirements
- Pure research/exploration tasks

## Plan Mode Protocol

### Enter Plan Mode (`/plan [topic]`)

1. **Read-only enforcement.** Agent CANNOT use: edit, write, bash (modifying), task (write), file operations
2. **Allowed tools:** read, glob, grep, webfetch, websearch, question, todowrite
3. **Agent behavior:** Explore codebase, understand existing patterns, design implementation approach

### During Plan Mode

1. Thoroughly explore the codebase using glob/grep/read
2. Understand existing patterns and architecture
3. Design an implementation approach
4. Present the plan for user approval

### Self-enforcement

Since opencode has no native read-only hook, the agent MUST self-enforce:
- Before every edit/write/bash-modify call, check: "Am I in plan mode?"
- If yes: BLOCK the call and instead explain why it can't be done in plan mode
- Only exit plan mode after the user explicitly approves

### Exit Plan Mode (`/plan approve` or `/plan done`)

1. Plan is presented to the user for review
2. User approves or requests changes
3. On approval: exit plan mode, proceed with implementation

## Planning Methodology

When in plan mode, structure your analysis:

1. **Understand the problem** — What is the actual goal? What constraints exist? What's in scope vs. out of scope?
2. **Explore the codebase** — Find relevant files, understand existing patterns, identify integration points
3. **Consider approaches** — List viable approaches with tradeoffs (complexity, maintainability, performance, dependencies)
4. **Recommend** — Pick the best approach and explain why
5. **Implementation plan** — File list, changes needed, order of operations, testing strategy
6. **Risks** — What could go wrong? What's the rollback plan?

Present the plan concisely but completely. The user should be able to approve and have confidence in the outcome.

## Example Flow

```
User: "Add user authentication to the app"
You: [enters plan mode, explores codebase, considers session vs JWT,
     returns plan for approval]
User: approves
You: [exits plan mode, implements]
```
