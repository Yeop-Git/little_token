param(
  [string]$Dist = "dist",
  [string]$Output = "artifacts/little-token-web.zip"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$DistPath = [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot $Dist))
$OutputPath = [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot $Output))

if (-not $DistPath.StartsWith($ProjectRoot + [System.IO.Path]::DirectorySeparatorChar)) {
  throw "Build directory must be inside the project: $DistPath"
}
if (-not $OutputPath.StartsWith($ProjectRoot + [System.IO.Path]::DirectorySeparatorChar)) {
  throw "ZIP output must be inside the project: $OutputPath"
}

& npm.cmd run web:check -- --dist=$Dist
if ($LASTEXITCODE -ne 0) { throw "Web delivery validation failed." }

$OutputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
Compress-Archive -Path (Join-Path $DistPath "*") -DestinationPath $OutputPath -CompressionLevel Optimal -Force

Add-Type -AssemblyName System.IO.Compression.FileSystem
$Archive = [System.IO.Compression.ZipFile]::OpenRead($OutputPath)
try {
  $Entries = @($Archive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })
  if ($Entries -notcontains "index.html") { throw "index.html is not at the ZIP root." }
  if ($Entries | Where-Object { $_ -match "^[^/]+/index\.html$" }) {
    throw "The ZIP contains an extra build directory level."
  }
} finally {
  $Archive.Dispose()
}

Write-Host "Web delivery ZIP ready: $OutputPath"
