# Iron Voice build script (PowerShell version, for Windows).
# Concatenates src/*.js (sorted by numeric prefix) and inlines into
# index.template.html at the <!-- SCRIPTS_HERE --> placeholder, writing
# the result to index.html.
#
# Usage:  .\build.ps1
# Run from the repo root in PowerShell.

$ErrorActionPreference = 'Stop'

# Resolve the directory the script lives in, and cd there.
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

# Read the template
$template = Get-Content -Raw -Path 'index.template.html'

# Concatenate all src/*.js files in alphanumeric order. The numeric
# prefix on each file (01-, 02-, ...) ensures correct load order.
$jsFiles = Get-ChildItem -Path 'src' -Filter '*.js' | Sort-Object Name
$concatenated = ($jsFiles | ForEach-Object { Get-Content -Raw -Path $_.FullName }) -join ''

# Replace placeholder. -Replace uses regex; quote the placeholder.
$placeholder = [regex]::Escape('<!-- SCRIPTS_HERE -->')
$result = $template -Replace $placeholder, [System.Text.RegularExpressions.Regex]::Escape('').Replace('\', '\\')

# Use direct string replacement instead — regex tries to be too clever
# with $-substitutions in the replacement text, and our JS may contain
# them. Go through the literal-replace path.
$result = $template.Replace('<!-- SCRIPTS_HERE -->', $concatenated)

# Write index.html with LF line endings to match what build.sh produces,
# so the GitHub Action's diff sees no spurious differences.
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
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
