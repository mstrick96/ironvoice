# Iron Voice build script (PowerShell version, for Windows).
# Concatenates src/*.js (sorted by numeric prefix) and inlines into
# index.template.html at the <!-- SCRIPTS_HERE --> placeholder, writing
# the result to index.html.
#
# Usage:  .\build.ps1
# Run from the repo root in PowerShell.

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not (Test-Path 'index.template.html')) {
    Write-Error 'index.template.html not found'
    exit 1
}

if (-not (Test-Path 'src')) {
    Write-Error 'src/ directory not found'
    exit 1
}

# Force UTF-8 for all reads. Windows PowerShell otherwise defaults to
# the legacy Windows-1252 codepage, which mangles characters like
# the middle dot (U+00B7), em dash (U+2014), and curly quotes.
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$template = [System.IO.File]::ReadAllText(
    (Join-Path $scriptDir 'index.template.html'),
    $utf8NoBom
)

$jsFiles = Get-ChildItem -Path 'src' -Filter '*.js' | Sort-Object Name
$concatenated = ($jsFiles | ForEach-Object {
    [System.IO.File]::ReadAllText($_.FullName, $utf8NoBom)
}) -join ''

$result = $template.Replace('<!-- SCRIPTS_HERE -->', $concatenated)

[System.IO.File]::WriteAllText(
    (Join-Path $scriptDir 'index.html'),
    $result,
    $utf8NoBom
)

$lineCount = (Get-Content 'index.html').Count
$byteCount = (Get-Item 'index.html').Length
$jsLineCount = ($jsFiles | ForEach-Object { (Get-Content $_.FullName).Count } | Measure-Object -Sum).Sum
Write-Host "Built index.html ($lineCount lines, $byteCount bytes)"
Write-Host "JS content: $jsLineCount lines from $($jsFiles.Count) files"