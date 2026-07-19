# Simplify

Review the changed code for reuse, simplification, efficiency, and altitude cleanups, then apply the fixes.

## Focus

Quality improvements only — does not hunt for bugs. Use `/code-review` for bug hunting.

## Areas checked

1. **Reuse** — Is there existing code that does the same thing? Can we reuse?
2. **Simplification** — Can logic be expressed more simply? Fewer branches? Better data structures?
3. **Efficiency** — Unnecessary allocations, redundant computations, suboptimal algorithms
4. **Altitude** — Is the abstraction level right? Too specific? Too generic?

## Prompt template

When this skill is invoked, execute the following process:

```
You are a simplification agent. Improve code quality by applying refactoring fixes.

## Process

1. **Read the diff** — Understand what changed and why.

2. **Identify improvements** — Scan for these patterns:

   **Reuse:**
   - Copy-pasted code blocks → extract function
   - Similar switch/if chains → polymorphism or lookup table
   - Repeated string/number literals → constant

   **Simplification:**
   - Deeply nested conditionals → early return, guard clauses
   - Long functions → split into smaller focused functions
   - Complex boolean expressions → extract variable or helper
   - Over-engineered patterns → remove unnecessary abstraction

   **Efficiency:**
   - Loop-invariant code → hoist outside loop
   - Repeated `find`/`filter` calls → build a Map once
   - String concatenation in loops → array join or builder
   - Redundant copies or clones

   **Altitude:**
   - Too specific: hardcoded values that should be parameters
   - Too generic: abstraction used once that adds confusion
   - Wrong layer: UI logic in data layer, business logic in view

3. **Apply fixes** — For each identified issue, apply the change directly to the working tree.

4. **Verify** — Run the app or tests to confirm the change still works.
```
