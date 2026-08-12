#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT/plugins/wordpress/neo-authority-engine"
OUTPUT="$ROOT/dist/neo-authority-engine-v1.6.0.zip"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

mkdir -p "$ROOT/dist"
rm -f "$OUTPUT"

if [[ ! -f "$SOURCE/neo-authority-engine.php" ]]; then
  echo "WordPress plugin entrypoint was not found" >&2
  exit 1
fi

install -d -m 0755 "$STAGING/neo-authority-engine/includes"
install -m 0644 "$SOURCE/neo-authority-engine.php" "$STAGING/neo-authority-engine/neo-authority-engine.php"
for file in \
  class-neo-secret-store.php \
  class-neo-cloud-client.php \
  class-neo-settings.php \
  class-neo-publisher.php \
  class-neo-customer-dashboard.php; do
  install -m 0644 "$SOURCE/includes/$file" "$STAGING/neo-authority-engine/includes/$file"
done

cd "$STAGING"
zip -qr "$OUTPUT" neo-authority-engine
unzip -tq "$OUTPUT"
unzip -Z1 "$OUTPUT" | grep -qx 'neo-authority-engine/neo-authority-engine.php'
echo "$OUTPUT"
