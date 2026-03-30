#!/bin/bash
# Copies llms.txt and llms-full.txt from web build output into nile docs/
# Run from packages/nile/ or as part of the export pipeline

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NILE_ROOT="$SCRIPT_DIR/.."
WEB_BUILD="$NILE_ROOT/../web/doc_build"
DOCS_DIR="$NILE_ROOT/docs"

mkdir -p "$DOCS_DIR"

if [ -f "$WEB_BUILD/llms.txt" ] && [ -f "$WEB_BUILD/llms-full.txt" ]; then
  cp "$WEB_BUILD/llms.txt" "$DOCS_DIR/llms.txt"
  cp "$WEB_BUILD/llms-full.txt" "$DOCS_DIR/llms-full.txt"
  echo "Copied llms.txt and llms-full.txt to $DOCS_DIR"
else
  echo "Warning: llms.txt or llms-full.txt not found in $WEB_BUILD"
  echo "Run 'pnpm build' in packages/web first to generate them."
fi