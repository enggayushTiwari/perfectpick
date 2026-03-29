param(
  [ValidateSet("Drain", "Worker")]
  [string]$Mode = "Drain",
  [string]$PythonExecutable = "python",
  [int]$BatchLimit = 5,
  [int]$MaxBatches = 20,
  [int]$MaxBatchesPerCycle = 20,
  [int]$PollInterval = 60,
  [switch]$AiOcr,
  [switch]$NoPush
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$workersRoot = Join-Path $repoRoot "workers"

if (-not (Test-Path -LiteralPath $workersRoot)) {
  throw "Workers directory not found at $workersRoot"
}

Set-Location -LiteralPath $workersRoot

$argsList = @("-m", "stock_platform.cli")

if ($Mode -eq "Worker") {
  $argsList += @(
    "run-filing-queue-worker",
    "--batch-limit", $BatchLimit,
    "--max-batches-per-cycle", $MaxBatchesPerCycle,
    "--poll-interval", $PollInterval
  )
} else {
  $argsList += @(
    "drain-filing-queue",
    "--batch-limit", $BatchLimit,
    "--max-batches", $MaxBatches
  )
}

if ($AiOcr) {
  $argsList += "--ai-ocr"
}

if ($NoPush) {
  $argsList += "--no-push"
}

& $PythonExecutable @argsList
exit $LASTEXITCODE
