#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT/plugins/wordpress/neo-authority-engine"
OUTPUT="$ROOT/dist/neo-authority-engine-v1.3.1.zip"

rm -rf "$ROOT/dist"
mkdir -p "$ROOT/dist"

if [[ ! -f "$SOURCE/neo-authority-engine.php" ]]; then
  echo "WordPress plugin entrypoint was not found" >&2
  exit 1
fi

cd "$(dirname "$SOURCE")"
zip -qr "$OUTPUT" "$(basename "$SOURCE")" -x '*.DS_Store' -x '*/.git/*'
echo "$OUTPUT"
