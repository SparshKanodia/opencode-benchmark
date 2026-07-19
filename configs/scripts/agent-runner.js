#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { invokeAgent } = require("./agent-invoker");
const {
  appendDiaryEntry,
  projectKeyFromTask,
  projectNameFromTask
} = require("./agent-diary");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_DIR = path.join(ROOT, "configs");
const STATE_DIR = path.join(ROOT, "state");
const TASKS_FILE = path.join(STATE_DIR, "tasks.json");
const HANDOFF_DIR = path.join(STATE_DIR, "handoffs");
const HISTORY_DIR = path.join(STATE_DIR, "history");
const INBOX_ROOT = path.join(STATE_DIR, "inboxes");
const RUNNER_LOCK = path.join(STATE_DIR, ".runner.lock");

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
    .slice(0, 64) || "task";
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((item) => String(item));
  }
  return [String(value)];
}

function normalizeArtifacts(value) {
  if (!value) {
    return [];
  }
  if (!Array.isArray(value)) {
    return [String(value)];
  }
  return value
    .map((item) => {
      if (!item) {
        return null;
      }
      if (typeof item === "string") {
        return item;
      }
      if (typeof item === "object") {
        const label = item.path || item.file || item.name || "";
        const detail = item.description || item.reason || item.note || "";
        return detail ? `${label} - ${detail}` : label || JSON.stringify(item);
      }
      return String(item);
    })
    .filter(Boolean);
}

function formatTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function loadRunnerConfig() {
  return readJson(path.join(CONFIG_DIR, "runner-config.json"), {
    poll_interval_ms: 3000,
    max_concurrency: 1,
    claim_timeout_minutes: 5,
    retry_backoff_ms: 30000,
    inbox_root: ".\\state\\inboxes",
    diary_root: ".\\state\\diaries",
    archive_root: ".\\state\\handoffs",
    resume_on_start: true,
    dry_run_fallback: true
  });
}

function loadRetryPolicy(agentId) {
  const policies = readJson(path.join(CONFIG_DIR, "retry-policies.json"), {
    default: { max_attempts: 2, backoff_ms: 30000, escalation_state: "blocked" },
    agents: {}
  });
  return {
    ...policies.default,
    ...(policies.agents?.[agentId] || {})
  };
}

function readTaskStore() {
  return readJson(TASKS_FILE, { version: 1, tasks: [] });
}

function writeTaskStore(tasks) {
  writeJson(TASKS_FILE, tasks);
}

function getTasks() {
  const store = readTaskStore();
  return Array.isArray(store.tasks) ? store.tasks : [];
}

function projectLabel(task) {
  return projectNameFromTask(task, task.title || task.intent || task.id);
}

function projectKey(task) {
  return projectKeyFromTask(task, task.id);
}

function taskIsClaimable(task) {
  if (!task || !task.id) {
    return false;
  }

  if (["done", "verified", "blocked"].includes(task.state)) {
    return false;
  }

  if (["new", "queued"].includes(task.state)) {
    return true;
  }

  return task.state === "needs_review" && ["reviewer", "qa", "docs"].includes(task.target_agent);
}

function lockFileHandle(lockPath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  ensureDir(path.dirname(lockPath));
  while (Date.now() < deadline) {
    try {
      return fs.openSync(lockPath, "wx");
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  throw new Error(`Could not acquire runner lock: ${lockPath}`);
}

function releaseLock(lockPath, handle) {
  if (typeof handle === "number") {
    try {
      fs.closeSync(handle);
    } catch {
      // ignore close errors in cleanup
    }
  }
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // ignore missing lock file
  }
}

function withTaskLock(fn) {
  const handle = lockFileHandle(RUNNER_LOCK);
  try {
    return fn();
  } finally {
    releaseLock(RUNNER_LOCK, handle);
  }
}

function updateTask(taskId, updater) {
  return withTaskLock(() => {
    const store = readTaskStore();
    const task = store.tasks.find((item) => item.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const updated = updater(task) || task;
    updated.updated_at = new Date().toISOString();
    writeTaskStore(store);
    return updated;
  });
}

function buildInboxPaths(agentId) {
  const incomingDir = path.join(INBOX_ROOT, agentId, "incoming");
  const archiveDir = path.join(INBOX_ROOT, agentId, "archive");
  const failedDir = path.join(INBOX_ROOT, agentId, "failed");
  ensureDir(incomingDir);
  ensureDir(archiveDir);
  ensureDir(failedDir);
  return { incomingDir, archiveDir, failedDir };
}

function buildHandoff(task, agentId, runnerId) {
  const project = projectKey(task);
  return {
    task_id: task.id,
    source_agent: task.source_agent || "coordinator",
    target_agent: agentId,
    intent: task.intent || task.title,
    summary: task.summary || "",
    artifacts: normalizeArtifacts(task.artifacts),
    state: task.state,
    priority: task.priority || "normal",
    timestamp: new Date().toISOString(),
    project_key: project,
    project_name: projectLabel(task),
    runner_id: runnerId,
    chain: Array.isArray(task.chain) ? task.chain : [],
    claim: {
      claimed_at: task.claimed_at || null,
      attempt: task.attempts?.[agentId] || 0
    }
  };
}

function writeHandoffPacket(handoff) {
  ensureDir(HANDOFF_DIR);
  const fileName = `${handoff.task_id}-${handoff.source_agent}-to-${handoff.target_agent}-${handoff.runner_id || "runner"}.json`;
  const handoffPath = path.join(HANDOFF_DIR, fileName);
  writeJson(handoffPath, handoff);
  return handoffPath;
}

function deliverToInbox(agentId, handoff, handoffPath) {
  const { incomingDir } = buildInboxPaths(agentId);
  const inboxPath = path.join(incomingDir, path.basename(handoffPath));
  writeJson(inboxPath, {
    ...handoff,
    handoff_path: handoffPath,
    inbox_path: inboxPath,
    delivered_at: new Date().toISOString(),
    status: "delivered"
  });
  return inboxPath;
}

function archiveInboxPacket(agentId, inboxPath, status, result = {}) {
  const { archiveDir, failedDir } = buildInboxPaths(agentId);
  const targetDir = status === "ok" ? archiveDir : failedDir;
  const archivedPath = path.join(targetDir, path.basename(inboxPath));
  const packet = readJson(inboxPath, {});
  packet.status = status;
  packet.completed_at = new Date().toISOString();
  packet.result = result;
  writeJson(archivedPath, packet);
  try {
    fs.unlinkSync(inboxPath);
  } catch {
    // ignore cleanup issues
  }
  return archivedPath;
}

function claimTask(taskId, runnerId = "runner") {
  return withTaskLock(() => {
    const store = readTaskStore();
    const task = store.tasks.find((item) => item.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (!taskIsClaimable(task)) {
      return null;
    }

    const agentId = task.target_agent || task.routed_agent || "coordinator";
    const attempts = task.attempts || {};
    attempts[agentId] = (attempts[agentId] || 0) + 1;
    task.attempts = attempts;
    task.state = "in_progress";
    task.claimed_by = runnerId;
    task.claimed_at = new Date().toISOString();
    task.active_agent = agentId;
    task.retry_after = null;
    task.notes = task.notes || "";
    task.notes = task.notes ? `${task.notes}\nClaimed by ${runnerId} for ${agentId}.` : `Claimed by ${runnerId} for ${agentId}.`;
    task.updated_at = new Date().toISOString();
    writeTaskStore(store);
    return { ...task, active_agent: agentId };
  });
}

function reconcileStaleClaims() {
  const runnerConfig = loadRunnerConfig();
  const staleMs = (Number(runnerConfig.claim_timeout_minutes) || 5) * 60 * 1000;
  return withTaskLock(() => {
    const store = readTaskStore();
    const now = Date.now();
    let changed = false;

    for (const task of store.tasks) {
      if (task.state !== "in_progress" || !task.claimed_at) {
        continue;
      }

      const claimedAt = new Date(task.claimed_at);
      if (Number.isNaN(claimedAt.getTime())) {
        continue;
      }

      if (now - claimedAt.getTime() > staleMs) {
        task.state = "queued";
        task.retry_after = new Date(now + (Number(runnerConfig.retry_backoff_ms) || 30000)).toISOString();
        task.notes = task.notes || "";
        task.notes = task.notes ? `${task.notes}\nRequeued after stale claim.` : "Requeued after stale claim.";
        task.updated_at = new Date().toISOString();
        changed = true;
      }
    }

    if (changed) {
      writeTaskStore(store);
    }

    return changed;
  });
}

function shouldSkipRetry(task, agentId, policy) {
  const attempts = task.attempts?.[agentId] || 0;
  return attempts >= (policy.max_attempts || 1);
}

function recordClaimDiary(task, agentId, handoffPath, inboxPath) {
  return appendDiaryEntry({
    task,
    agentId,
    source: "agent-runner-claim",
    entry: {
      title: `Claimed ${task.id}`,
      summary: `Prepared the task for execution by ${agentId}.`,
      reasoning: [
        `The task entered ${task.state} and was ready for autonomous processing.`,
        "A bounded handoff packet was created so the next agent can work without full conversation history."
      ],
      actions: [
        `Wrote handoff packet at ${handoffPath}.`,
        `Delivered the packet to ${inboxPath}.`
      ],
      artifacts: [handoffPath, inboxPath],
      decisions: [
        `Route the task to ${agentId}.`,
        "Preserve the handoff chain in file-backed state."
      ],
      next_steps: [`Invoke ${agentId} with the handoff packet.`]
    }
  });
}

function recordRetryDiary(task, agentId, message, handoffPath) {
  return appendDiaryEntry({
    task,
    agentId,
    source: "agent-runner-retry",
    entry: {
      title: `Retry scheduled for ${task.id}`,
      summary: message,
      reasoning: [
        "The previous invocation failed or returned a non-actionable result.",
        "Retry policy allows another attempt, so the task was placed back into the queue."
      ],
      actions: [
        "Updated the task state to queued.",
        `Kept the latest handoff packet at ${handoffPath}.`
      ],
      artifacts: [handoffPath],
      decisions: ["Use the configured backoff before retrying."],
      next_steps: ["Allow the runner to pick up the task again after the backoff window."]
    }
  });
}

function recordBlockDiary(task, agentId, message, handoffPath) {
  return appendDiaryEntry({
    task,
    agentId,
    source: "agent-runner-blocked",
    entry: {
      title: `Blocked ${task.id}`,
      summary: message,
      reasoning: [
        "The task cannot proceed without a human decision, approval, or a more complete response.",
        "Blocking is preferred over silently losing context or spinning in a retry loop."
      ],
      actions: [
        "Set the task state to blocked.",
        `Preserved the last handoff packet at ${handoffPath}.`
      ],
      artifacts: [handoffPath],
      decisions: ["Escalate instead of retrying further."],
      next_steps: ["Wait for approval or a coordinated follow-up task."]
    }
  });
}

function archiveTask(task) {
  ensureDir(HISTORY_DIR);
  const archivePath = path.join(HISTORY_DIR, `${task.id}.json`);
  writeJson(archivePath, task);
  return archivePath;
}

function applyInvocationResult(task, agentId, handoff, handoffPath, invocation, retryPolicy) {
  return withTaskLock(() => {
    const store = readTaskStore();
    const storedTask = store.tasks.find((item) => item.id === task.id);
    if (!storedTask) {
      throw new Error(`Task not found during completion update: ${task.id}`);
    }

    const result = invocation.structured || {};
    const nextState = result.next_state || (result.next_agent ? "queued" : "done");
    const nextAgent = result.next_agent || null;
    const artifacts = normalizeArtifacts([
      ...normalizeArtifacts(storedTask.artifacts),
      ...normalizeArtifacts(result.artifacts)
    ]);
    storedTask.artifacts = Array.from(new Set(artifacts));
    storedTask.last_result = {
      summary: result.summary || "",
      reasoning: normalizeArray(result.reasoning),
      actions: normalizeArray(result.actions),
      decisions: normalizeArray(result.decisions),
      next_steps: normalizeArray(result.next_steps),
      next_agent: nextAgent,
      next_state: nextState,
      invocation_mode: invocation.mode,
      completed_at: new Date().toISOString()
    };
    storedTask.result_summary = result.summary || "";
    storedTask.diaried = true;
    storedTask.diary_project_key = projectKeyFromTask(task);
    storedTask.diary_project_name = projectLabel(task);
    storedTask.inbox_path = handoffPath;
    storedTask.last_agent = agentId;

    if (invocation.ok && nextState !== "blocked") {
      if (nextState === "queued" && nextAgent && nextAgent !== agentId) {
        storedTask.source_agent = agentId;
        storedTask.target_agent = nextAgent;
        storedTask.routed_agent = nextAgent;
        storedTask.state = "queued";
        storedTask.chain = Array.from(new Set([...(storedTask.chain || []), agentId, nextAgent]));
        storedTask.retry_after = null;
      } else if (nextState === "needs_review") {
        storedTask.state = "needs_review";
      } else if (nextState === "verified") {
        storedTask.state = "verified";
        archiveTask(storedTask);
      } else if (nextState === "done") {
        storedTask.state = "done";
        archiveTask(storedTask);
      } else {
        storedTask.state = nextState;
      }
      storedTask.updated_at = new Date().toISOString();
      writeTaskStore(store);
      return { task: storedTask, status: "ok" };
    }

    const attempts = storedTask.attempts?.[agentId] || 1;
    if (!invocation.ok || nextState === "blocked") {
      if (!invocation.ok && !shouldSkipRetry(storedTask, agentId, retryPolicy)) {
        storedTask.state = "queued";
        storedTask.retry_after = new Date(Date.now() + (retryPolicy.backoff_ms || 30000)).toISOString();
        storedTask.notes = storedTask.notes ? `${storedTask.notes}\nRetry scheduled.` : "Retry scheduled.";
        storedTask.updated_at = new Date().toISOString();
        writeTaskStore(store);
        return { task: storedTask, status: "retry" };
      }

      storedTask.state = retryPolicy.escalation_state || "blocked";
      storedTask.notes = storedTask.notes ? `${storedTask.notes}\nEscalated after ${attempts} attempts.` : `Escalated after ${attempts} attempts.`;
      storedTask.updated_at = new Date().toISOString();
      writeTaskStore(store);
      return { task: storedTask, status: "blocked" };
    }

    storedTask.updated_at = new Date().toISOString();
    writeTaskStore(store);
    return { task: storedTask, status: "ok" };
  });
}

function processTask(task, runnerId = "runner") {
  const claimed = claimTask(task.id, runnerId);
  if (!claimed) {
    return { skipped: true, reason: "unclaimable" };
  }

  const agentId = claimed.active_agent || claimed.target_agent || claimed.routed_agent || "coordinator";
  const handoff = buildHandoff(claimed, agentId, runnerId);
  const handoffPath = writeHandoffPacket(handoff);
  const inboxPath = deliverToInbox(agentId, handoff, handoffPath);
  recordClaimDiary(claimed, agentId, handoffPath, inboxPath);

  const invocation = invokeAgent({
    task: claimed,
    agentId,
    handoff,
    handoffPath,
    projectKey: projectKeyFromTask(claimed),
    projectName: projectLabel(claimed)
  });
  const retryPolicy = loadRetryPolicy(agentId);
  const outcome = applyInvocationResult(claimed, agentId, handoff, handoffPath, invocation, retryPolicy);
  archiveInboxPacket(agentId, inboxPath, outcome.status === "ok" ? "ok" : outcome.status, outcome.task);

  if (outcome.status === "retry") {
    recordRetryDiary(outcome.task, agentId, `Retry scheduled with backoff of ${retryPolicy.backoff_ms || 30000}ms.`, handoffPath);
  } else if (outcome.status === "blocked") {
    recordBlockDiary(outcome.task, agentId, "The task was escalated and paused.", handoffPath);
  }

  return outcome;
}

function claimableTasks() {
  return getTasks()
    .filter(taskIsClaimable)
    .filter((task) => !task.retry_after || new Date(task.retry_after).getTime() <= Date.now())
    .sort((a, b) => {
      const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 };
      const aRank = priorityRank[a.priority] ?? 2;
      const bRank = priorityRank[b.priority] ?? 2;
      if (aRank !== bRank) {
        return aRank - bRank;
      }
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });
}

function runOnce() {
  reconcileStaleClaims();
  const runnerConfig = loadRunnerConfig();
  const available = claimableTasks();
  const batch = available.slice(0, Math.max(1, Number(runnerConfig.max_concurrency) || 1));
  const results = [];
  for (const task of batch) {
    results.push(processTask(task));
  }
  return results;
}

async function runLoop({ once = false } = {}) {
  const runnerConfig = loadRunnerConfig();
  if (runnerConfig.resume_on_start !== false) {
    reconcileStaleClaims();
  }

  const pollInterval = Math.max(1000, Number(runnerConfig.poll_interval_ms) || 3000);
  while (true) {
    const available = claimableTasks();
    if (available.length === 0) {
      if (once) {
        return [];
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      continue;
    }

    const batch = available.slice(0, Math.max(1, Number(runnerConfig.max_concurrency) || 1));
    const results = [];
    for (const task of batch) {
      results.push(processTask(task));
    }

    if (once) {
      return results;
    }
  }
}

function describeStatus() {
  const tasks = getTasks();
  const counts = tasks.reduce((acc, task) => {
    acc[task.state || "unknown"] = (acc[task.state || "unknown"] || 0) + 1;
    return acc;
  }, {});
  return {
    runner_config: loadRunnerConfig(),
    counts,
    claimable: claimableTasks().map((task) => ({
      id: task.id,
      title: task.title,
      state: task.state,
      target_agent: task.target_agent,
      retry_after: task.retry_after || null
    })),
    inbox_root: INBOX_ROOT
  };
}

module.exports = {
  runOnce,
  runLoop,
  processTask,
  claimTask,
  reconcileStaleClaims,
  describeStatus,
  buildHandoff,
  claimableTasks
};

if (require.main === module) {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "start") {
    const once = rest.includes("--once");
    runLoop({ once })
      .then((results) => {
        console.log(JSON.stringify({ ok: true, results }, null, 2));
      })
      .catch((error) => {
        console.error(error.message);
        process.exit(1);
      });
    return;
  }

  if (command === "once") {
    try {
      const results = runOnce();
      console.log(JSON.stringify({ ok: true, results }, null, 2));
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
    return;
  }

  if (command === "status") {
    console.log(JSON.stringify(describeStatus(), null, 2));
    return;
  }

  if (command === "reconcile") {
    console.log(JSON.stringify({ ok: true, changed: reconcileStaleClaims() }, null, 2));
    return;
  }

  if (command === "test") {
    const results = [];
    const cp = require("child_process");
    const proc = cp.spawnSync("opencode", ["--version"], { encoding: "utf8", stdio: "pipe" });
    results.push({ check: "opencode command", ok: proc.status === 0, output: String(proc.stdout || proc.stderr || "").trim() });
    let inboxDirs = [];
    try { inboxDirs = fs.readdirSync(INBOX_ROOT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch (e) { inboxDirs = []; }
    results.push({ check: "inbox directories", ok: inboxDirs.length >= 7, output: `${inboxDirs.length} agent inboxes found: ${inboxDirs.join(", ")}` });
    const tasks = getTasks();
    results.push({ check: "task store", ok: true, output: `${tasks.length} tasks in store` });
    const allOk = results.every(r => r.ok);
    console.log(JSON.stringify({ ok: allOk, results }, null, 2));
    if (!allOk) { process.exit(1); }
    return;
  }

  console.log([
    "Usage:",
    "  node scripts/agent-runner.js start [--once]",
    "  node scripts/agent-runner.js once",
    "  node scripts/agent-runner.js status",
    "  node scripts/agent-runner.js reconcile",
    "  node scripts/agent-runner.js test"
  ].join("\n"));
}
