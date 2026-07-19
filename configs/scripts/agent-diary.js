#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIARY_ROOT = path.join(ROOT, "state", "diaries");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "project";
}

function titleCase(value) {
  return String(value || "")
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((item) => String(item));
  }
  return [String(value)];
}

function formatDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function projectKeyFromTask(task = {}, fallback = "project") {
  return slugify(task.project_key || task.project || task.project_name || task.title || task.intent || fallback);
}

function projectNameFromTask(task = {}, fallback = "Project") {
  return String(task.project_name || task.project || task.title || task.intent || fallback).trim() || fallback;
}

function diaryPaths(projectKey, agentId) {
  const projectDir = path.join(DIARY_ROOT, projectKey);
  return {
    root: DIARY_ROOT,
    projectDir,
    projectIndex: path.join(projectDir, "index.json"),
    projectReadme: path.join(projectDir, "README.md"),
    agentJournalDir: path.join(projectDir, "agents"),
    agentJournal: path.join(projectDir, "agents", `${agentId}.md`)
  };
}

function loadProjectIndex(projectKey, projectName) {
  const paths = diaryPaths(projectKey, "index");
  ensureDir(paths.projectDir);
  ensureDir(paths.agentJournalDir);

  const existing = readJson(paths.projectIndex, null);
  if (existing) {
    return existing;
  }

  return {
    version: 1,
    kind: "agent-diary-project",
    project_key: projectKey,
    project_name: projectName,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    entries: [],
    agents: {},
    tasks: {}
  };
}

function renderProjectReadme(index) {
  const entries = Array.isArray(index.entries) ? index.entries : [];
  const agents = index.agents || {};
  const recent = entries.slice(-8).reverse();
  const agentRows = Object.entries(agents).sort(([a], [b]) => a.localeCompare(b));

  const lines = [
    `# Diary: ${index.project_name}`,
    "",
    `- Project key: \`${index.project_key}\``,
    `- Created: ${formatDateTime(index.created_at)}`,
    `- Updated: ${formatDateTime(index.updated_at)}`,
    `- Entry count: ${entries.length}`,
    "",
    "## Agent Journals",
    "",
    "| Agent | Entries | Last Update | Journal |",
    "|-------|---------|-------------|---------|"
  ];

  if (agentRows.length === 0) {
    lines.push("| _none yet_ | 0 | - | - |");
  } else {
    for (const [agentId, stats] of agentRows) {
      const journalPath = `agents/${agentId}.md`;
      lines.push(
        `| ${agentId} | ${stats.entry_count || 0} | ${formatDateTime(stats.last_entry_at || index.updated_at)} | \`${journalPath}\` |`
      );
    }
  }

  lines.push("", "## Recent Entries", "");
  if (recent.length === 0) {
    lines.push("- No entries recorded yet.");
  } else {
    for (const entry of recent) {
      lines.push(
        `- ${formatDateTime(entry.timestamp)} | ${entry.agent_id} | ${entry.task_id} | ${entry.summary}`
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function buildDiaryEntryMarkdown({ task, agentId, entry, source }) {
  const timestamp = formatDateTime(entry.timestamp || new Date());
  const title = entry.title || task.title || task.intent || task.id;
  const summary = entry.summary || task.summary || "";
  const reasoning = normalizeList(entry.reasoning);
  const actions = normalizeList(entry.actions);
  const artifacts = normalizeList(entry.artifacts);
  const decisions = normalizeList(entry.decisions);
  const nextSteps = normalizeList(entry.next_steps || entry.nextSteps);

  const sections = [
    `## ${timestamp} - ${title}`,
    "",
    `- Task: \`${task.id}\``,
    `- Agent: \`${agentId}\``,
    `- Project: ${projectNameFromTask(task)}`,
    `- Source: ${source || "agent-runner"}`,
    `- State: \`${task.state || "unknown"}\``,
    "",
    "### Summary",
    summary || "No summary provided.",
    "",
    "### Reasoning",
    reasoning.length ? reasoning.map((item) => `- ${item}`).join("\n") : "- No explicit reasoning recorded.",
    "",
    "### Actions",
    actions.length ? actions.map((item) => `- ${item}`).join("\n") : "- No actions recorded.",
    "",
    "### Artifacts",
    artifacts.length ? artifacts.map((item) => `- ${item}`).join("\n") : "- No artifacts recorded.",
    "",
    "### Decisions",
    decisions.length ? decisions.map((item) => `- ${item}`).join("\n") : "- No decisions recorded.",
    "",
    "### Next Steps",
    nextSteps.length ? nextSteps.map((item) => `- ${item}`).join("\n") : "- No next steps recorded.",
    ""
  ];

  return sections.join("\n");
}

function appendDiaryEntry({ task, agentId, entry = {}, source = "agent-runner" }) {
  if (!task || !task.id) {
    throw new Error("appendDiaryEntry requires a task with an id.");
  }

  if (!agentId) {
    throw new Error("appendDiaryEntry requires an agentId.");
  }

  const projectKey = slugify(entry.project_key || task.project_key || task.project || task.project_name || task.title || task.intent);
  const projectName = String(entry.project_name || task.project_name || task.project || task.title || task.intent || "Project").trim() || "Project";
  const paths = diaryPaths(projectKey, agentId);
  ensureDir(paths.projectDir);
  ensureDir(paths.agentJournalDir);

  const index = loadProjectIndex(projectKey, projectName);
  const markdown = buildDiaryEntryMarkdown({ task, agentId, entry, source });
  const currentJournal = readText(paths.agentJournal);
  const separator = currentJournal.trim().length > 0 ? "\n\n---\n\n" : "";
  fs.writeFileSync(paths.agentJournal, `${currentJournal}${separator}${markdown}\n`, "utf8");

  const timestamp = String(entry.timestamp || new Date().toISOString());
  index.project_name = projectName;
  index.updated_at = new Date().toISOString();
  index.entries = Array.isArray(index.entries) ? index.entries : [];
  index.entries.push({
    timestamp,
    task_id: task.id,
    agent_id: agentId,
    title: entry.title || task.title || task.intent || task.id,
    summary: entry.summary || task.summary || "",
    source
  });
  index.agents = index.agents || {};
  index.agents[agentId] = {
    entry_count: (index.agents[agentId]?.entry_count || 0) + 1,
    last_entry_at: timestamp,
    journal: `agents/${agentId}.md`
  };
  index.tasks = index.tasks || {};
  index.tasks[task.id] = {
    title: task.title || task.intent || task.id,
    last_entry_at: timestamp,
    last_agent_id: agentId,
    state: task.state || "unknown"
  };

  writeJson(paths.projectIndex, index);
  fs.writeFileSync(paths.projectReadme, renderProjectReadme(index), "utf8");

  return {
    project_key: projectKey,
    project_name: projectName,
    project_dir: paths.projectDir,
    project_readme: paths.projectReadme,
    project_index: paths.projectIndex,
    agent_journal: paths.agentJournal
  };
}

module.exports = {
  appendDiaryEntry,
  diaryPaths,
  projectKeyFromTask,
  projectNameFromTask,
  renderProjectReadme,
  buildDiaryEntryMarkdown
};

if (require.main === module) {
  console.log([
    "Agent diary helper.",
    "Import this module from runner and invoker code to append project-scoped diary entries.",
    "Exports: appendDiaryEntry, diaryPaths, projectKeyFromTask, projectNameFromTask."
  ].join("\n"));
}
