<#
.SYNOPSIS
  One-off setup of a Windows 10/11 machine for FH Match Centre, behind a Cloudflare Tunnel. Safe to run again.

.DESCRIPTION
  Install Node.js, Git, PostgreSQL and cloudflared first (the script says how if any are missing).
  Then, from a clone of the repository, in an administrator PowerShell:

    powershell -ExecutionPolicy Bypass -File deploy\windows\provision.ps1 -Repo https://github.com/OWNER/fh-watch.git

  Everything goes in C:\ProgramData\fh. The API, website and tunnel run as Windows services
  (via WinSW), each under its own low-privilege account.

.PARAMETER Repo
  Clone URL releases are deployed from. An HTTPS URL uses your own Git sign-in.

.PARAMETER SkipTunnel
  Set everything up except the Cloudflare Tunnel (run "fh tunnel" later).

.PARAMETER PgPort
  PostgreSQL's port, if it isn't the usual 5432.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $Repo,
  [switch] $SkipTunnel,
  [int] $PgPort = 5432
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3

$Here = $PSScriptRoot
$Deploy = Split-Path $Here -Parent
$Root = Join-Path $env:ProgramData 'fh'
$ServiceNames = 'fh-api', 'fh-web', 'fh-tunnel'
$WinswUrl = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW.NET461.exe'
$WinswSha256 = 'B5066B7BBDFBA1293E5D15CDA3CAAEA88FBEAB35BD5B38C41C913D492AADFC4F'
$PnpmVersion = '9.15.0'   # packageManager in package.json
$Admins = '*S-1-5-32-544'
$System = '*S-1-5-18'
$Users = '*S-1-5-32-545'

function Say([string] $Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Warn([string] $Message) { Write-Host "!! $Message" -ForegroundColor Yellow }

function Invoke-Native([string] $Exe, [string[]] $Arguments) {
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Exe $($Arguments -join ' ') failed (exit $LASTEXITCODE)." }
}

# Runs a program ignoring its error output (Windows PowerShell treats that as an error otherwise).
function Invoke-Quiet([string] $Exe, [string[]] $Arguments) {
  $saved = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & $Exe @Arguments 2>$null
    return @{ Code = $LASTEXITCODE; Out = "$out".Trim() }
  } finally {
    $ErrorActionPreference = $saved
  }
}

function Write-Utf8([string] $Path, [string] $Text) {
  [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding $false))
}

function New-Secret([int] $Bytes) {
  $buffer = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  return -join ($buffer | ForEach-Object { $_.ToString('x2') })
}

# Replaces KEY=... in an env file, or adds it.
function Set-EnvLine([string] $Path, [string] $Key, [string] $Value) {
  $text = [IO.File]::ReadAllText($Path)
  $line = "$Key=$Value"
  $pattern = "(?m)^$Key=.*$"
  if ($text -match $pattern) { $text = [regex]::Replace($text, $pattern, { param($m) $line }) }
  else { $text = $text.TrimEnd() + "`n$line`n" }
  Write-Utf8 $Path $text
}

# Lets one service's account read a file, and nobody else but administrators.
function Protect-File([string] $Path, [string] $Service) {
  Invoke-Native icacls.exe @($Path, '/inheritance:r', '/grant:r', "${Admins}:F", "${System}:F", "NT SERVICE\${Service}:R", '/Q')
}

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this from an administrator PowerShell (right-click PowerShell, Run as administrator).'
}

Say 'Checking the tools'
$missing = @()
$node = (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $node) {
  $missing += 'Node.js 22 or later:   winget install --id OpenJS.NodeJS.LTS'
} elseif ([int](& $node -p 'process.versions.node.split(".")[0]') -lt 22) {
  $missing += "Node.js 22 or later (found $(& $node --version)):   winget install --id OpenJS.NodeJS.LTS"
}
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { $missing += 'Git:   winget install --id Git.Git' }
$cloudflared = (Get-Command cloudflared.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $cloudflared) {
  foreach ($p in "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe", "$env:ProgramFiles\cloudflared\cloudflared.exe") {
    if (Test-Path $p) { $cloudflared = $p; break }
  }
}
if (-not $cloudflared) { $missing += 'cloudflared:   winget install --id Cloudflare.cloudflared' }
$psqlFile = Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
  Sort-Object { [int]($_.Directory.Parent.Name -replace '\D.*$', '') } -Descending | Select-Object -First 1
$pgService = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not $psqlFile -or -not $pgService) {
  $missing += 'PostgreSQL 16 or later:   https://www.postgresql.org/download/windows/ (keep the superuser password it asks for)'
}
if ($missing) {
  Write-Host "`nInstall these first, then open a NEW administrator PowerShell and run this again:"
  $missing | ForEach-Object { Write-Host "  $_" }
  exit 1
}
$psql = $psqlFile.FullName
$pgBin = $psqlFile.DirectoryName
Write-Host "Node $(& $node --version), $((Invoke-Quiet git.exe @('--version')).Out), PostgreSQL in $pgBin ($($pgService.Name)), $cloudflared"

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  if (Get-Command corepack -ErrorAction SilentlyContinue) { Invoke-Native corepack @('enable') }
  else { Invoke-Native npm @('install', '--global', "pnpm@$PnpmVersion") }
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Warn 'pnpm is installed but not on this window''s PATH yet. Open a new administrator PowerShell before running "fh deploy".'
  }
}

Say 'Windows long paths'
# Some packages' files are nested deeper than Windows' old 260-character limit.
Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1 -Type DWord

Say "Folders in $Root"
$folders = 'releases', 'bin', 'config', 'backups', 'services', 'ms-playwright', 'logs\api', 'logs\web', 'logs\tunnel',
  'logs\tasks', 'data\api\tmp', 'data\api\pdf', 'data\web\tmp', 'data\tunnel'
foreach ($f in $folders) { New-Item -ItemType Directory -Force -Path (Join-Path $Root $f) | Out-Null }
# Administrators and SYSTEM control everything; other accounts, the services among them, may only read.
Invoke-Native icacls.exe @($Root, '/inheritance:r', '/grant:r', "${Admins}:(OI)(CI)F", "${System}:(OI)(CI)F", "${Users}:(OI)(CI)RX", '/Q')
# Settings and backups: administrators and SYSTEM only (services get single files below).
foreach ($f in 'config', 'backups') {
  Invoke-Native icacls.exe @((Join-Path $Root $f), '/inheritance:r', '/grant:r', "${Admins}:(OI)(CI)F", "${System}:(OI)(CI)F", '/Q')
}

Say 'Database'
$config = Join-Path $Root 'config'
$apiEnv = Join-Path $config 'api.env'
$webEnv = Join-Path $config 'web.env'
$fhEnv = Join-Path $config 'fh.env'

# With settings already in place, the app's own role can say whether anything is missing.
$needSuperuser = $true
if (Test-Path $apiEnv) {
  $url = [Uri]((Select-String -Path $apiEnv -Pattern '^DATABASE_URL=(.*)$').Matches[0].Groups[1].Value)
  $env:PGPASSWORD = [Uri]::UnescapeDataString($url.UserInfo.Split(':', 2)[1])
  $check = Invoke-Quiet $psql @('--no-psqlrc', '-h', '127.0.0.1', '-p', "$PgPort", '-U', 'fh', '-d', 'fh', '-qtA', '-c',
    "select count(*) from pg_database where datname in ('fh', 'fh_restore_test')")
  if ($check.Code -eq 0 -and $check.Out -eq '2') { $needSuperuser = $false; Write-Host 'Database and settings already set up.' }
}
if ($needSuperuser) {
  $secure = Read-Host -AsSecureString "Password for PostgreSQL's 'postgres' superuser (chosen when PostgreSQL was installed)"
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  function Invoke-Psql([string] $Sql) {
    $out = & $psql --no-psqlrc -h 127.0.0.1 -p "$PgPort" -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA -c $Sql
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL refused: $Sql" }
    return "$out".Trim()
  }
  if (-not (Test-Path $apiEnv)) {
    # New secrets; the database role gets the new password whether or not it existed.
    $dbPassword = New-Secret 24
    if ((Invoke-Psql "select count(*) from pg_roles where rolname = 'fh'") -eq '1') {
      Invoke-Psql "alter role fh with login password '$dbPassword'" | Out-Null
    } else {
      Invoke-Psql "create role fh with login password '$dbPassword'" | Out-Null
    }
    $text = [IO.File]::ReadAllText((Join-Path $Deploy 'env\api.env'))
    $text = $text.Replace('__DB_PASSWORD__', $dbPassword).Replace('__DB_PORT__', "$PgPort").Replace('__JWT_SECRET__', (New-Secret 48))
    $text = $text.Replace('__PDF_CACHE_DIR__', "$Root\data\api\pdf").Replace('__PLAYWRIGHT_DIR__', "$Root\ms-playwright")
    Write-Utf8 $apiEnv $text
    Remove-Variable dbPassword, text
  }
  # The live database, and a scratch one of the same owner for the weekly restore test.
  foreach ($db in 'fh', 'fh_restore_test') {
    if ((Invoke-Psql "select count(*) from pg_database where datname = '$db'") -ne '1') {
      Invoke-Psql "create database $db owner fh" | Out-Null
      Write-Host "Created database $db."
    }
  }
  if ((Invoke-Psql 'show listen_addresses') -notmatch '^(localhost|127\.0\.0\.1|::1|,|\s)+$') {
    $dataDir = Invoke-Psql 'show data_directory'
    Warn "PostgreSQL accepts connections from other computers. Unless you need that, set listen_addresses = 'localhost' in $dataDir\postgresql.conf and restart the $($pgService.Name) service."
  }
}
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

Say 'Settings'
if (-not (Test-Path $webEnv)) { Copy-Item (Join-Path $Deploy 'env\web.env') $webEnv }
if (-not (Test-Path (Join-Path $config 'rclone.conf'))) { New-Item -ItemType File (Join-Path $config 'rclone.conf') | Out-Null }
if (-not (Test-Path $fhEnv)) {
  $text = [IO.File]::ReadAllText((Join-Path $Deploy 'env\fh.env'))
  Write-Utf8 $fhEnv $text.Replace('__RCLONE_CONFIG__', "$config\rclone.conf").Replace('__REPO_URL__', '').Replace('__PG_BIN__', '').Replace('__CLOUDFLARED__', '')
}
Set-EnvLine $fhEnv 'REPO_URL' $Repo
Set-EnvLine $fhEnv 'PG_BIN' $pgBin
Set-EnvLine $fhEnv 'CLOUDFLARED' $cloudflared
Write-Host "Settings are in $config."

Say 'The fh command'
Copy-Item (Join-Path $Deploy 'fh.mjs') (Join-Path $Root 'bin\fh.mjs') -Force
Copy-Item (Join-Path $Here 'fh.cmd') (Join-Path $Root 'bin\fh.cmd') -Force
$machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
if (($machinePath -split ';') -notcontains "$Root\bin") {
  [Environment]::SetEnvironmentVariable('Path', "$($machinePath.TrimEnd(';'));$Root\bin", 'Machine')
}
if (($env:Path -split ';') -notcontains "$Root\bin") { $env:Path += ";$Root\bin" }
Write-Host 'Run "fh" from any administrator PowerShell.'

Say 'Services'
$winsw = Join-Path $Root 'services\WinSW.exe'
if (-not (Test-Path $winsw) -or (Get-FileHash $winsw -Algorithm SHA256).Hash -ne $WinswSha256) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $WinswUrl -OutFile $winsw -UseBasicParsing
  if ((Get-FileHash $winsw -Algorithm SHA256).Hash -ne $WinswSha256) {
    Remove-Item $winsw
    throw 'The WinSW download did not match its expected checksum.'
  }
}
foreach ($svc in $ServiceNames) {
  $exe = Join-Path $Root "services\$svc.exe"
  $xml = [IO.File]::ReadAllText((Join-Path $Here "services\$svc.xml"))
  Write-Utf8 (Join-Path $Root "services\$svc.xml") $xml.Replace('__ROOT__', $Root).Replace('__NODE__', $node).Replace('__CLOUDFLARED__', $cloudflared)
  $existing = Get-Service -Name $svc -ErrorAction SilentlyContinue
  if (-not (Test-Path $exe) -or (Get-FileHash $exe -Algorithm SHA256).Hash -ne $WinswSha256) {
    if ($existing -and $existing.Status -ne 'Stopped') { Stop-Service -Name $svc -Force }
    Copy-Item $winsw $exe -Force
  }
  if (-not $existing) { Invoke-Native $exe @('install') }
  # Its own virtual account (NT SERVICE\fh-api and so on), started once Windows has settled after boot.
  Invoke-Native sc.exe @('config', $svc, 'obj=', "NT SERVICE\$svc", 'start=', 'delayed-auto') | Out-Null
  Invoke-Native sc.exe @('failure', $svc, 'reset=', '3600', 'actions=', 'restart/5000/restart/5000/restart/30000') | Out-Null
}
Invoke-Native sc.exe @('config', 'fh-api', 'depend=', $pgService.Name) | Out-Null

# Each service may read the app, write its own logs and data, and read its own settings.
foreach ($svc in $ServiceNames) {
  $short = $svc -replace '^fh-', ''
  Invoke-Native icacls.exe @($Root, '/grant', "NT SERVICE\${svc}:(OI)(CI)RX", '/Q')
  foreach ($f in "logs\$short", "data\$short") {
    Invoke-Native icacls.exe @((Join-Path $Root $f), '/grant', "NT SERVICE\${svc}:(OI)(CI)M", '/Q')
  }
}
Protect-File $apiEnv 'fh-api'
Protect-File $webEnv 'fh-web'
foreach ($f in 'tunnel.json', 'tunnel.yml') {
  if (Test-Path (Join-Path $config $f)) { Protect-File (Join-Path $config $f) 'fh-tunnel' }
}
Write-Host 'fh-api, fh-web and fh-tunnel are installed.'

Say 'Backup schedule'
$fhm = Join-Path $Root 'bin\fh.mjs'
function Register-FhTask([string] $Name, [string] $Command, $Trigger) {
  $log = "$Root\logs\tasks\$Command.log"
  $action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/d /c `"`"$node`" `"$fhm`" $Command >> `"$log`" 2>&1`""
  $runAs = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  # Runs as soon as it can if the machine was off at the time.
  $options = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)
  Register-ScheduledTask -TaskPath '\FH Match Centre\' -TaskName $Name -Action $action -Trigger $Trigger `
    -Principal $runAs -Settings $options -Force | Out-Null
}
Register-FhTask 'Backup' 'backup' (New-ScheduledTaskTrigger -Daily -At '03:15')
Register-FhTask 'Restore test' 'restore-test' (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '04:30')
Write-Host "Nightly backup at 03:15 and a weekly restore test, in Task Scheduler under 'FH Match Centre'."

Say 'Never sleep on mains power'
Invoke-Native powercfg.exe @('/change', 'standby-timeout-ac', '0')
Invoke-Native powercfg.exe @('/change', 'hibernate-timeout-ac', '0')
Write-Host 'The site is down whenever this machine sleeps, so sleep and hibernate on mains power are now off.'

if (Test-Path (Join-Path $Root 'current')) {
  Say 'Restarting the API and website'
  Restart-Service -Name 'fh-api', 'fh-web' -Force
}

if (Test-Path (Join-Path $config 'tunnel.yml')) {
  Say 'Cloudflare Tunnel'
  Write-Host 'Already set up. Run "fh tunnel" again to reconnect it or repair the DNS records.'
  Restart-Service -Name 'fh-tunnel' -Force
} elseif (-not $SkipTunnel) {
  & $node $fhm tunnel
  if ($LASTEXITCODE -ne 0) { Warn 'The tunnel is not set up yet. Fix the problem above, then run: fh tunnel' }
}

Say 'Done'
Write-Host @"

Next steps, in an administrator PowerShell:
  1. Deploy a release:   fh deploy <tag or branch>
     (the first time, Git may ask you to sign in to GitHub)
  2. Register on the website, then make yourself admin:
                         fh admin you@example.com --verify
  3. Add SMTP details to $apiEnv when you have them, then: Restart-Service fh-api

See docs\deployment.md for the full runbook.
"@
