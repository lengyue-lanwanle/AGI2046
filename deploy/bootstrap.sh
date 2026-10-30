#!/usr/bin/env bash
# 服务器端引导：从「代码已解压到 /srv/agi2046」到「服务在跑」。
#
# 用法：
#   bash /srv/agi2046/deploy/bootstrap.sh game.example.com   # 有域名（自动 HTTPS）
#   bash /srv/agi2046/deploy/bootstrap.sh                     # 没域名，走 :80
#
# 它做四件事：写 .env → 构建并起容器 → 等健康检查 → 打印下一步。
# 重复执行是安全的（compose 会原地更新）。
set -euo pipefail

DOMAIN_ARG="${1:-:80}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/deploy"

log() { printf '\n\033[36m== %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!! %s\033[0m\n' "$*"; }

command -v docker >/dev/null 2>&1 || {
  warn "没装 Docker。先跑：bash $ROOT/deploy/vps-setup.sh"
  exit 1
}

log "DOMAIN=$DOMAIN_ARG"
echo "DOMAIN=$DOMAIN_ARG" > .env

log "构建并启动（首次 2–4 分钟）"
docker compose up -d --build

log "等待健康检查"
ok=0
for i in $(seq 1 60); do
  if curl -fsS -m 3 http://127.0.0.1:5178/api/health >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done

if [ "$ok" != "1" ]; then
  warn "60 秒内没起来，看日志："
  docker compose logs --tail=60 app
  exit 1
fi

HEALTH="$(curl -fsS http://127.0.0.1:5178/api/health)"
log "服务已就绪"
echo "  $HEALTH"
docker compose ps

if [ "$DOMAIN_ARG" = ":80" ]; then
  VERIFY_HINT="node $ROOT/tools/deploy/check.mjs http://<公网IP>"
else
  VERIFY_HINT="node $ROOT/tools/deploy/check.mjs https://$DOMAIN_ARG"
fi

cat <<EOF

下一步：
  1. 验证（本地跑，需要 Node）：
       $VERIFY_HINT
     期望输出 7/7 通过。

  2. 打不开的话按顺序查：
       docker compose ps                       # 两个容器都是 running/healthy？
       docker compose logs --tail=50 caddy     # 证书签下来没有
       腾讯云控制台 → 该实例 → 防火墙          # 80/443 放行了吗（这层在云上，不在机器里）

  3. 备份（建议当天就配）：
       sudo cp $ROOT/deploy/backup.sh /usr/local/bin/agi-backup && sudo chmod +x /usr/local/bin/agi-backup
       sudo crontab -e   # 加一行：17 4 * * * /usr/local/bin/agi-backup >> /var/log/agi-backup.log 2>&1

更新版本：把新包传上来解压，再跑一次本脚本即可（存档在 agi-data 卷里，不会丢）。
EOF
