#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const STATE_DIR = path.join(ROOT, "state");
const TASKS_FILE = path.join(STATE_DIR, "tasks.json");
const HANDOFF_DIR = path.join(STATE_DIR, "handoffs");
const HISTORY_DIR = path.join(STATE_DIR, "history");
const REGISTRY_FILE = path.join(ROOT, "configs", "agent-registry.json");
const PROTOCOL_FILE = path.join(ROOT, "configs", "communication-protocol.json");
const FILE_POLICY_FILE = path.join(ROOT, "configs", "file-access-policy.json");
const GENERATED_MANIFEST_FILE = path.join(ROOT, "configs", "generated-files.json");
const FILE_APPROVALS_FILE = path.join(ROOT, "configs", "file-approvals.json");

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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "task";
}

function timestampId() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

function loadRegistry() {
  return readJson(REGISTRY_FILE, { agents: {} });
}

function loadFilePolicy() {
  return readJson(FILE_POLICY_FILE, {
    generated_roots: [ROOT],
    excluded_paths: [
      "package.json",
      "package-lock.json",
      ".gitignore",
      "node_modules"
    ]
  });
}

function loadGeneratedManifest() {
  return readJson(GENERATED_MANIFEST_FILE, { version: 1, files: [] });
}

function saveGeneratedManifest(manifest) {
  writeJson(GENERATED_MANIFEST_FILE, manifest);
}

function loadFileApprovals() {
  return readJson(FILE_APPROVALS_FILE, { version: 1, approvals: [] });
}

function saveFileApprovals(approvals) {
  writeJson(FILE_APPROVALS_FILE, approvals);
}

function normalizeForCompare(filePath) {
  return path.resolve(filePath).replace(/\\/g, "/").toLowerCase();
}

function isUnderRoot(filePath, policy) {
  const normalized = normalizeForCompare(filePath);
  return (policy.generated_roots || [ROOT]).some((root) => {
    return normalized.startsWith(normalizeForCompare(root));
  });
}

function isExcludedByPolicy(filePath, policy) {
  const normalized = normalizeForCompare(filePath);
  const relative = normalized.startsWith(normalizeForCompare(ROOT))
    ? normalized.slice(normalizeForCompare(ROOT).length).replace(/^\/+/, "")
    : normalized;

  return (policy.excluded_paths || []).some((entry) => {
    const needle = String(entry).replace(/\\/g, "/").toLowerCase();
    return relative === needle || relative.startsWith(`${needle}/`);
  });
}

function isGeneratedPath(filePath, policy, manifest) {
  const normalized = normalizeForCompare(filePath);
  if (!isUnderRoot(filePath, policy)) {
    return false;
  }

  if (isExcludedByPolicy(filePath, policy)) {
    return false;
  }

  const entry = (manifest.files || []).find((item) => normalizeForCompare(item.path) === normalized);
  return Boolean(entry) && entry.status !== "manual" && entry.status !== "deleted";
}

function parseExpiry(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isApprovalActive(entry) {
  if (!entry || entry.status !== "approved") {
    return false;
  }

  const expiry = parseExpiry(entry.expires_at);
  return !expiry || expiry.getTime() > Date.now();
}

function isApprovedPath(filePath, operation, approvals) {
  const normalized = normalizeForCompare(filePath);
  const aliases = {
    create: ["create", "write", "edit"],
    write: ["write", "edit", "create"],
    edit: ["edit", "write", "create"],
    delete: ["delete", "remove"]
  };
  const allowedOperations = aliases[operation] || [operation];
  return (approvals.approvals || []).some((entry) => {
    if (normalizeForCompare(entry.path) !== normalized) {
      return false;
    }

    const allowedOperation = entry.operation === "*" || allowedOperations.includes(entry.operation);
    return allowedOperation && isApprovalActive(entry);
  });
}

function approvalExplanation(filePath, operation, policy) {
  const normalized = normalizeForCompare(filePath);
  const insideRoot = isUnderRoot(filePath, policy);
  if (!insideRoot) {
    return {
      reason: `Blocked ${operation} outside the generated OpenCode workspace.`,
      why: "The file is outside the generated OpenCode workspace, so changing it could affect unrelated user projects, local machine configuration, or shared tooling. Approval keeps those changes deliberate, reviewable, and limited to cases where the impact is understood.",
      approval_needed: true
    };
  }

  if (isExcludedByPolicy(filePath, policy)) {
    return {
      reason: `Blocked ${operation} for protected file or directory.`,
      why: "This path is intentionally excluded because it is a dependency file, bootstrap file, or other protected asset that is not owned by the generator. Editing or removing it without approval could break package resolution, invalidate a lockfile, or overwrite hand-maintained settings.",
      approval_needed: true
    };
  }

  return {
    reason: `Blocked ${operation} because the file is not marked as generated.`,
    why: "Only files created by this automation and recorded in the generated manifest are editable or deletable without approval. The manifest is the audit trail that proves provenance; without it, we cannot distinguish generated artifacts from user-authored content safely.",
    approval_needed: true
  };
}

function approvalRequest(filePath, operation, policy) {
  const target = path.resolve(filePath);
  const reason = approvalExplanation(filePath, operation, policy);
  return {
    path: target,
    operation,
    approval_needed: true,
    request: reason,
    suggested_next_step: `Run: node scripts/orchestrator.js file approve "${target}" ${operation} "<human reason>"`,
    expires_in_hours: 24
  };
}

function approveFileAccess(filePath, operation, reason, approvedBy = "user", expiresInHours = 24) {
  const trimmedReason = String(reason || "").trim();
  if (!trimmedReason) {
    throw new Error("Approval reason is required.");
  }

  const approvals = loadFileApprovals();
  const normalized = normalizeForCompare(filePath);
  const expiresAt = new Date(Date.now() + Math.max(1, Number(expiresInHours) || 24) * 60 * 60 * 1000).toISOString();
  const next = (approvals.approvals || []).filter((entry) => normalizeForCompare(entry.path) !== normalized || !(entry.operation === operation || entry.operation === "*"));
  next.push({
    path: path.resolve(filePath),
    operation,
    reason: trimmedReason,
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
    expires_at: expiresAt,
    status: "approved"
  });
  approvals.approvals = next;
  saveFileApprovals(approvals);
  return next[next.length - 1];
}

function revokeFileAccess(filePath, operation = "*") {
  const approvals = loadFileApprovals();
  const normalized = normalizeForCompare(filePath);
  approvals.approvals = (approvals.approvals || []).filter((entry) => {
    if (normalizeForCompare(entry.path) !== normalized) {
      return true;
    }
    if (operation === "*") {
      return false;
    }
    return !(entry.operation === operation || entry.operation === "*");
  });
  saveFileApprovals(approvals);
  return approvals.approvals;
}

function recordGeneratedFile(filePath, metadata = {}) {
  const manifest = loadGeneratedManifest();
  const normalized = normalizeForCompare(filePath);
  const existing = (manifest.files || []).filter((item) => normalizeForCompare(item.path) !== normalized);
  existing.push({
    path: path.resolve(filePath),
    status: metadata.status || "active",
    generated_at: metadata.generated_at || new Date().toISOString(),
    generated_by: metadata.generated_by || "orchestrator",
    operation: metadata.operation || "create"
  });
  manifest.files = existing;
  saveGeneratedManifest(manifest);
  const policy = loadFilePolicy();
  return isGeneratedPath(filePath, policy, manifest);
}

function removeGeneratedRecord(filePath) {
  const manifest = loadGeneratedManifest();
  const normalized = normalizeForCompare(filePath);
  const existing = (manifest.files || []).filter((item) => normalizeForCompare(item.path) !== normalized);
  existing.push({
    path: path.resolve(filePath),
    status: "deleted",
    generated_at: new Date().toISOString(),
    generated_by: "orchestrator",
    operation: "delete"
  });
  manifest.files = existing;
  saveGeneratedManifest(manifest);
}

function listGeneratedFiles(dir = ROOT, policy = loadFilePolicy(), output = []) {
  if (!isUnderRoot(dir, policy) || isExcludedByPolicy(dir, policy)) {
    return output;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") {
        continue;
      }
      listGeneratedFiles(fullPath, policy, output);
      continue;
    }

    if (isExcludedByPolicy(fullPath, policy)) {
      continue;
    }

    output.push({
      path: path.resolve(fullPath),
      status: "active",
      generated_at: new Date().toISOString(),
      generated_by: "bootstrap",
      operation: "scan"
    });
  }

  return output;
}

function bootstrapGeneratedManifest() {
  const policy = loadFilePolicy();
  const files = listGeneratedFiles(ROOT, policy, []);
  for (const specialPath of [FILE_POLICY_FILE, GENERATED_MANIFEST_FILE, FILE_APPROVALS_FILE]) {
    const resolved = path.resolve(specialPath);
    if (!files.some((entry) => normalizeForCompare(entry.path) === normalizeForCompare(resolved))) {
      files.push({
        path: resolved,
        status: "active",
        generated_at: new Date().toISOString(),
        generated_by: "bootstrap",
        operation: "bootstrap"
      });
    }
  }
  const manifest = {
    version: 1,
    generated_at: new Date().toISOString(),
    generated_by: "orchestrator",
    files
  };
  saveGeneratedManifest(manifest);
  return manifest;
}

// ──────────────────────────────────────────────
// Workflow DSL (Fable 5 compatible)
// ──────────────────────────────────────────────

class Workflow {
  constructor() {
    this._meta = { name: "workflow", description: "", phases: [] };
    this._currentPhase = null;
    this._agents = [];
    this._logs = [];
  }

  meta(m) {
    this._meta = { ...this._meta, ...m };
    return this;
  }

  phase(title) {
    this._currentPhase = title;
    if (!this._meta.phases.find((p) => p.title === title)) {
      this._meta.phases.push({ title, detail: "" });
    }
    this._log(`[phase] ${title}`);
    return this;
  }

  log(message) {
    this._logs.push({ phase: this._currentPhase, message });
    console.log(`[WORKFLOW] ${message}`);
    return this;
  }

  _log(message) {
    if (process.env.WORKFLOW_DEBUG) {
      console.error(`[WORKFLOW-DEBUG] ${message}`);
    }
  }

  async agent(prompt, opts = {}) {
    const {
      schema,
      label,
      model,
      isolation,
      agentType = "general-purpose"
    } = opts;

    const agentLabel = label || prompt.slice(0, 60);
    this._log(`agent(${agentLabel}) [${agentType}]${model ? ` model=${model}` : ""}${isolation ? ` isolation=${isolation}` : ""}`);

    if (schema) {
      return await this._spawnStructured(prompt, schema, { agentType, model, isolation, label });
    }
    return await this._spawnText(prompt, { agentType, model, isolation, label });
  }

  async _spawnText(prompt, opts) {
    const { agentType, model, isolation, label } = opts;
    const taskDescription = String(label || prompt).slice(0, 40);

    try {
      const agentPath = path.join(ROOT, "scripts", "agent-invoker.js");
      if (fs.existsSync(agentPath)) {
        const cp = require("child_process");
        const args = JSON.stringify({ prompt, agentType, model, isolation, label });
        const result = cp.spawnSync("node", [agentPath, args], { encoding: "utf8", timeout: 300000 });
        if (result.error) throw result.error;
        return result.stdout ? result.stdout.trim() : null;
      }
    } catch (err) {
      this._log(`agent error (text): ${err.message}`);
    }
    return null;
  }

  async _spawnStructured(prompt, schema, opts) {
    const { agentType, model, isolation, label } = opts;
    const taskDescription = String(label || prompt).slice(0, 40);

    try {
      const agentPath = path.join(ROOT, "scripts", "agent-invoker.js");
      if (fs.existsSync(agentPath)) {
        const cp = require("child_process");
        const args = JSON.stringify({ prompt, schema, agentType, model, isolation, label, structured: true });
        const result = cp.spawnSync("node", [agentPath, args], { encoding: "utf8", timeout: 300000 });
        if (result.error) throw result.error;
        return result.stdout ? JSON.parse(result.stdout.trim()) : null;
      }
    } catch (err) {
      this._log(`agent error (structured): ${err.message}`);
    }
    return null;
  }

  async parallel(thunks) {
    this._log(`parallel(${thunks.length} tasks)`);
    const results = await Promise.allSettled(
      thunks.map((thunk, i) => {
        const label = `parallel-${i + 1}`;
        return typeof thunk === "function" ? thunk() : thunk;
      })
    );
    return results.map((r) => (r.status === "fulfilled" ? r.value : null));
  }

  async pipeline(items, ...stages) {
    this._log(`pipeline(${items.length} items, ${stages.length} stages)`);
    const results = [];
    for (let i = 0; i < items.length; i++) {
      let current = items[i];
      for (let s = 0; s < stages.length; s++) {
        current = await stages[s](current, items[i], i);
        if (current === null || current === undefined) break;
      }
      results.push(current);
    }
    return results;
  }

  summary() {
    return {
      meta: this._meta,
      phases: this._meta.phases.map((p) => p.title),
      logs: this._logs,
      agentCount: this._agents.length
    };
  }
}

module.exports = { Workflow };

function writeTextFile(filePath, content, metadata = {}) {
  const policy = loadFilePolicy();
  const manifest = loadGeneratedManifest();
  const approvals = loadFileApprovals();
  const exists = fs.existsSync(filePath);
  const generated = exists
    ? isGeneratedPath(filePath, policy, manifest)
    : isUnderRoot(filePath, policy) && !isExcludedByPolicy(filePath, policy);
  const approved = isApprovedPath(filePath, metadata.operation || "write", approvals);
  if (!generated && !approved) {
    return {
      allowed: false,
      ...approvalExplanation(filePath, metadata.operation || "write", policy)
    };
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(content), "utf8");
  if (generated || (!exists && !approved)) {
    recordGeneratedFile(filePath, { operation: metadata.operation || "write", status: "active" });
  }
  return {
    allowed: true,
    path: path.resolve(filePath)
  };
}

function deleteFile(filePath) {
  const policy = loadFilePolicy();
  const manifest = loadGeneratedManifest();
  const approvals = loadFileApprovals();
  const generated = isGeneratedPath(filePath, policy, manifest);
  const approved = isApprovedPath(filePath, "delete", approvals);
  if (!generated && !approved) {
    return {
      allowed: false,
      ...approvalExplanation(filePath, "delete", policy)
    };
  }

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  if (generated) {
    removeGeneratedRecord(filePath);
  }
  return {
    allowed: true,
    path: path.resolve(filePath)
  };
}

function routeTask({ intent = "", summary = "" }) {
  const text = `${intent} ${summary}`.toLowerCase();
  const rules = [
    { match: ["research", "investigate", "analyze", "docs", "documentation"], agent: "research" },
    { match: ["prd", "requirements", "roadmap", "feature", "scope"], agent: "pm" },
    { match: ["architecture", "design", "api", "database", "schema"], agent: "architect" },
    { match: ["frontend", "ui", "component", "design system"], agent: "frontend" },
    { match: ["review", "security", "performance", "maintainability"], agent: "reviewer" },
    { match: ["qa", "test", "regression", "bug"], agent: "qa" },
    { match: ["docs", "readme", "changelog", "knowledge base"], agent: "docs" },
    { match: ["coordinate", "status", "state", "plan"], agent: "coordinator" },
    { match: ["backend", "api implementation", "refactor"], agent: "backend" }
  ];

  for (const rule of rules) {
    if (rule.match.some((token) => text.includes(token))) {
      return rule.agent;
    }
  }

  return "coordinator";
}

function createTask({ title, intent, summary, priority = "normal", artifacts = [] }) {
  const registry = loadRegistry();
  const routedAgent = routeTask({ intent: intent || title, summary });
  const projectName = title || intent || "Project";
  const projectKey = slugify(projectName);
  const task = {
    id: `task-${timestampId()}-${slugify(title)}`,
    title,
    intent: intent || title,
    summary,
    priority,
    state: "new",
    routed_agent: routedAgent,
    source_agent: "coordinator",
    target_agent: routedAgent,
    project: projectKey,
    project_name: projectName,
    artifacts,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    chain: ["coordinator"],
    registry_snapshot: Object.keys(registry.agents || {})
  };

  const tasks = readJson(TASKS_FILE, { version: 1, tasks: [] });
  tasks.tasks.push(task);
  writeJson(TASKS_FILE, tasks);
  return task;
}

function createHandoff(taskId, sourceAgent, targetAgent, summary, artifacts = []) {
  const tasks = readJson(TASKS_FILE, { version: 1, tasks: [] });
  const task = tasks.tasks.find((item) => item.id === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const protocol = readJson(PROTOCOL_FILE, {});
  const chain = Array.from(new Set([...(task.chain || []), sourceAgent, targetAgent]));
  const handoff = {
    task_id: task.id,
    source_agent: sourceAgent,
    target_agent: targetAgent,
    intent: task.intent,
    summary: summary || task.summary,
    artifacts: artifacts.length ? artifacts : task.artifacts,
    state: task.state,
    priority: task.priority,
    project: task.project || slugify(task.title || task.intent || "project"),
    project_name: task.project_name || task.title || task.intent || "Project",
    chain,
    protocol_version: protocol.version || 1,
    timestamp: new Date().toISOString()
  };

  const handoffPath = path.join(HANDOFF_DIR, `${task.id}-${sourceAgent}-to-${targetAgent}.json`);
  writeJson(handoffPath, handoff);
  return handoff;
}

function updateTaskState(taskId, nextState, notes = "") {
  const tasks = readJson(TASKS_FILE, { version: 1, tasks: [] });
  const task = tasks.tasks.find((item) => item.id === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  task.state = nextState;
  task.notes = notes || task.notes || "";
  task.updated_at = new Date().toISOString();
  writeJson(TASKS_FILE, tasks);

  if (nextState === "done" || nextState === "verified") {
    const archivePath = path.join(HISTORY_DIR, `${task.id}.json`);
    writeJson(archivePath, task);
  }

  return task;
}

function listTasks() {
  const tasks = readJson(TASKS_FILE, { version: 1, tasks: [] });
  return tasks.tasks;
}

function listApprovals() {
  const approvals = loadFileApprovals();
  return approvals.approvals || [];
}

function main(argv) {
  const [command, ...rest] = argv;
  ensureDir(STATE_DIR);
  ensureDir(HANDOFF_DIR);
  ensureDir(HISTORY_DIR);

  switch (command) {
    case "init":
      writeJson(TASKS_FILE, readJson(TASKS_FILE, { version: 1, tasks: [] }));
      console.log(JSON.stringify({ ok: true, message: "State store initialized." }, null, 2));
      break;
    case "init-inboxes": {
      const registry = loadRegistry();
      const agents = Object.keys(registry.agents || {});
      const created = [];
      for (const agentId of agents) {
        const inboxDir = path.join(STATE_DIR, "inboxes", agentId);
        ensureDir(path.join(inboxDir, "incoming"));
        ensureDir(path.join(inboxDir, "archive"));
        ensureDir(path.join(inboxDir, "failed"));
        created.push(agentId);
      }
      console.log(JSON.stringify({ ok: true, message: "Inbox directories initialized.", agents: created }, null, 2));
      break;
    }
    case "init-logs": {
      const loggingConfig = readJson(path.join(ROOT, "configs", "logging.json"), { files: {} });
      const logFiles = Object.values(loggingConfig.files || {});
      const created = [];
      for (const logPath of logFiles) {
        const resolved = path.resolve(ROOT, String(logPath));
        ensureDir(path.dirname(resolved));
        fs.writeFileSync(resolved, "", "utf8");
        created.push(logPath);
      }
      console.log(JSON.stringify({ ok: true, message: "Log files initialized.", files: created }, null, 2));
      break;
    }
    case "route": {
      const summary = rest.join(" ");
      console.log(JSON.stringify({ routed_agent: routeTask({ summary }) }, null, 2));
      break;
    }
    case "task": {
      const subcommand = rest[0];
      if (subcommand === "new") {
        const title = rest[1] || "Untitled Task";
        const summary = rest.slice(2).join(" ");
        const task = createTask({ title, summary, intent: title });
        console.log(JSON.stringify(task, null, 2));
        break;
      }
      if (subcommand === "state") {
        const taskId = rest[1];
        const nextState = rest[2];
        const notes = rest.slice(3).join(" ");
        const task = updateTaskState(taskId, nextState, notes);
        console.log(JSON.stringify(task, null, 2));
        break;
      }
      if (subcommand === "list") {
        console.log(JSON.stringify(listTasks(), null, 2));
        break;
      }
      if (subcommand === "reconcile") {
        const action = rest[1];
        const taskId = rest[2];
        if (action === "cancel" && taskId) {
          const task = updateTaskState(taskId, "done", "Cancelled by reconciliation");
          console.log(JSON.stringify({ ok: true, action: "cancel", task }, null, 2));
          break;
        }
        if (action === "reset" && taskId) {
          const tasks = readJson(TASKS_FILE, { version: 1, tasks: [] });
          const task = tasks.tasks.find((item) => item.id === taskId);
          if (!task) { throw new Error(`Task not found: ${taskId}`); }
          task.state = "new";
          task.attempts = {};
          task.claimed_by = undefined;
          task.claimed_at = undefined;
          task.active_agent = undefined;
          task.last_result = undefined;
          task.result_summary = "";
          task.notes = "Reset by reconciliation";
          task.updated_at = new Date().toISOString();
          writeJson(TASKS_FILE, tasks);
          console.log(JSON.stringify({ ok: true, action: "reset", task }, null, 2));
          break;
        }
        if (action === "list") {
          const tasks = listTasks();
          const stuck = tasks.filter(t => ["queued", "in_progress", "needs_review"].includes(t.state));
          console.log(JSON.stringify(stuck, null, 2));
          break;
        }
        throw new Error("Usage: task reconcile cancel <task-id> | task reconcile reset <task-id> | task reconcile list");
      }
      throw new Error("Usage: task new <title> <summary...> | task state <task-id> <state> [notes] | task list | task reconcile cancel <id> | task reconcile reset <id> | task reconcile list");
    }
    case "handoff": {
      const taskId = rest[0];
      const sourceAgent = rest[1] || "coordinator";
      const targetAgent = rest[2] || routeTask({ summary: "" });
      const summary = rest.slice(3).join(" ");
      const handoff = createHandoff(taskId, sourceAgent, targetAgent, summary);
      console.log(JSON.stringify(handoff, null, 2));
      break;
    }
    case "file": {
      const subcommand = rest[0];
      const target = rest[1];
      if (subcommand === "create" || subcommand === "write") {
        const payload = rest.slice(2).join(" ");
        const result = writeTextFile(target, payload, { operation: subcommand });
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      if (subcommand === "bootstrap-manifest") {
        const manifest = bootstrapGeneratedManifest();
        console.log(JSON.stringify({ allowed: true, manifest }, null, 2));
        break;
      }
      if (subcommand === "delete") {
        const result = deleteFile(target);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      if (subcommand === "approve") {
        const operation = rest[2] || "write";
        const reason = rest.slice(3).join(" ");
        const record = approveFileAccess(target, operation, reason);
        console.log(JSON.stringify({ allowed: true, approval: record }, null, 2));
        break;
      }
      if (subcommand === "revoke") {
        const operation = rest[2] || "*";
        const remaining = revokeFileAccess(target, operation);
        console.log(JSON.stringify({ allowed: true, remaining }, null, 2));
        break;
      }
      if (subcommand === "approvals") {
        console.log(JSON.stringify(listApprovals(), null, 2));
        break;
      }
      if (subcommand === "request") {
        const operation = rest[2] || "write";
        const request = approvalRequest(target, operation, loadFilePolicy());
        console.log(JSON.stringify(request, null, 2));
        break;
      }
      if (subcommand === "check") {
        const policy = loadFilePolicy();
        const manifest = loadGeneratedManifest();
        const approvals = loadFileApprovals();
        const generated = isGeneratedPath(target, policy, manifest);
        const approved = isApprovedPath(target, "edit", approvals);
        console.log(JSON.stringify({
          path: path.resolve(target),
          generated,
          approved,
          approval: generated || approved
            ? {
                allowed: true,
                reason: generated
                  ? "File is recorded as generated and may be edited or deleted by the controller."
                  : "File has an active user approval and may be edited or deleted by the controller."
              }
            : approvalExplanation(target, "edit", policy)
        }, null, 2));
        break;
      }
      throw new Error("Usage: file create <path> <content> | file write <path> <content> | file delete <path> | file check <path> | file request <path> <operation> | file approve <path> <operation> <reason...> | file revoke <path> [operation] | file approvals | file bootstrap-manifest");
    }
    default:
      console.log(`Usage:
  node scripts/orchestrator.js init
  node scripts/orchestrator.js init-inboxes
  node scripts/orchestrator.js init-logs
  node scripts/orchestrator.js route <summary>
  node scripts/orchestrator.js task new <title> <summary...>
  node scripts/orchestrator.js task state <task-id> <state> [notes]
  node scripts/orchestrator.js task list
  node scripts/orchestrator.js task reconcile cancel <task-id>
  node scripts/orchestrator.js task reconcile reset <task-id>
  node scripts/orchestrator.js task reconcile list
  node scripts/orchestrator.js handoff <task-id> <source-agent> <target-agent> [summary]
  node scripts/orchestrator.js file create <path> <content>
  node scripts/orchestrator.js file write <path> <content>
  node scripts/orchestrator.js file bootstrap-manifest
  node scripts/orchestrator.js file delete <path>
  node scripts/orchestrator.js file request <path> <operation>
  node scripts/orchestrator.js file approve <path> <operation> <reason...>
  node scripts/orchestrator.js file revoke <path> [operation]
  node scripts/orchestrator.js file approvals
  node scripts/orchestrator.js file check <path>`);
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
