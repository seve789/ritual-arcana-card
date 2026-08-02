#!/usr/bin/env bash
# 通过 GitHub Contents API 上传/更新仓库文件（绕过被墙的 git 协议）。
# 自动获取已存在文件的 sha 以支持更新（PUT with sha）。
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
  # 获取已存在文件的 sha（不存在则 GET 返回 404，sha 为空）
  sha=$(curl -s -u "$GH_PAT:x-oauth-basic" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/contents/$f" | grep -o '"sha": "[a-f0-9]\{40\}"' | head -1 | cut -d'"' -f4 || true)
  if [ -n "$sha" ]; then
    body=$(printf '{"message":"chore: upload %s","content":"%s","sha":"%s"}' "$f" "$b64" "$sha")
  else
    body=$(printf '{"message":"chore: upload %s","content":"%s"}' "$f" "$b64")
  fi
  code=$(printf '%s' "$body" | \
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
