#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Permanently stores the gh CLI GitHub token for OpenCode sessions.
.DESCRIPTION
  Extracts the gh CLI auth token and persists it as machine-level environment
  variables so OpenCode multi-agent sessions have GitHub access automatically.
  Run this ONCE to make tokens permanent.
#>

$ErrorActionPreference = "Stop"

Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " Installing GitHub Tokens for OpenCode" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan

# ── 1. Get gh token ───────────────────────────────────────────────────
try {
  $ghToken = gh auth token 2>&1 | Out-String | ForEach-Object { $_.Trim() }
  if (-not $ghToken -or $ghToken -match "^gh:") {
    Write-Error "gh CLI is not authenticated. Run 'gh auth login' first."
    exit 1
  }
} catch {
  Write-Error "gh CLI not found. Install from: https://cli.github.com/"
  exit 1
}

Write-Host "✓ Authenticated as: $((gh api /user --jq '.login' 2>$null) 2>$null)" -ForegroundColor Green

# ── 2. Install GITHUB_TOKEN (machine-level, persistent) ───────────────
[System.Environment]::SetEnvironmentVariable("GITHUB_TOKEN", $ghToken, "Machine")
Write-Host "✓ GITHUB_TOKEN installed (machine-level)" -ForegroundColor Green

# ── 3. Install GH_TOKEN ───────────────────────────────────────────────
[System.Environment]::SetEnvironmentVariable("GH_TOKEN", $ghToken, "Machine")
Write-Host "✓ GH_TOKEN installed (machine-level)" -ForegroundColor Green

# ── 4. Install GITHUB_MCP_TOKEN ───────────────────────────────────────
# Note: The Copilot MCP may need a different token. This uses the gh token
# as the best available option. If the MCP doesn't work, generate a GitHub
# PAT (classic) with repo, workflow scopes and set it manually.
[System.Environment]::SetEnvironmentVariable("GITHUB_MCP_TOKEN", $ghToken, "Machine")
Write-Host "✓ GITHUB_MCP_TOKEN installed (machine-level)" -ForegroundColor Green

Write-Host ""
Write-Host "───────────────────────────────────────────" -ForegroundColor Cyan
Write-Host " INSTALLATION COMPLETE" -ForegroundColor Cyan
Write-Host "───────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ""
Write-Host "Environment variables set at Machine scope." -ForegroundColor Cyan
Write-Host "You may need to restart your terminal / VS Code for them to take effect." -ForegroundColor Yellow
Write-Host ""
Write-Host "To verify after restart:" -ForegroundColor Cyan
Write-Host '  echo $env:GITHUB_TOKEN' -ForegroundColor Gray
Write-Host ""