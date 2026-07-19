# Workflow Protocol

Use the Workflow DSL in `scripts/orchestrator.js` for complex multi-agent orchestration tasks. Workflows structure work across many agents for tasks that benefit from parallel decomposition, independent verification, or scale that one context can't hold.

## When to Use

- Migrations, audits, broad sweeps across many files
- Tasks requiring independent perspectives before committing
- Fan-out searches followed by adversarial verification
- Multi-phase work: understand → design → implement → review

## Workflow Script Structure

Workflow scripts are passed inline to the Workflow class (not file-based). Every script begins with a meta definition:

```javascript
const meta = {
  name: 'feature-implementation',
  description: 'Full feature: understand → design → implement → review',
  phases: [
    { title: 'Understand', detail: 'Parallel readers over subsystems' },
    { title: 'Design', detail: 'Judge panel of approaches → synthesis' },
    { title: 'Implement', detail: 'Parallel agents per component' },
    { title: 'Review', detail: 'Adversarial verification' }
  ]
}
```

## Available Functions

| Function | Purpose |
|----------|---------|
| `phase(title)` | Start a new phase; subsequent agent calls grouped under this |
| `agent(prompt, opts)` | Spawn a subagent. Returns text or validated object via schema |
| `parallel([thunk1, thunk2, ...])` | Run tasks concurrently with barrier (awaits all) |
| `pipeline(items, stage1, stage2, ...)` | Run each item through stages, no barrier between stages |
| `log(message)` | Emit a progress message shown to the user |

## agent() Options

- `schema`: JSON Schema — forces subagent to call StructuredOutput tool, returns validated object
- `label`: Custom display label
- `phase`: Explicitly assign to a progress group
- `model`: Override model for this agent call
- `isolation`: `'worktree'` for isolated git worktree (expensive, only when parallel agents would conflict)
- `agentType`: Custom subagent type from registry

## Phase Titles

Use the SAME phase titles in meta.phases as in phase() calls — titles are matched exactly. A phase() call with no matching meta entry just gets its own progress group.

## Best Practices

- For single-phase work, just use phase() + parallel agent calls
- For multi-phase work, run several workflows in sequence — read each result before deciding the next phase
- Always use `.filter(Boolean)` on parallel() results (a thunk that errors resolves to null)
- Default to omitting model override — the agent inherits the session model

## Ultracode Mode

When ultracode is confirmed active, orchestrate with workflows by default and adversarially verify findings unless work is trivial.