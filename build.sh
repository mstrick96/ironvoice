#!/bin/bash
# Iron Voice build script (bash version).
# Concatenates src/*.js (sorted by numeric prefix) and inlines into
# index.template.html at the <!-- SCRIPTS_HERE --> placeholder, writing
# the result to index.html.
#
# Usage:  ./build.sh
# Run from the repo root.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f index.template.html ]; then
  echo "ERROR: index.template.html not found"
  exit 1
fi

if [ ! -d src ]; then
  echo "ERROR: src/ directory not found"
  exit 1
fi

# Concatenate all src/*.js files in alphanumeric order. The numeric
# prefix on each file (01-, 02-, ...) ensures correct load order.
TEMP_JS="$(mktemp)"
trap 'rm -f "$TEMP_JS"' EXIT

for f in src/*.js; do
  cat "$f" >> "$TEMP_JS"
done

# Replace placeholder with concatenated JS. Using awk to avoid sed's
# pain with multi-line replacement and special characters.
awk -v jsfile="$TEMP_JS" '
  /<!-- SCRIPTS_HERE -->/ {
    while ((getline line < jsfile) > 0) print line
    close(jsfile)
    next
  }
  { print }
' index.template.html > index.html

echo "Built index.html ($(wc -l < index.html) lines, $(wc -c < index.html) bytes)"
echo "JS content: $(wc -l < "$TEMP_JS") lines from $(ls src/*.js | wc -l) files"
