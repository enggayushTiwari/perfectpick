param(
  [string]$TaskName = "PerfectPick Filing Queue",
  [ValidateSet("Drain", "Worker")]
  [string]$Mode = "Drain",
  [string]$PythonExecutable = "python",
  [int]$BatchLimit = 5,
  [int]$MaxBatches = 20,
  [int]$MaxBatchesPerCycle = 20,
  [int]$PollInterval = 60,
  [int]$FrequencyMinutes = 5,
  [switch]$AiOcr,
  [switch]$NoPush
)

$ErrorActionPreference = "Stop"

$runnerScript = Join-Path $PSScriptRoot "run-filing-queue.ps1"
if (-not (Test-Path -LiteralPath $runnerScript)) {
  throw "Runner script not found at $runnerScript"
}

$runnerArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$runnerScript`"",
  "-Mode", $Mode,
  "-PythonExecutable", "`"$PythonExecutable`"",
  "-BatchLimit", $BatchLimit
)

if ($Mode -eq "Worker") {
  $runnerArgs += @(
    "-MaxBatchesPerCycle", $MaxBatchesPerCycle,
    "-PollInterval", $PollInterval
  )
} else {
  $runnerArgs += @(
    "-MaxBatches", $MaxBatches
  )
}

if ($AiOcr) {
  $runnerArgs += "-AiOcr"
}

if ($NoPush) {
  $runnerArgs += "-NoPush"
}

$taskCommand = "powershell.exe " + ($runnerArgs -join " ")

if ($Mode -eq "Worker") {
  schtasks.exe /Create /F /TN $TaskName /SC ONLOGON /TR $taskCommand | Out-Null
} else {
  schtasks.exe /Create /F /TN $TaskName /SC MINUTE /MO $FrequencyMinutes /TR $taskCommand | Out-Null
}

$summary = [ordered]@{
  taskName = $TaskName
  mode = $Mode
  pythonExecutable = $PythonExecutable
  frequencyMinutes = if ($Mode -eq "Drain") { $FrequencyMinutes } else { $null }
  command = $taskCommand
}

$summary | ConvertTo-Json -Depth 4
