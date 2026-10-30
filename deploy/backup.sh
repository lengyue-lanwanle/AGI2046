#!/usr/bin/env bash
# 每日备份 /data（存档 + 房间 + profile + runs），保留 14 天。
#
# 装到服务器上：
#   sudo cp deploy/backup.sh /usr/local/bin/agi-backup && sudo chmod +x /usr/local/bin/agi-backup
#   sudo crontab -e
#   17 4 * * * /usr/local/bin/agi-backup >> /var/log/agi-backup.log 2>&1
#
# 想再稳一层：把 $DEST 换成 rclone 远端（rclone copy $OUT remote:agi2046-backup/），
# 或者 rsync 到另一台机器——同一块盘上的备份挡不住磁盘挂掉。
set -euo pipefail

STAMP="$(date +%Y%m%d-%H%M)"
DEST="${DEST:-/var/backups/agi2046}"
KEEP="${KEEP:-14}"

# compose 的卷名默认是 <目录名>_agi-data；用 docker volume ls 确认一下
VOLUME="${VOLUME:-deploy_agi-data}"

mkdir -p "$DEST"
OUT="$DEST/agi-data-$STAMP.tar.gz"

# 用一次性容器打包卷，比进容器里 tar 更干净（不依赖 app 是否在跑）
docker run --rm -v "$VOLUME":/data:ro -v "$DEST":/backup alpine:3.20 \
  tar -czf "/backup/$(basename "$OUT")" -C /data .

# 顺手记一下这次备份里有多少存档，便于发现「突然归零」
COUNT="$(tar -tzf "$OUT" | grep -c '^\./sessions/.*\.json$' || true)"
echo "$(date -Iseconds) backup ok: $OUT (${COUNT} saves)"

# 保留最近 N 份
ls -1t "$DEST"/agi-data-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
