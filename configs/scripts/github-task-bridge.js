#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ORCHESTRATOR = path.join(ROOT, "scripts", "orchestrator.js");
const CONFIG_PATH = path.join(ROOT, "configs", "github-integration.json");

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch { return fallback; }
}

function loadConfig() {
  return readJson(CONFIG_PATH, { enabled: false, poll_interval_seconds: 300, auto_task_labels: ["auto-task"], repos: [], default_priority: "normal", max_issues_per_poll: 5 });
}

function createTask(title, summary, opts = {}) {
  const args = ["task", "new", title, summary];
  const result = spawnSync("node", [ORCHESTRATOR, ...args], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) { throw new Error(`Failed to create task: ${result.stderr}`); }
  return JSON.parse(result.stdout);
}

function routeTaskAgent(summary) {
  const result = spawnSync("node", [ORCHESTRATOR, "route", summary], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) { return "coordinator"; }
  try { return JSON.parse(result.stdout).routed_agent || "coordinator"; } catch { return "coordinator"; }
}

async function pollGithubIssues(config) {
  const token = process.env.GITHUB_MCP_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) { return []; }

  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "opencode-github-bridge"
  };

  const allIssues = [];
  for (const repo of (config.repos || [])) {
    if (!repo.includes("/")) { continue; }
    const labels = (config.auto_task_labels || ["auto-task"]).join(",");
    const url = `https://api.github.com/repos/${repo}/issues?state=open&labels=${encodeURIComponent(labels)}&sort=created&direction=asc&per_page=${config.max_issues_per_poll || 5}`;
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) { continue; }
      const issues = await response.json();
      for (const issue of issues) {
        allIssues.push({
          repo,
          number: issue.number,
          title: issue.title,
          body: issue.body || "",
          url: issue.html_url,
          labels: (issue.labels || []).map(l => typeof l === "string" ? l : l.name).filter(Boolean)
        });
      }
    } catch { continue; }
  }
  return allIssues;
}

async function bridgeOnce() {
  const config = loadConfig();
  if (!config.enabled) { return { skipped: true, reason: "GitHub integration is disabled." }; }
  const issues = await pollGithubIssues(config);
  if (issues.length === 0) { return { ok: true, created: 0, issues: [] }; }
  const created = [];
  for (const issue of issues) {
    try {
      const summary = `GitHub issue #${issue.number} in ${issue.repo}: ${issue.title}`;
      const task = createTask(issue.title, summary);
      created.push({ issue: issue.number, repo: issue.repo, task_id: task.id });
    } catch { continue; }
  }
  return { ok: true, created: created.length, issues: created };
}

async function runLoop({ once = false } = {}) {
  if (once) { return bridgeOnce(); }
  const config = loadConfig();
  if (!config.enabled) {
    console.log(JSON.stringify({ ok: true, message: "GitHub integration disabled. Set enabled: true in configs/github-integration.json" }));
    return;
  }
  const interval = Math.max(60000, (config.poll_interval_seconds || 300) * 1000);
  while (true) {
    try {
      const result = await bridgeOnce();
      console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...result }));
    } catch (error) {
      console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: error.message }));
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

if (require.main === module) {
  const [command] = process.argv.slice(2);
  if (command === "once") {
    bridgeOnce().then(r => { console.log(JSON.stringify(r, null, 2)); }).catch(e => { console.error(e.message); process.exit(1); });
  } else if (command === "start") {
    runLoop().catch(e => { console.error(e.message); process.exit(1); });
  } else {
    console.log("Usage: node scripts/github-task-bridge.js start | once");
  }
}

module.exports = { bridgeOnce, pollGithubIssues, runLoop };