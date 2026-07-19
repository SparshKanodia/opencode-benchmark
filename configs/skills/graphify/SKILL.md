# Workflow

Execute complex multi-agent workflows using the Workflow DSL in `scripts/orchestrator.js`.

## When to use

The user explicitly requests multi-agent orchestration or when the task clearly benefits from:
- Parallel fan-out across subsystems
- Adversarial verification from independent agents
- Multi-phase work (understand → design → implement → review)

## Prompt template

When this skill is invoked, execute the following process:

```
You are a workflow orchestrator. Use the Workflow class to coordinate multi-agent work.

## Setup

```javascript
const { Workflow } = require('./scripts/orchestrator.js');
const w = new Workflow();
```

## Available methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `meta` | `(obj)` | Set workflow metadata (name, description, phases array) |
| `phase` | `(title)` | Start a new phase, logs progress |
| `agent` | `(prompt, opts?)` | Spawn a subagent. opts: { model, schema, isolation, agentType } |
| `parallel` | `([thunks])` | Run multiple agents concurrently, barrier after all complete |
| `pipeline` | `(items, ...stages)` | Multi-stage transform, no intermediate barrier |
| `log` | `(message)` | Log a progress message |
| `summary` | `()` | Return workflow summary |

## Process

1. **Design** — Before calling any methods, plan the workflow phases and parallel vs sequential structure.

2. **Meta** — Call `w.meta(...)` with name, description, and phases array for progress tracking.

3. **Execute phases** — For each phase:
   - Call `w.phase('Phase Name')`
   - Run sequential steps with `w.agent()`
   - Run independent steps with `w.parallel()`
   - Run multi-stage transforms with `w.pipeline()`

4. **Summarize** — Call `w.summary()` at the end and present results.

## Example

```javascript
const { Workflow } = require('./scripts/orchestrator.js');
const w = new Workflow();
w.meta({
  name: 'refactor-auth',
  description: 'Refactor authentication module',
  phases: [
    { title: 'Analyze', detail: 'Read current auth code' },
    { title: 'Implement', detail: 'Write new auth' },
    { title: 'Verify', detail: 'Run tests' }
  ]
});

w.phase('Analyze');
const analysis = await w.agent('Read auth/ and summarize the approach');

w.phase('Implement');
await w.agent('Rewrite auth using the plan');

w.phase('Verify');
const [lint, test] = await w.parallel([
  () => w.agent('Run linter and report'),
  () => w.agent('Run tests and report')
]);

w.log(`Lint: ${lint}, Tests: ${test}`);
w.summary();
```
```

## Notes

- `w.agent()` delegates to a subagent — provide a focused prompt, not a multi-step task
- Use `parallel()` for truly independent work; use sequential `agent()` calls when later steps depend on earlier results
- `pipeline()` is for map-style operations over a collection
