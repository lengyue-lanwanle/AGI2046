#!/usr/bin/env bash
# 任意 Ubuntu 22.04+ 主机的一键准备脚本（腾讯云轻量 / Oracle / 阿里云都适用，ARM 或 x86 都行）
#
# 用法（在服务器上，root）：
#   scp deploy/vps-setup.sh root@<IP>:/root/ && ssh root@<IP> bash /root/vps-setup.sh
#
# 腾讯云轻量：控制台的「防火墙」是另一层，脚本碰不到，必须自己在控制台放行 80/443（见 docs/DEPLOY.md §3.2）
#
# 它只做「让机器能跑容器」这件事，不碰你的代码：
#   1. 装 Docker + compose 插件
#   2. 放行 80/443 —— Oracle 的 Ubuntu 镜像默认 iptables 直接 REJECT；腾讯云没有这层但多做无害
#   3. 内存 < 2G 时加 2G swap（AMD 那台 1G 小机全靠它）
#   4. 打开 BBR（跨境线路能明显顺一点）
# 云控制台的「安全列表 / 防火墙」还得手动开 80/443，脚本碰不到那里。
set -euo pipefail

log() { printf '\n\033[36m== %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!! %s\033[0m\n' "$*"; }

[ "$(id -u)" = "0" ] || { echo "请用 root 跑（sudo bash $0）"; exit 1; }

# ── 1. Docker ────────────────────────────────────────────────────────────
if command -v docker >/dev/null 2>&1; then
  log "Docker 已安装：$(docker --version)"
else
  log "安装 Docker"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null 2>&1 || {
  warn "compose 插件缺失，尝试补装"
  apt-get update -qq && apt-get install -y -qq docker-compose-plugin
}

# ── 2. 放行 80/443（Oracle Ubuntu 镜像的坑）──────────────────────────────
log "放行 80/443"
if command -v iptables >/dev/null 2>&1; then
  # 插到链首：不用去数 REJECT 规则在第几条，重复执行也只是多一条同样的 ACCEPT
  iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 80 -j ACCEPT
  iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 443 -j ACCEPT
  if command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save
  else
    warn "没装 iptables-persistent：重启后规则会丢，装一下（apt install iptables-persistent）再重跑本脚本"
  fi
else
  warn "没有 iptables，跳过（可能是 firewalld 系）"
fi

# Oracle 的云防火墙（安全列表）不在机器里，提醒一句
warn "别忘了在 OCI 控制台 → 实例所在子网 → 安全列表里放行 TCP 80/443"

# ── 3. swap（小内存机器必备）──────────────────────────────────────────────
MEM_MB=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)
if [ "$MEM_MB" -lt 2048 ] && [ ! -f /swapfile ]; then
  log "内存 ${MEM_MB}MB，加 2G swap"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  log "内存 ${MEM_MB}MB，不需要 swap"
fi

# ── 4. BBR ───────────────────────────────────────────────────────────────
if ! sysctl net.ipv4.tcp_congestion_control 2>/dev/null | grep -q bbr; then
  log "开启 BBR"
  cat >/etc/sysctl.d/99-bbr.conf <<'EOF'
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
EOF
  sysctl --system >/dev/null 2>&1 || true
fi

# ── 5. 收尾 ──────────────────────────────────────────────────────────────
log "完成"
cat <<'EOF'

接下来（假设代码在 /srv/agi2046）：

  cd /srv/agi2046/deploy
  echo "DOMAIN=game.你的域名.com" > .env    # 没有域名就写 DOMAIN=:80
  docker compose up -d --build

  cd /srv/agi2046 && node tools/deploy/check.mjs http://<公网IP>   # 7/7 通过就上线了

机器信息：
EOF
echo "  CPU: $(nproc) 核  内存: ${MEM_MB}MB  磁盘: $(df -h / | awk 'NR==2 {print $2}')"
docker --version
