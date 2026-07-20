$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$ExtensionId = 'kodpauza.kodpauza-vscode'
$BaseUrl = if ($env:KODPAUZA_BASE_URL) { $env:KODPAUZA_BASE_URL.TrimEnd('/') } else { 'https://kodpauza.ru' }
$VsixUrl = "$BaseUrl/downloads/kodpauza.vsix"
$ChecksumUrl = "$BaseUrl/downloads/kodpauza-vsix.sha256"
$VersionUrl = "$BaseUrl/downloads/kodpauza-version.txt"
$KodpauzaHome = if ($env:KODPAUZA_HOME) { $env:KODPAUZA_HOME } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.kodpauza' }
$InstallSourceDirectory = Join-Path $KodpauzaHome 'install-sources'
$UpdateCacheDirectory = Join-Path $KodpauzaHome 'update-cache'
$EditorFilter = if ($env:KODPAUZA_EDITOR) { $env:KODPAUZA_EDITOR.ToLowerInvariant() } else { 'all' }
$Action = if ($env:KODPAUZA_ACTION -eq 'uninstall') { 'uninstall' } else { 'install' }
$DryRun = $env:KODPAUZA_DRY_RUN -eq '1'
$TempDirectory = $null
$VsixPath = $null
$FoundCount = 0
$SuccessCount = 0

function Write-Info([string]$Message) { Write-Host "→ $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "✓ $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "! $Message" -ForegroundColor Yellow }
function Write-Failure([string]$Message) { Write-Host "✕ $Message" -ForegroundColor Red }

function Resolve-Editor([string[]]$Commands, [string[]]$Candidates) {
  foreach ($Command in $Commands) {
    $Found = Get-Command $Command -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($Found) { return $Found.Source }
  }
  foreach ($Candidate in $Candidates) {
    if ($Candidate -and (Test-Path -LiteralPath $Candidate -PathType Leaf)) {
      return $Candidate
    }
  }
  return $null
}

function Get-InstalledVersion([string]$Cli) {
  $Lines = & $Cli --list-extensions --show-versions 2>$null
  foreach ($Line in $Lines) {
    if ($Line -match "^$([regex]::Escape($ExtensionId))@(.+)$") { return $Matches[1] }
  }
  return $null
}

function Test-VersionAtLeast([string]$Current, [string]$Required) {
  if ($Current -notmatch '^\d+\.\d+\.\d+$' -or $Required -notmatch '^\d+\.\d+\.\d+$') {
    return $false
  }
  return [version]$Current -ge [version]$Required
}

function Get-ExpectedVersion {
  try {
    $Value = (Invoke-RestMethod -Uri $VersionUrl -TimeoutSec 10).ToString().Trim()
    if ($Value -match '^\d+\.\d+\.\d+$') { return $Value }
  } catch {
    return $null
  }
  return $null
}

function Get-VerifiedVsix {
  if ($script:VsixPath -and (Test-Path -LiteralPath $script:VsixPath)) { return $script:VsixPath }
  $script:TempDirectory = Join-Path ([IO.Path]::GetTempPath()) ("kodpauza-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $script:TempDirectory | Out-Null
  $script:VsixPath = Join-Path $script:TempDirectory 'kodpauza.vsix'
  Write-Info 'Магазин недоступен. Загружаю проверенный VSIX с kodpauza.ru…'
  Invoke-WebRequest -UseBasicParsing -Uri $VsixUrl -OutFile $script:VsixPath -TimeoutSec 120
  $ChecksumResponse = (Invoke-WebRequest -UseBasicParsing -Uri $ChecksumUrl -TimeoutSec 20).Content.Trim()
  $Expected = ($ChecksumResponse -split '\s+')[0].ToLowerInvariant()
  $Actual = (Get-FileHash -LiteralPath $script:VsixPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Expected -notmatch '^[a-f0-9]{64}$' -or $Expected -ne $Actual) {
    throw 'Контрольная сумма VSIX не совпала. Установка остановлена.'
  }
  Write-Ok ("Целостность VSIX подтверждена: " + $Actual.Substring(0, 16) + '…')
  return $script:VsixPath
}

function Set-FallbackMarker([string]$Key) {
  New-Item -ItemType Directory -Path $InstallSourceDirectory -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $InstallSourceDirectory "$Key.vsix") -Value 'vsix' -Encoding ascii
}

function Save-FallbackPackage([string]$Version) {
  if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Не удалось определить версию VSIX.' }
  New-Item -ItemType Directory -Path $UpdateCacheDirectory -Force | Out-Null
  $Cached = Join-Path $UpdateCacheDirectory "kodpauza-$Version.vsix"
  $Temporary = "$Cached.tmp"
  Copy-Item -LiteralPath $script:VsixPath -Destination $Temporary -Force
  Move-Item -LiteralPath $Temporary -Destination $Cached -Force
}

function Remove-FallbackMarker([string]$Key) {
  Remove-Item -LiteralPath (Join-Path $InstallSourceDirectory "$Key.vsix") -Force -ErrorAction SilentlyContinue
}

function Process-Editor([string]$Key, [string]$Label, [string]$Cli) {
  if ($EditorFilter -ne 'all' -and $EditorFilter -ne $Key) { return }
  if (-not $Cli) {
    if ($EditorFilter -eq $Key) { Write-Failure "$Label не найден. Установите редактор или добавьте его CLI в PATH." }
    return
  }
  $script:FoundCount++
  if ($DryRun) {
    Write-Ok "$Label найден: $Cli"
    $Outcome = if ($Action -eq 'uninstall') { 'удалено' } else { 'установлено или обновлено' }
    Write-Info "$Label`: расширение было бы $Outcome."
    $script:SuccessCount++
    return
  }
  if ($Action -eq 'uninstall') {
    & $Cli --uninstall-extension $ExtensionId *> $null
    if ($LASTEXITCODE -eq 0) {
      Remove-FallbackMarker $Key
      Write-Ok "$Label`: Kodpauza удалена."
      $script:SuccessCount++
    } else {
      Write-Warn "$Label`: Kodpauza не установлена или редактор отказал в удалении."
    }
    return
  }

  $ExpectedVersion = $null
  Write-Info "$Label`: устанавливаю Kodpauza из магазина расширений…"
  & $Cli --install-extension $ExtensionId --force *> $null
  if ($LASTEXITCODE -eq 0) {
    $Version = Get-InstalledVersion $Cli
    $ExpectedVersion = Get-ExpectedVersion
    if (-not $ExpectedVersion -or (Test-VersionAtLeast $Version $ExpectedVersion)) {
      Remove-FallbackMarker $Key
      Write-Ok "$Label`: Kodpauza$(if ($Version) { " $Version" }) установлена, автообновления включены."
      $script:SuccessCount++
      return
    }
    Write-Warn "$Label`: в магазине пока версия $(if ($Version) { $Version } else { 'неизвестна' }), нужна $ExpectedVersion."
  }

  try {
    $Package = Get-VerifiedVsix
    $PackageVersion = if ($ExpectedVersion) { $ExpectedVersion } else { Get-ExpectedVersion }
    if (-not $PackageVersion) { throw 'Не удалось определить версию резервного пакета.' }
    Save-FallbackPackage $PackageVersion
    & $Cli --install-extension $Package --force *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Редактор отклонил VSIX.' }
    $Version = Get-InstalledVersion $Cli
    Set-FallbackMarker $Key
    Write-Ok "$Label`: Kodpauza$(if ($Version) { " $Version" }) установлена из резервного пакета."
    Write-Ok "$Label`: проверка подписанных обновлений включена."
    $script:SuccessCount++
  } catch {
    Write-Failure "$Label`: установить Kodpauza не удалось. $($_.Exception.Message)"
  }
}

if (@('all', 'vscode', 'cursor', 'vscodium') -notcontains $EditorFilter) {
  throw 'KODPAUZA_EDITOR поддерживает: all, vscode, cursor, vscodium.'
}

$LocalPrograms = [Environment]::GetFolderPath('LocalApplicationData')
$ProgramFiles = [Environment]::GetFolderPath('ProgramFiles')
$ProgramFilesX86 = [Environment]::GetFolderPath('ProgramFilesX86')
$Vscode = Resolve-Editor @('code.cmd', 'code') @(
  (Join-Path $LocalPrograms 'Programs\Microsoft VS Code\bin\code.cmd'),
  (Join-Path $ProgramFiles 'Microsoft VS Code\bin\code.cmd'),
  $(if ($ProgramFilesX86) { Join-Path $ProgramFilesX86 'Microsoft VS Code\bin\code.cmd' })
)
$Cursor = Resolve-Editor @('cursor.cmd', 'cursor') @(
  (Join-Path $LocalPrograms 'Programs\Cursor\resources\app\bin\cursor.cmd'),
  (Join-Path $LocalPrograms 'Programs\cursor\resources\app\bin\cursor.cmd')
)
$Vscodium = Resolve-Editor @('codium.cmd', 'codium') @(
  (Join-Path $LocalPrograms 'Programs\VSCodium\bin\codium.cmd'),
  (Join-Path $ProgramFiles 'VSCodium\bin\codium.cmd')
)

Write-Host ''
Write-Host 'Kodpauza · установка расширения' -ForegroundColor White
Write-Host 'VS Code и Cursor без ручной загрузки VSIX.'
Write-Host ''

try {
  Process-Editor 'vscode' 'Visual Studio Code' $Vscode
  Process-Editor 'cursor' 'Cursor' $Cursor
  Process-Editor 'vscodium' 'VSCodium' $Vscodium
} finally {
  if ($TempDirectory -and (Test-Path -LiteralPath $TempDirectory)) {
    Remove-Item -LiteralPath $TempDirectory -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host ''
if ($FoundCount -eq 0) {
  throw 'VS Code, Cursor или VSCodium не найдены. Установите редактор и повторите эту же команду.'
}
if ($SuccessCount -eq 0) {
  throw 'Установка не завершена ни в одном редакторе.'
}
if ($Action -eq 'install' -and -not $DryRun) {
  Write-Info 'Если редактор был открыт, перезапустите его окно.'
  Write-Host 'Затем откройте палитру команд и выполните «Kodpauza: Войти».'
}
