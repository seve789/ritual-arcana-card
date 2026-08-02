#!/usr/bin/env bash
# 通过 GitHub Contents API 上传/更新仓库文件。
# 适用于 github.com git 协议被网络限制的环境（api.github.com 可达时）。
# 用法: GH_PAT=<token> bash scripts/upload-to-github.sh [file...]  （不传文件 = 全部已跟踪文件）
set -euo pipefail

REPO="seve789/ritual-arcana"
: "${GH_PAT:?请先设置 GH_PAT 环境变量}"

cd "$(dirname "$0")/.."

if [ $# -gt 0 ]; then
  FILES="$*"
else
  FILES=$(git ls-files)
fi

ok=0
fail=0
for f in $FILES; do
  if [ ! -f "$f" ]; then
    echo "SKIP (missing) $f"
    continue
  fi
  b64=$(base64 -w0 "$f")
  code=$(printf '{"message":"chore: upload %s","content":"%s"}' "$f" "$b64" | \
    curl -s -o /dev/null -w "%{http_code}" -X PUT \
      -u "$GH_PAT:x-oauth-basic" \
      -H "Accept: application/vnd.github+json" \
      -H "Content-Type: application/json" \
      --data-binary @- \
      "https://api.github.com/repos/$REPO/contents/$f")
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then
    ok=$((ok + 1))
  else
    fail=$((fail + 1))
    echo "FAIL $code $f"
  fi
  if [ $(((ok + fail) % 20)) -eq 0 ]; then
    echo "progress $((ok + fail))/$(echo "$FILES" | wc -w)"
  fi
done

echo "DONE ok=$ok fail=$fail"
[ "$fail" -eq 0 ]
