$ErrorActionPreference = 'Stop'

if ($PSScriptRoot) { $root = Join-Path $PSScriptRoot ".." } else { $root = (Get-Location).Path }
$server = Join-Path $root 'portal\server.mjs'
$url = 'http://127.0.0.1:8787'

$process = Start-Process -FilePath 'node' -ArgumentList @($server) -WorkingDirectory $root -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2
Start-Process $url | Out-Null
Write-Host "OpenCode browser portal started on $url (PID $($process.Id))"
