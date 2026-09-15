$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$scratch = Join-Path ([IO.Path]::GetTempPath()) ("openyapi powershell " + [Guid]::NewGuid().ToString('N'))
$portFile = Join-Path $scratch 'fixture-port.txt'
$recordFile = Join-Path $scratch 'requests.jsonl'
$configHome = Join-Path $scratch 'config home'
$installRoot = Join-Path $scratch 'installed package'
$fixtureScript = Join-Path $PSScriptRoot 'powershell-fixture.mjs'
$serverJob = $null

function Invoke-CheckedCli {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [AllowNull()][string]$InputText
  )
  if ($null -eq $InputText) {
    $result = & $script:openyapi @Arguments
  } else {
    $result = $InputText | & $script:openyapi @Arguments
  }
  if ($LASTEXITCODE -ne 0) {
    throw "openyapi exited with $LASTEXITCODE for: $($Arguments -join ' ')"
  }
  return ($result -join [Environment]::NewLine)
}

function Assert-UsageFailure {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)
  $stdoutFile = Join-Path $scratch 'failure-stdout.txt'
  $stderrFile = Join-Path $scratch 'failure-stderr.txt'
  $process = Start-Process -FilePath $script:openyapi -ArgumentList $Arguments `
    -Wait -PassThru -NoNewWindow `
    -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
  $stdout = [IO.File]::ReadAllText($stdoutFile)
  $stderr = [IO.File]::ReadAllText($stderrFile)
  if ($process.ExitCode -ne 2) {
    throw "Expected usage exit 2, received $($process.ExitCode)."
  }
  if (-not [string]::IsNullOrEmpty($stdout)) {
    throw "Expected empty stdout for usage failure: $stdout"
  }
  try {
    $parsed = $stderr | ConvertFrom-Json
  } catch {
    throw "Expected structured JSON stderr: $stderr"
  }
  if ($parsed.error.code -ne 'USAGE_ERROR') {
    throw "Unexpected usage failure: $stderr"
  }
}

try {
  New-Item -ItemType Directory -Path $scratch | Out-Null
  $node = (Get-Command node).Source
  $serverJob = Start-Job -ScriptBlock {
    param($NodePath, $ScriptPath, $PortPath, $RecordPath)
    & $NodePath $ScriptPath $PortPath $RecordPath
  } -ArgumentList $node, $fixtureScript, $portFile, $recordFile

  for ($attempt = 0; $attempt -lt 100 -and -not (Test-Path $portFile); $attempt++) {
    Start-Sleep -Milliseconds 50
  }
  if (-not (Test-Path $portFile)) { throw 'HTTP fixture did not start.' }
  $baseUrl = "http://127.0.0.1:$((Get-Content -Raw $portFile).Trim())"

  Push-Location $workspace
  try {
    $packageName = (npm pack --pack-destination $scratch | Select-Object -Last 1).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'npm pack failed.' }
    npm install --prefix $installRoot --omit=dev --ignore-scripts --no-audit --no-fund --package-lock=false (Join-Path $scratch $packageName) | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
  } finally {
    Pop-Location
  }

  $script:openyapi = Join-Path $installRoot 'node_modules/.bin/openyapi.cmd'
  $env:XDG_CONFIG_HOME = $configHome
  $env:OPENYAPI_BASE_URL = ''
  $env:OPENYAPI_PROFILE = ''
  $env:OPENYAPI_PROJECT_ID = ''
  $env:OPENYAPI_TOKEN = ''
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  $OutputEncoding = New-Object System.Text.UTF8Encoding($false)

  $null = Invoke-CheckedCli -Arguments @('config', 'set', 'windows', '--base-url', $baseUrl, '--project-id', '41') -InputText $null
  $null = Invoke-CheckedCli -Arguments @('config', 'token', 'set', 'windows', '--stdin') -InputText 'powershell-secret'
  Assert-UsageFailure -Arguments @('category', 'create')

  $inputDirectory = Join-Path $scratch '中文 inputs with spaces'
  New-Item -ItemType Directory -Path $inputDirectory | Out-Null
  $categoryFile = Join-Path $inputDirectory 'category utf8 bom.json'
  $createFile = Join-Path $inputDirectory 'interface utf8.json'
  $saveFile = Join-Path $inputDirectory 'interface utf16le.json'
  $utf8Bom = New-Object System.Text.UTF8Encoding($true)
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $utf16LeBom = New-Object System.Text.UnicodeEncoding($false, $true)
  [IO.File]::WriteAllText($categoryFile, '{"name":"中文分类"}', $utf8Bom)
  [IO.File]::WriteAllText($createFile, '{"title":"新增接口","path":"/windows","method":"POST","catid":7}', $utf8NoBom)
  [IO.File]::WriteAllText($saveFile, '{"title":"保存接口","path":"/windows","method":"POST","catid":7}', $utf16LeBom)

  $outputs = @(
    (Invoke-CheckedCli -Arguments @('category', 'create', '--file', $categoryFile, '--profile', 'windows') -InputText $null),
    (Invoke-CheckedCli -Arguments @('interface', 'create', '--file', $createFile, '--profile', 'windows') -InputText $null),
    (Invoke-CheckedCli -Arguments @('interface', 'save', '--file', $saveFile, '--profile', 'windows') -InputText $null),
    (Invoke-CheckedCli -Arguments @('interface', 'update', '--stdin', '--profile', 'windows') -InputText '{"id":8,"title":"更新接口"}'),
    (Invoke-CheckedCli -Arguments @('import', '--stdin', '--type', 'swagger', '--profile', 'windows') -InputText '{"swagger":"2.0","info":{"title":"中文","version":"1"},"paths":{}}')
  )
  foreach ($output in $outputs) {
    $parsed = $output | ConvertFrom-Json
    if ($parsed.message -ne 'success') { throw "Unexpected CLI output: $output" }
    if ($output -match 'powershell-secret') { throw 'Token leaked in CLI output.' }
  }

  $postPaths = @(Get-Content $recordFile | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object method -eq 'POST' | ForEach-Object pathname)
  $expectedPaths = @('/api/interface/add_cat', '/api/interface/add', '/api/interface/save', '/api/interface/up', '/api/open/import_data')
  if (($postPaths -join ',') -ne ($expectedPaths -join ',')) {
    throw "Unexpected POST paths: $($postPaths -join ',')"
  }
  Write-Output "PowerShell installed-package write smoke passed on $($PSVersionTable.PSVersion)."
} finally {
  if ($null -ne $serverJob) {
    Stop-Job $serverJob -ErrorAction SilentlyContinue
    Remove-Job $serverJob -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path $scratch) { Remove-Item -Recurse -Force $scratch }
}
