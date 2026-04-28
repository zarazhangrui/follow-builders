#!/bin/bash
# Follow Builders HTML Digest — Daily Runner
# Generates a dated HTML file + updates index.html

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$HOME/.follow-builders/output"
DATE=$(date +%Y-%m-%d)

mkdir -p "$OUTPUT_DIR"

# Generate dated version
node "$SCRIPT_DIR/generate-html.js" "$OUTPUT_DIR/digest-${DATE}.html"

# Update latest
cp "$OUTPUT_DIR/digest-${DATE}.html" "$OUTPUT_DIR/index.html"

echo "✅ Digest generated: digest-${DATE}.html"
