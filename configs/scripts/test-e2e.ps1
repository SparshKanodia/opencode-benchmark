# Phase 1 End-to-End Test
# Run from repository root

$ErrorActionPreference = "Continue"
if ($PSScriptRoot) { $ROOT = Join-Path $PSScriptRoot ".." } else { $ROOT = (Get-Location).Path }
Set-Location $ROOT

Write-Host "=== Phase 1 E2E Test ===" -ForegroundColor Cyan

# 1. Initialize
Write-Host "[1/5] Initializing state store..." -ForegroundColor Yellow
node scripts/orchestrator.js init
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED" -ForegroundColor Red; exit 1 }

# 2. Initialize inboxes
Write-Host "[2/5] Initializing inbox directories..." -ForegroundColor Yellow
node scripts/orchestrator.js init-inboxes
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED" -ForegroundColor Red; exit 1 }

# 3. Initialize logs
Write-Host "[3/5] Initializing log files..." -ForegroundColor Yellow
node scripts/orchestrator.js init-logs
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED" -ForegroundColor Red; exit 1 }

# 4. Create test task
Write-Host "[4/5] Creating test task..." -ForegroundColor Yellow
$result = node scripts/orchestrator.js task new "E2E Phase 1 Test" "Automated test of complete orchestration pipeline"
$taskId = ($result | ConvertFrom-Json).id
Write-Host "  Task ID: $taskId" -ForegroundColor Gray

# 5. Run single pass
Write-Host "[5/5] Running agent runner (single pass)..." -ForegroundColor Yellow
$runnerResult = node scripts/agent-runner.js once
$exitOk = $LASTEXITCODE -eq 0

# Show results
Write-Host "=== Results ===" -ForegroundColor Cyan
Write-Host "Runner exit code: $LASTEXITCODE" -ForegroundColor $(if ($exitOk) { "Green" } else { "Red" })
$taskList = node scripts/orchestrator.js task list
Write-Host "Task state: $taskList" -ForegroundColor Gray

if (-not $exitOk) {
    Write-Host "Runner reported issues - check state and handoff dirs" -ForegroundColor Yellow
    Write-Host "  state/handoffs/:" -ForegroundColor Gray
    Get-ChildItem -Path "$ROOT\state\handoffs" -Name | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
    Write-Host "  state/diaries/:" -ForegroundColor Gray
    Get-ChildItem -Path "$ROOT\state\diaries" -Name | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
}

Write-Host "=== E2E Test Complete ===" -ForegroundColor Cyan