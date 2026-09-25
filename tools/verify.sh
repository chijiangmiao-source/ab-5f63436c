#!/bin/sh
# Compose verify 服务入口：严格按顺序执行，任一步失败立即以非零码退出。
#   1) 辫群业务样例代码测试（node --test tests/）
#   2) 页面构建产物检查
#   3) 对健康路径执行 HTTP 冒烟（目标为 compose 中的 web 服务）
set -eu

SMOKE_URL="${SMOKE_URL:-http://web/}"

echo "== [1/3] 辫群业务样例代码测试 =="
node --test tests/

echo "== [2/3] 页面构建产物检查 =="
node tools/build-check.mjs

echo "== [3/3] 健康路径 HTTP 冒烟（${SMOKE_URL}healthz）=="
node tools/http-smoke.mjs "${SMOKE_URL}"

echo "== verify 全部通过 =="
