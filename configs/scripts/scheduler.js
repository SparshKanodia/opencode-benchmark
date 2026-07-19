#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ORCHESTRATOR = path.join(ROOT, "scripts", "orchestrator.js");
const SCHEDULE_PATH = path.join(ROOT, "configs", "schedule.json");
const LAST_RUN_PATH = path.join(ROOT, "state", ".scheduler-last-run.json");

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch { return fallback; }
}

function writeJson(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function parseCronExpression(expr) {
  const parts = String(expr || "").trim().split(/\s+/);
  if (parts.length !== 5) { return null; }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

function cronFieldMatches(value, current) {
  if (value === "*") { return true; }
  if (value.includes(",")) { return value.split(",").some(v => cronFieldMatches(v.trim(), current)); }
  if (value.includes("*/")) {
    const step = parseInt(value.replace("*/", ""), 10);
    return step > 0 && current % step === 0;
  }
  if (value.includes("-")) {
    const [low, high] = value.split("-").map(v => parseInt(v, 10));
    return current >= low && current <= high;
  }
  return parseInt(value, 10) === current;
}

function cronMatches(parsed, date) {
  if (!parsed) { return false; }
  return cronFieldMatches(parsed.minute, date.getMinutes())
    && cronFieldMatches(parsed.hour, date.getHours())
    && cronFieldMatches(parsed.dayOfMonth, date.getDate())
    && cronFieldMatches(parsed.month, date.getMonth() + 1)
    && cronFieldMatches(parsed.dayOfWeek, date.getDay());
}

function loadSchedule() {
  return readJson(SCHEDULE_PATH, { enabled: false, jobs: [] });
}

function loadLastRun() {
  return readJson(LAST_RUN_PATH, { runs: {} });
}

function saveLastRun(jobName, timestamp) {
  const state = loadLastRun();
  state.runs[jobName] = String(timestamp);
  writeJson(LAST_RUN_PATH, state);
}

function getLastRun(jobName) {
  const state = loadLastRun();
  return state.runs[jobName] ? new Date(state.runs[jobName]) : null;
}

function createTask(title, summary) {
  const args = ["task", "new", title, summary];
  const result = spawnSync("node", [ORCHESTRATOR, ...args], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) { throw new Error(`Failed to create task: ${result.stderr}`); }
  return JSON.parse(result.stdout);
}

function checkAndRunJobs() {
  const schedule = loadSchedule();
  if (!schedule.enabled) { return { skipped: true, reason: "Scheduler is disabled." }; }
  const now = new Date();
  const triggered = [];
  for (const job of (schedule.jobs || [])) {
    if (!job.enabled) { continue; }
    const parsed = parseCronExpression(job.schedule);
    if (!parsed) { continue; }
    if (!cronMatches(parsed, now)) { continue; }
    const lastRun = getLastRun(job.name);
    if (lastRun && (now.getTime() - lastRun.getTime()) < 60000) { continue; }
    try {
      const task = createTask(job.title, job.summary);
      saveLastRun(job.name, now.toISOString());
      triggered.push({ job: job.name, task_id: task.id });
    } catch (error) {
      triggered.push({ job: job.name, error: error.message });
    }
  }
  return { ok: true, checked_at: now.toISOString(), triggered };
}

async function runLoop({ once = false } = {}) {
  if (once) { return checkAndRunJobs(); }
  const schedule = loadSchedule();
  const interval = Math.max(30000, (schedule.poll_interval_seconds || 60) * 1000);
  while (true) {
    try {
      const result = checkAndRunJobs();
      if (result.triggered && result.triggered.length > 0) {
        console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...result }));
      }
    } catch (error) {
      console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: error.message }));
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

if (require.main === module) {
  const [command] = process.argv.slice(2);
  if (command === "once") {
    const result = checkAndRunJobs();
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "start") {
    runLoop().catch(e => { console.error(e.message); process.exit(1); });
  } else {
    console.log("Usage: node scripts/scheduler.js start | once");
  }
}

module.exports = { checkAndRunJobs, cronMatches, parseCronExpression, runLoop };