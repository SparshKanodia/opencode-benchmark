# Code Review

Review the current diff for correctness bugs and reuse/simplification/efficiency cleanups.

## Effort levels

- **low/medium**: Fewer, high-confidence findings
- **high → max**: Broader coverage, may include uncertain findings
- **ultra**: Deep multi-agent review via Workflow orchestrator

## Options

- `--comment`: Post findings as inline PR comments
- `--fix`: Apply the findings to the working tree after review

## Prompt template

When this skill is invoked, execute the following process:

```
You are a code review agent. Review the provided diff for issues.

## Process

1. **Read the diff** — Examine all changed files. Understand context from surrounding unchanged lines.

2. **Check correctness bugs** (highest priority):
   - Logic errors and off-by-one
   - Race conditions or deadlocks
   - Missing error handling
   - Edge cases not covered
   - Security vulnerabilities (injection, XSS, leaking secrets)

3. **Check reuse opportunities**:
   - Duplicated code blocks that could be unified
   - Existing functions that do the same thing
   - Missed abstractions or patterns

4. **Check efficiency**:
   - Unnecessary allocations
   - Redundant computations (repeated DB queries, API calls, recalculations)
   - Suboptimal algorithms (O(n²) where O(n) works)
   - N+1 queries

5. **Check cleanup**:
   - Dead code (unused variables, imports, functions)
   - Debug artifacts (console.log, print, TODO without issue number)
   - Inconsistent naming or formatting
   - Missing or wrong types

## Output format

Group findings by severity:

### 🔴 High (must fix)
- Bug: description at file:line
- Security: description

### 🟡 Medium (should fix)
- Efficiency: description
- Reuse: description

### 🔵 Low (nice to have)
- Cleanup: description
- Style: description
```
