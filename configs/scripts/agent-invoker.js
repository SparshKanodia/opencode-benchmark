#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  appendDiaryEntry,
  projectKeyFromTask,
  projectNameFromTask
} = require("./agent-diary");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_DIR = path.join(ROOT, "configs");
const PROMPT_DIR = path.join(ROOT, "prompts", "agents");
const AGENT_DIR = path.join(ROOT, "agents");

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

function loadAgentRegistry() {
  return readJson(path.join(CONFIG_DIR, "agent-registry.json"), { agents: {} });
}

function loadAgentConfig(agentId) {
  const registry = loadAgentRegistry();
  return registry.agents?.[agentId] || {
    id: agentId,
    name: agentId,
    model: "deepseek-ai/deepseek-v4",
    prompt: null,
    profile: null
  };
}

function loadTaskAgentFiles(agentId) {
  const config = loadAgentConfig(agentId);
  const profilePath = config.profile ? path.resolve(ROOT, config.profile) : path.join(AGENT_DIR, agentId, "profile.md");
  const promptPath = config.prompt ? path.resolve(ROOT, config.prompt) : path.join(PROMPT_DIR, `${agentId}.md`);
  return {
    profilePath,
    promptPath,
    profile: readText(profilePath),
    prompt: readText(promptPath)
  };
}

function loadRunnerConfig() {
  return readJson(path.join(CONFIG_DIR, "runner-config.json"), {
    opencode: { command: "opencode", format: "default" },
    dry_run_fallback: true,
    force_fallback: false
  });
}

function loadRetryPolicy(agentId) {
  const policies = readJson(path.join(CONFIG_DIR, "retry-policies.json"), { default: { max_attempts: 2, backoff_ms: 30000 } });
  return {
    ...policies.default,
    ...(policies.agents?.[agentId] || {})
  };
}

function loadOrchestratorConfig() {
  return readJson(path.join(CONFIG_DIR, "orchestration.json"), {});
}

function readTaskStore() {
  return readJson(path.join(ROOT, "state", "tasks.json"), { version: 1, tasks: [] });
}

function buildFallbackTransition(agentId, task) {
  const fallbackMap = {
    research: "pm",
    pm: "architect",
    architect: "backend",
    backend: "reviewer",
    frontend: "reviewer",
    reviewer: "qa",
    qa: "docs",
    docs: "coordinator",
    coordinator: null
  };

  const nextAgent = fallbackMap[agentId] || null;
  if (!nextAgent) {
    return {
      next_agent: null,
      next_state: "done",
      summary: `Completed ${task.id}`,
      reasoning: [`No downstream agent was selected for ${agentId}.`],
      actions: ["Archived the task as complete."],
      artifacts: [],
      decisions: ["Closed the task without further delegation."],
      next_steps: []
    };
  }

  return {
    next_agent: nextAgent,
    next_state: nextAgent === "reviewer" || nextAgent === "qa" ? "queued" : "queued",
    summary: `Prepared ${task.id} for ${nextAgent}.`,
    reasoning: [
      `${agentId} is the owning specialist for the current phase.`,
      `The next hop is routed to ${nextAgent} to keep the handoff chain bounded.`
    ],
    actions: [
      `Organized the task context for ${nextAgent}.`,
      "Recorded the work in the project diary."
    ],
    artifacts: [],
    decisions: [`Delegate follow-up work to ${nextAgent}.`],
    next_steps: [`Have ${nextAgent} continue the task.`]
  };
}

function extractStructuredObject(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return null;
  }

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], trimmed];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) {
      continue;
    }
    const maybeJson = candidate.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(maybeJson);
    } catch {
      continue;
    }
  }

  return null;
}

function buildPrompt({ agentId, task, handoff, promptTemplate, agentProfile }) {
  const taskContext = {
    task_id: task.id,
    title: task.title,
    intent: task.intent,
    summary: task.summary,
    state: task.state,
    priority: task.priority,
    source_agent: handoff.source_agent,
    target_agent: handoff.target_agent,
    project: handoff.project_name,
    project_key: handoff.project_key,
    chain: handoff.chain || [],
    artifacts: handoff.artifacts || []
  };

  return [
    `You are the ${agentId} agent for the OpenCode autonomous workspace.`,
    `Work only on the task below.`,
    "",
    "Task context:",
    JSON.stringify(taskContext, null, 2),
    "",
    "Handoff packet:",
    JSON.stringify(handoff, null, 2),
    "",
    "Role guidance:",
    agentProfile ? agentProfile.trim() : "",
    "",
    "Prompt template:",
    promptTemplate ? promptTemplate.trim() : "",
    "",
    "Output contract:",
    "Return valid JSON only.",
    "Schema:",
    JSON.stringify({
      summary: "short plain-language summary of what was done",
      reasoning: ["why each major step was taken"],
      actions: ["ordered list of actions taken"],
      artifacts: ["paths or artifact descriptions"],
      decisions: ["important decisions made"],
      next_state: "queued | blocked | needs_review | verified | done",
      next_agent: "agent id or null",
      next_steps: ["what should happen next"],
      diary: {
        summary: "diary summary",
        reasoning: ["diary reasoning"],
        actions: ["diary actions"],
        artifacts: ["diary artifacts"],
        decisions: ["diary decisions"],
        next_steps: ["diary next steps"]
      }
    }, null, 2),
    "",
    "Constraints:",
    "- Keep handoff context bounded.",
    "- Respect file safety and approval gates.",
    "- Do not include markdown fences unless they are inside the JSON string values.",
    "- If blocked, set next_state to blocked and explain why."
  ].filter(Boolean).join("\n");
}

function runOpencodeInvocation({ agentId, task, handoff, handoffPath }) {
  const runnerConfig = loadRunnerConfig();
  const fallbackMode = runnerConfig.fallback_mode || "smart";
  if (fallbackMode === "always" || process.env.OPENCODE_RUNNER_FORCE_FALLBACK === "1") {
    return {
      mode: "dry-run",
      command: null,
      args: [],
      exit_code: 0,
      signal: null,
      stdout: "",
      stderr: "Fallback forced by runner configuration.",
      structured: null,
      ok: false
    };
  }

  const agentFiles = loadTaskAgentFiles(agentId);
  const opencodeCommand = runnerConfig.opencode?.command || "opencode";
  const prompt = buildPrompt({
    agentId,
    task,
    handoff,
    promptTemplate: agentFiles.prompt,
    agentProfile: agentFiles.profile
  });

  const args = [
    "run",
    "--agent",
    agentId,
    "--title",
    task.title || task.intent || task.id,
    "--file",
    handoffPath,
    prompt
  ];

  const proc = spawnSync(opencodeCommand, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: process.env,
    shell: false
  });

  const stdout = String(proc.stdout || "");
  const stderr = String(proc.stderr || "");
  const structured = extractStructuredObject(stdout);

  return {
    mode: "opencode",
    command: opencodeCommand,
    args,
    exit_code: proc.status,
    signal: proc.signal || null,
    stdout,
    stderr,
    structured,
    ok: proc.status === 0 && Boolean(structured)
  };
}

function synthesizeFallbackInvocation({ agentId, task, handoff }) {
  const fallback = buildFallbackTransition(agentId, task);
  return {
    mode: "fallback",
    command: null,
    args: [],
    exit_code: 0,
    signal: null,
    stdout: JSON.stringify(fallback, null, 2),
    stderr: "",
    structured: fallback,
    ok: true
  };
}

function normalizeInvocationResult(result, { agentId, task, handoff }) {
  const structured = result.structured || {};
  const fallback = buildFallbackTransition(agentId, task);
  const nextAgent = structured.next_agent ?? fallback.next_agent ?? null;
  const nextState = structured.next_state || fallback.next_state || (nextAgent ? "queued" : "done");
  const reasoning = normalizeArray(structured.reasoning || fallback.reasoning);
  const actions = normalizeArray(structured.actions || fallback.actions);
  const decisions = normalizeArray(structured.decisions || fallback.decisions);
  const nextSteps = normalizeArray(structured.next_steps || fallback.next_steps);
  const artifacts = normalizeArtifacts(structured.artifacts || fallback.artifacts);
  const diary = structured.diary && typeof structured.diary === "object"
    ? structured.diary
    : {
        summary: structured.summary || fallback.summary,
        reasoning,
        actions,
        artifacts,
        decisions,
        next_steps: nextSteps
      };

  return {
    ...result,
    structured: {
      summary: structured.summary || fallback.summary,
      reasoning,
      actions,
      artifacts,
      decisions,
      next_state: nextState,
      next_agent: nextAgent,
      next_steps: nextSteps,
      diary
    }
  };
}

function invokeAgent(options) {
  const runnerConfig = loadRunnerConfig();
  const base = runOpencodeInvocation(options);
  const fallbackMode = runnerConfig.fallback_mode || "smart";
  const result = base.ok ? base : (fallbackMode === "never" ? base : synthesizeFallbackInvocation(options));
  const normalized = normalizeInvocationResult(result, options);

  const diarySource = normalized.mode === "opencode" ? "opencode-run" : "fallback-run";
  const diaryPayload = normalized.structured.diary || {};
  const diaryRecord = appendDiaryEntry({
    task: options.task,
    agentId: options.agentId,
    source: diarySource,
    entry: {
      title: diaryPayload.summary || normalized.structured.summary || options.task.title || options.task.id,
      summary: diaryPayload.summary || normalized.structured.summary || options.task.summary || "",
      reasoning: diaryPayload.reasoning || normalized.structured.reasoning,
      actions: diaryPayload.actions || normalized.structured.actions,
      artifacts: diaryPayload.artifacts || normalized.structured.artifacts,
      decisions: diaryPayload.decisions || normalized.structured.decisions,
      next_steps: diaryPayload.next_steps || normalized.structured.next_steps,
      project_key: options.projectKey,
      project_name: options.projectName
    }
  });

  return {
    ...normalized,
    diary: diaryRecord
  };
}

if (require.main === module) {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== "run") {
    console.log("Usage: node scripts/agent-invoker.js run <task-id> <agent-id>");
    process.exit(0);
  }

  const [taskId, agentId] = rest;
  const tasks = readTaskStore();
  const task = tasks.tasks?.find((item) => item.id === taskId);
  if (!task) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  const projectKey = projectKeyFromTask(task);
  const projectName = projectNameFromTask(task);
  const handoff = {
    task_id: task.id,
    source_agent: task.source_agent || "coordinator",
    target_agent: agentId || task.target_agent || task.routed_agent || "coordinator",
    intent: task.intent || task.title,
    summary: task.summary || "",
    artifacts: task.artifacts || [],
    state: task.state || "new",
    priority: task.priority || "normal",
    timestamp: new Date().toISOString(),
    project_key: projectKey,
    project_name: projectName,
    chain: task.chain || []
  };
  const handoffPath = path.join(ROOT, "state", "handoffs", `${task.id}-manual-${agentId || "agent"}.json`);
  writeJson(handoffPath, handoff);
  const result = invokeAgent({
    task,
    agentId: agentId || task.target_agent || task.routed_agent || "coordinator",
    handoff,
    handoffPath,
    projectKey,
    projectName
  });
  console.log(JSON.stringify(result, null, 2));
} else {
  module.exports = {
    invokeAgent,
    buildPrompt,
    extractStructuredObject,
    normalizeInvocationResult,
    synthesizeFallbackInvocation,
    runOpencodeInvocation
  };
}
