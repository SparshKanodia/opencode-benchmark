#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Initializes GitHub environment variables from the existing gh CLI auth token.
.DESCRIPTION
  Extracts the gh CLI authentication token and exports it as GITHUB_TOKEN,
  GH_TOKEN, and attempts to configure GITHUB_MCP_TOKEN (for the GitHub Copilot MCP).
  Run this once per session before starting OpenCode.
#>

$ErrorActionPreference = "Stop"

# ── 1. Get existing gh auth token ──────────────────────────────────────
try {
  $ghToken = gh auth token 2>&1 | Out-String | ForEach-Object { $_.Trim() }
  if (-not $ghToken -or $ghToken -match "^gh:") {
    Write-Warning "gh CLI is not authenticated. Run 'gh auth login' first."
    exit 1
  }
  Write-Host "✓ gh CLI authenticated" -ForegroundColor Green
} catch {
  Write-Error "Failed to get gh auth token. Is gh CLI installed?"
  exit 1
}

# ── 2. Set GITHUB_TOKEN ───────────────────────────────────────────────
$env:GITHUB_TOKEN = $ghToken
[System.Environment]::SetEnvironmentVariable("GITHUB_TOKEN", $ghToken, "User")
Write-Host "✓ GITHUB_TOKEN set (${($ghToken.Substring(0,10))}...)" -ForegroundColor Green

# ── 3. Set GH_TOKEN (for gh CLI consistency) ──────────────────────────
$env:GH_TOKEN = $ghToken
[System.Environment]::SetEnvironmentVariable("GH_TOKEN", $ghToken, "User")
Write-Host "✓ GH_TOKEN set" -ForegroundColor Green

# ── 4. GITHUB_MCP_TOKEN ───────────────────────────────────────────────
# The GitHub Copilot MCP (api.githubcopilot.com/mcp) requires a copilot-scoped
# token. The standard gh OAuth token may not work. If GITHUB_MCP_TOKEN is
# already set, use it. Otherwise, try the gh token (it works for some users).
if (-not $env:GITHUB_MCP_TOKEN) {
  $env:GITHUB_MCP_TOKEN = $ghToken
  Write-Host "ℹ GITHUB_MCP_TOKEN set to gh token (may need Copilot token for full MCP)" -ForegroundColor Yellow
} else {
  Write-Host "✓ GITHUB_MCP_TOKEN already set" -ForegroundColor Green
}

# ── 5. Verify connectivity ────────────────────────────────────────────
try {
  $user = gh api /user --jq '.login' 2>&1
  Write-Host "✓ GitHub API reachable as $user" -ForegroundColor Green
} catch {
  Write-Warning "GitHub API check failed: $_"
}

# ── 6. Summary ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " GitHub Environment Initialized" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " User:      $((gh api /user --jq '.login' 2>$null) 2>$null)"
Write-Host " Token set: GITHUB_TOKEN, GH_TOKEN, GITHUB_MCP_TOKEN"
Write-Host " Status:    Ready for OpenCode multi-agent GitHub ops"
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "To make these persist across sessions, run:" -ForegroundColor Cyan
Write-Host "  & '.\scripts\install-github-token.ps1'" -ForegroundColor Gray