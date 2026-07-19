# OpenCode SWE-bench Benchmark

Automated benchmark comparing three frameworks on [SWE-bench Lite](https://www.swebench.com/):

1. **OpenCode (custom config)** — multi-agent orchestration with skills, custom prompts, and workflow protocol
2. **OpenCode (plain)** — default OpenCode with no custom config (`--pure` flag)
3. **Aider** — single-agent baseline

## How to Run

### Prerequisites

Add these secrets to the GitHub repo (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|--------|---------|
| `OPENROUTER_API_KEY` | OpenRouter API key for model access |
| `NVIDIA_API_KEY` | NVIDIA NIM API key (if using NVIDIA models) |
| `CONTEXT7_API_KEY` | Context7 MCP API key (for custom config) |
| `GITHUB_MCP_TOKEN` | GitHub MCP token (for custom config) |
| `STITCH_API_KEY` | Stitch MCP API key (for custom config) |

### Triggering a Run

1. Go to the **Actions** tab in the GitHub repo
2. Select **SWE-bench Benchmark — OpenCode Custom Config** workflow
3. Click **Run workflow** (optionally set N tasks, model, agent)
4. Repeat for **SWE-bench Baseline — Aider & Plain OpenCode**

### Reproducing Locally

```bash
# Install dependencies
pip install -r harness/requirements.txt

# Select tasks
python harness/select_tasks.py --n 5

# Run a single task
python harness/run_task.py <task_id> --trial 1 --framework opencode-custom

# Aggregate results
python harness/aggregate.py --results-dir results
```

### Structure

```
.github/workflows/
  benchmark.yml          — OpenCode custom config workflow
  baseline-aider.yml     — Aider + plain OpenCode baseline workflow
configs/                 — Copy of opencode-config (custom agents, skills, prompts)
harness/
  select_tasks.py        — Pull N random tasks from SWE-bench Lite
  get_image.py           — Resolve Docker image for a task
  run_task.py            — Run a single task/trial with a given framework
  aggregate.py           — Compute pass@1/pass@3 and write summary
  requirements.txt       — Python dependencies
results/                 — Per-task results and aggregate summary
```

### Secrets Required

| Secret | Purpose |
|--------|---------|
| `OPENROUTER_API_KEY` | Required — model access via OpenRouter |
| `NVIDIA_API_KEY` | Required if using NVIDIA NIM models |
| `CONTEXT7_API_KEY` | Required for custom config (Context7 MCP) |
| `GITHUB_MCP_TOKEN` | Required for custom config (GitHub MCP) |
| `STITCH_API_KEY` | Required for custom config (Stitch MCP) |
