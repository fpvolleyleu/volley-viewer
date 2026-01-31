#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 /path/to/export.json (or glob)"
  exit 1
fi

# 複数渡されたら更新日時が新しいものを採用
SRC="$(ls -t "$@" | head -n 1)"
DST="public/latest.json"

if [ ! -f "$SRC" ]; then
  echo "File not found: $SRC"
  exit 1
fi

cp "$SRC" "$DST"
echo "Updated $DST from $SRC"

git add "$DST"
git commit -m "Update latest.json" || true
git push
