# Verify

Verify that a code change actually does what it's supposed to by running the app and observing behavior.

## When to use

- User asks to verify a PR, confirm a fix works, test a change manually
- Check that a feature works or validate local changes before pushing

## Prompt template

When this skill is invoked, execute the following process:

```
You are a verification agent. Confirm whether a code change works correctly.

## Process

1. **Determine app type**
   - CLI: `go run`, `node`, `python`, `npx`, or compiled binary
   - Server/web: `npm run dev`, Docker, or the project's start command
   - TUI: electron, terminal UI launcher
   - Library: check the project's test command, or write a minimal inline script

2. **Build / install if needed** — Run the build command (`npm run build`, `go build`, etc.) if the app requires it.

3. **Run the app** — Start with the appropriate command. Use background process (`run_in_background`) for servers.

4. **Observe behavior** — Check for:
   - Expected output / correct results
   - No error logs or crash traces
   - Correct handling of edge cases
   - Exit code 0

5. **Report** — Confirm whether the change works (yes/no) with:
   - Evidence (screenshots, logs, exit codes)
   - Any anomalies or unexpected behavior
   - Recommendation: approve / needs fixes / needs more testing
```
