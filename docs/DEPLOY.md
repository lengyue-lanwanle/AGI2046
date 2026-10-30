# 把《零号协议 2046》放到公网

> 目标：**朋友打开一个链接就能玩，你关掉电脑也不影响**。
> **已选定：腾讯云轻量应用服务器（中国香港）** → 直接看 §3，从买机器到能玩大约 30 分钟，38–54 元/月（活动价更低）。
> 通用结论：一台轻量云 + Docker Compose + Caddy 就够，换哪家云命令都一样。
> 不想碰 Linux 就翻到 §6 的 Fly.io，`fly deploy` 一条命令，约 $2–4/月。
> **一分钱不想花**：只有 **Oracle Cloud 永久免费 ARM（2 核 12G）** 能长期 0 元常驻，代价和坑见 §10；
> 其次是白嫖国内云的 1–3 个月试用，到期再迁（见 §2 表 C）。

---

## 1. 先看约束（都是代码里读出来的，不是猜的）

| 事实 | 出处 | 对部署意味着什么 |
|---|---|---|
| .NET **10.0** | `*.csproj` 的 `TargetFramework` | 很多 PaaS 默认还是 8.0；要么用 Docker，要么选支持 10 的运行时 |
| 存档是**文件**（`data/sessions/*.json`，上限 200 份） | `Program.cs: SessionStore` | **必须挂持久卷**，否则重新部署 = 全员删档 |
| 对局在**内存**里（`ConcurrentDictionary<sessionId, GameSession>`） | `Program.cs: sessions` | **只能单实例**。不能多副本，也不能让平台随便扩缩容 |
| 房间也在内存 + `data/rooms` | `RoomStore` | 重启后大厅里的房间会消失，玩家得重开——发布安排在没人玩的时候 |
| 联机是 **HTTP 轮询**，没有 WebSocket / SignalR | `web/js/app.js` 轮询 `/api/room/{code}/state?since=` | 反代**不需要**配 Upgrade 头，也不怕长连接被掐；代价是延迟约 1 个轮询间隔 |
| 前端是零构建静态目录 `web/`，服务端按 `ContentRoot/web` 找 | `Program.cs: webRoot` | 镜像里把 `web/` 放在 dll 旁边就行（`Dockerfile` 已处理） |
| 端口读 `AGI2046_PORT`（默认 5178），监听 `[::]` | `Program.cs` | 容器里不用改，反代打到 5178 |
| 限速按 `CF-Connecting-IP` → `X-Forwarded-For` → `RemoteIp` | `Program.cs: ClientOf` | 反代**必须透传真实 IP**，否则一个人建房把全站额度吃光 |
| `/api/health` 返回 `{ok, version, lastSaveError}` | `Program.cs` | 直接当健康检查 + 监控探针用 |

**一句话**：这是一个「有状态的小单体」。它不需要数据库，但需要一块不会被删的盘，和一台不会随便重启的机器。

---

## 2. 七条路，挑一条

| 方案 | 0 元能长期跑？ | 月成本 | 中国大陆延迟 | 适合谁 |
|---|---|---|---|---|
| **A. 香港/新加坡 轻量云 + Docker + Caddy**（省心推荐） | ❌ | ¥25–60 | 30–60ms | 想长期开、可控、不被平台规则卡 |
| **B. Oracle Cloud Always Free（东京/大阪/新加坡）** | ✅ 真 0 元 | **0** | 40–90ms | 愿意折腾一次、能接受「可能被回收」 |
| **C. 国内云免费试用（阿里/腾讯）** | ⏳ 1–3 个月 | 0 → ¥40–100 | 10–25ms | 先玩起来，到期再迁 |
| **D. 家里旧设备/NAS + Cloudflare Tunnel** | ✅ 0 元（要台设备） | 0 | 20–40ms | 有常年开着的 NAS / 软路由 / 旧笔记本 |
| **E. Fly.io** | ❌ 2024 年就取消免费额度了 | $2–4 | 40–80ms | 不想碰 Linux，接受命令行 |
| **F. Render 免费层** | ⚠️ 能玩，但存档会丢 | 0 | 200ms+ | 临时演示一局（见下） |
| **G. Cloudflare Tunnel + 你自己这台电脑** | ✅ 但电脑得一直开 | 0 | 20–40ms | ❌ 你要的就是「不用开电脑」 |

**为什么 A 省心、B 最省钱包**：这游戏要的是「一台一直在的小机器 + 一块不会被删的盘」。
A 花点小钱换稳定；B 是唯一真能长期 0 元的——代价是注册要信用卡、ARM 容量经常抢不到、
闲置 7 天可能被回收（§10 有对策）。

> **F 到底能不能用**：能，但有两条硬伤。
> ① **15 分钟无请求就睡**——这游戏在页面上每 1.5 秒轮询一次房间状态（`app.js` 的 `setInterval(pollRoomState, 1500)`），**有人开着页面就不会睡**，
> 所以「约好一起玩」时几乎感觉不到；难受的是**第一个进的人要等约 1 分钟冷启动**。
> ② **免费层不能挂持久盘、文件系统是临时的**——重启/重新部署后
> `data/sessions` 和房间全没，「继续行动」失效。当成「一次性的演示服」可以，当存档服不行。
> Railway 现在只有 $1/月额度（0.5G 内存跑满月约 $5），盖不住；Fly.io 对新组织没有免费额度，
> 只剩 2 小时机器时长的试用；ClawCloud 的 $5/月额度按 CPU·内存秒计费，always-on 也偏紧。

> 试用期数字（阿里 1 个月轻量 / 300 元 3 个月 ECS、腾讯 3 个月轻量）随时会变，以 `free.aliyun.com` 等活动页为准。
>
> 想试 Render 的话 `deploy/render.yaml` 已经写好了：仓库推上 GitHub → Render 控制台 New → Blueprint → 选仓库，
> 它会照 `Dockerfile` 构建并把 `AGI2046_PORT` 对齐到 Render 的 10000。

---

## 3. 腾讯云轻量：30 分钟上线

> 这一节是按「买腾讯云」写的。阿里云轻量的界面不同但步骤一模一样，命令全通用。

### 3.1 买哪台

**地域先做决定**：

| | 中国香港 | 中国大陆（上海/广州/北京） |
|---|---|---|
| 备案 | **免备案**，买完就能用域名 | 域名必须 **ICP 备案**（2–3 周），否则只能 IP 访问 |
| 到大陆延迟 | 30–60ms（移动 40–80ms） | 10–25ms |
| 官方对线路的说明 | 价格页原话：**「无法保障中国内地与中国香港之间的跨境公网质量，跨境连接可能出现较大延迟和丢包」** | 国内骨干，稳 |
| 流量 | 512GB 或 1TB/月（套餐不同） | 300–600GB/月 |

**建议香港**：4 个人打回合制，30–60ms 完全够；跨境抖动是真的存在（晚高峰），但 d100 不是 FPS。
除非你已经有备案好的域名，那就上大陆节点。

**具体买这个**（腾讯云轻量应用服务器 · 香港）：

| 项 | 选什么 | 说明 |
|---|---|---|
| 套餐 | **2 核 2G / 40G SSD / 20Mbps / 512GB**（38 元/月）或 **2 核 2G / 50G / 30Mbps / 1TB**（54 元/月） | 后者带宽和流量都翻倍，差 16 块，建议后者 |
| 系统镜像 | **Ubuntu 24.04 LTS**（纯净镜像） | 别选 WordPress/宝塔这类应用镜像，多一层不知道哪里出问题 |
| 登录方式 | **SSH 密钥** | 控制台能直接生成，别用密码 |
| 时长 | 先买 **1 个月** | 跑通了再续年付（新用户常有 199–288 元/年的活动价） |

> 价格以控制台为准，活动价经常比标价低一半。1C1G 也能跑，但 .NET 联机峰值会摸到 500MB+，2G 是底线。

### 3.2 控制台防火墙（最容易漏的一步）

轻量的防火墙**独立于机器内部的 iptables**，规则在控制台配。默认可能只放了 22（有的镜像会顺带放 80/443，别赌），
外网打不开九成是这里：

1. 控制台 → 轻量应用服务器 → 点进实例 → **防火墙** 标签页
2. 添加两条 **入站** 规则（来源 `0.0.0.0/0`）：
   - 应用类型 `HTTP` → TCP:80
   - 应用类型 `HTTPS` → TCP:443
3. 顺手把 **22** 的来源改成「当前登录 IP」，别对全网开

**不要**在这里放行 5178——那是容器内部端口，只给 Caddy 用。

### 3.3 装环境

仓库没推到远端，所以脚本直接从本地传（**在项目根目录执行**）：

```bash
scp deploy/vps-setup.sh root@<IP>:/root/
ssh root@<IP> 'bash /root/vps-setup.sh'
```

脚本干四件事：装 Docker + compose、机器内放行 80/443、内存 <2G 时加 2G swap、开 BBR。
（腾讯云的 Ubuntu 镜像没有 Oracle 那层 iptables 拦截，多做的部分无害。）

手动版等价于：

```bash
ssh root@<IP>
curl -fsSL https://get.docker.com | sh
docker compose version        # 要有 v2.x
```

### 3.4 配域名（没有也能跑，跳过就是 IP 直连）

在 **DNSPod**（腾讯云自带）加一条 A 记录：`game.你的域名.com → <公网IP>`。

- 域名在别家也行，把 NS 改到 DNSPod 或直接在原服务商加 A 记录。
- **别急着套 CDN / 小黄云**：先直连，确认能通再考虑。
- 香港节点不需要备案，解析生效后几分钟就能签证书。
- **先解析再启动**：Caddy 启动时读 `DOMAIN` 去签证书，DNS 没生效它会一直重试（日志里能看到）。

### 3.5 上传 + 启动（一条命令）

域名解析加好、服务器上装完 Docker 之后，**本地**跑这一条就够了：

```bash
node tools/deploy/deploy.mjs root@<IP> game.你的域名.com     # 没域名就去掉最后那段
```

它依次做四件事，每步都有输出：

1. `pack.mjs` 打一个 18MB 的包（只含 src / web / Dockerfile / deploy，不含 .git 与存档）
2. `scp` 到 `/tmp/`
3. `ssh` 解压到 `/srv/agi2046` 并执行 `deploy/bootstrap.sh <域名>`（写 .env → `compose up -d --build` → 轮询 `/api/health`）
4. 跑 `check.mjs` 做 7 项验收，全绿才算完

首次 build 约 2–4 分钟（2 核机器），Caddy 申请证书 10–30 秒。

<details>
<summary>想手动来一遍（或脚本不好使时）</summary>

```bash
node tools/deploy/pack.mjs                                   # 本地
scp "dist/agi2046-deploy-*.tar.gz" root@<IP>:/tmp/           # 本地
```

```bash
ssh root@<IP>
mkdir -p /srv/agi2046 && tar -xzf /tmp/agi2046-deploy-*.tar.gz -C /srv/agi2046
bash /srv/agi2046/deploy/bootstrap.sh game.你的域名.com
```

`bootstrap.sh` 就是上面那三步的合集，重复执行安全。也可以完全手打：

```bash
cd /srv/agi2046/deploy
echo "DOMAIN=game.你的域名.com" > .env    # 没域名写 DOMAIN=:80
docker compose up -d --build
docker compose ps                         # 两个容器都 healthy 才算成
```

</details>

> 以后想改成 `git pull` 一键更新：把仓库推一个**私有** GitHub 仓库（免费），
> 服务器上 `git clone` 一次，之后 `git pull && docker compose up -d --build`。
> 仓库 `.git` 有 114MB（美术历史），首次会慢一点。

### 3.6 验收

```bash
node tools/deploy/check.mjs https://game.你的域名.com
```

7 项全过就上线了：健康检查、16 个角色、`no-cache`、`immutable`、压缩、字体 MIME、能建房。
再开两个隐身窗口试一局真实的：一个建房、一个用房间码加入，能看到对方就对了。

> 没域名时用 `http://<IP>/` 访问。没有 HTTPS 拿不到剪贴板权限，但分享按钮已经加了 `execCommand` 兜底，
> 地址照样能复制。

### 3.7 更新版本

```bash
node tools/deploy/deploy.mjs root@<IP> game.你的域名.com     # 和首次完全一样
```

镜像重建 1–2 分钟（csproj 没变时 NuGet 走缓存）。**存档在 `agi-data` 卷里，不会丢**。
发布前后停服约 5 秒，房间会清空，挑没人的时候做。

---

## 4. 上线后先验收

```bash
node tools/deploy/check.mjs https://你的域名
```

一条命令过 7 项：健康检查、meta 里 16 个角色、入口页 `no-cache`、带 `?v=` 的资源 `immutable`、
文本压缩（br/gzip）、`font/woff2` + `image/webp` 的 MIME、以及真的能建出一个房间。
全过会打印 `7/7 通过`，退出码 0（可以直接挂到 CI 或部署脚本末尾）。

还有两条脚本管不了的，手动做一次：

- 浏览器开两个隐身窗口，一个建房一个加入，能进同一局、能互相看到对方的操作。
- `docker restart deploy-app-1` 之后刷新页面，「继续行动」还能读到刚才的存档（证明卷挂对了）。

> 第 ⑥ 条最容易翻车：卷没挂上时一切正常，直到某次重新部署才发现存档全没了。

---

## 5. 运维：三件必须做的事

### 5.1 备份（不做这一步迟早后悔）

`deploy/backup.sh` 已经写好：把 `/data` 打成 tar，保留 14 天。

```bash
sudo cp deploy/backup.sh /usr/local/bin/agi-backup && sudo chmod +x /usr/local/bin/agi-backup
sudo crontab -e
17 4 * * * /usr/local/bin/agi-backup >> /var/log/agi-backup.log 2>&1
```

**同一块盘上的备份挡不住磁盘挂掉**。想稳就把 `$DEST` 换成 rclone 远端（对象存储几块钱一年），
或者每周把 tar 拉到本地一次。

恢复：`docker compose down` → `docker run --rm -v deploy_agi-data:/data -v /var/backups/agi2046:/b alpine tar -xzf /b/xxx.tar.gz -C /data` → `up -d`。

### 5.2 看日志

```bash
docker compose logs -f app --tail=200      # 服务端（含存档写盘失败告警）
docker compose logs -f caddy --tail=100    # 访问日志（谁在刷接口）
```

`/api/health` 里的 `lastSaveError` 一旦非空，就是盘满或权限问题——把它接进任何监控
（UptimeRobot 免费版盯 `https://你的域名/api/health`，挂了发邮件）。

### 5.3 防滥用

服务端已有频率限制（建房 10 次/小时、查房 20 次/分、加入 30 次/分），但**没有账号体系**：
知道房间码的人就能进。这是设计取舍（分享要简单）。真被刷就：
- 换域名/加 Cloudflare 代理，
- 或者在 Caddy 前面加一层 `basic_auth`（`caddy hash-password` 生成），只告诉朋友口令。

---

## 6. Fly.io（不想管服务器，但要花钱）

```bash
# 一次性（在仓库根目录，fly.toml 就在那儿）
fly auth signup
fly launch --copy-config --no-deploy          # 读根目录的 fly.toml
fly volumes create agi_data --size 3 --region hkg   # 3GB 够存几千局
fly deploy

# 以后更新
fly deploy
```

要点（`deploy/fly.toml` 里都写了）：
- `min_machines_running = 1` + `auto_stop_machines = false`：**别让它睡**，睡了内存里的房间就没了；
- **不要** `fly scale count 2`：单实例应用，两台机器各有一半房间；
- volume 只挂一台机器，正好符合它的单实例模型。

成本：`shared-cpu-1x / 512MB` 约 $3/月 + 3GB 卷 $0.45/月。流量按出网算，朋友玩不了多少。

---

## 7. 没有 Docker 的裸机方案（附录）

不想装 Docker 也行，`systemd` + 本地发布：

```bash
# 服务器装运行时（不是 SDK）
curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 10.0 --runtime aspnetcore

# 本地发布 → 传上去（web 必须在 dll 旁边）
dotnet publish src/AGI2046.Server/AGI2046.Server.csproj -c Release -o out
rsync -avz --delete out/ root@<IP>:/srv/agi2046/app/
rsync -avz --delete web/ root@<IP>:/srv/agi2046/app/web/
```

`/etc/systemd/system/agi2046.service`：

```ini
[Unit]
Description=AGI2046
After=network.target

[Service]
WorkingDirectory=/srv/agi2046/app
ExecStart=/root/.dotnet/dotnet /srv/agi2046/app/AGI2046.Server.dll
Environment=AGI2046_PORT=5178
Environment=AGI2046_DATA=/srv/agi2046/data
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

HTTPS 还是交给 Caddy（`caddy reverse_proxy 127.0.0.1:5178`）。

---

## 8. 合规（认真看，别踩）

- **域名解析到中国大陆服务器必须 ICP 备案**（腾讯云/阿里云会拦未备案域名）。香港/新加坡**不需要**。
- **公开发行网络游戏需要版号**（《网络出版服务管理规定》）。朋友之间小范围试玩和公开运营是两件事，
  自己拿捏；要正式上线，先走版号/备案流程，别用个人备案站点直接开服收费。
- 别把服务器放在自己家里做「家庭宽带开服」：家宽上行小、没有固定 IP、运营商条款通常也不允许。

---

## 9. 上线检查表

- [ ] 轻量「防火墙」放行 80/443，22 限制来源（不是机器里的 iptables，是控制台那层）
- [ ] `AGI2046_DATA` 指向挂载卷，`docker inspect` 确认挂载存在
- [ ] `curl /api/health` 返回 `ok:true`
- [ ] 两个浏览器能进同一房间并互相同步
- [ ] `docker restart` 后存档还在
- [ ] 备份 cron 跑过一次，`/var/backups/agi2046` 里有 tar
- [ ] 域名 HTTPS 证书自动续期（Caddy 默认 30 天前续，`docker logs caddy` 能看到）
- [ ] 云厂商的「快照/自动备份」也开一份（防误删整机）

---

## 10. 0 元路线：Oracle Cloud Always Free

> 事实核对到 2026-10：Oracle 在 6 月**悄悄把免费 ARM 从 4 核 24G 砍到 2 核 12G**（文档直接改，没发公告），
> 但「永久免费」本身还在，而且 2 核 12G 跑这个游戏绰绰有余（它只要 ~150MB）。

### 10.1 拿到什么

| 资源 | 额度 |
|---|---|
| ARM 实例 `VM.Standard.A1.Flex` | **2 OCPU / 12GB**，可拆成两台 1 核 6G |
| 存储 | 200GB 块存储（系统盘算在里面，默认 47GB 起） |
| 流量 | **出站 10TB/月**，入站免费 |
| 期限 | 只要不超额度，一直免费（不是 12 个月试用） |

### 10.2 四个坑（按踩到的概率排序）

1. **要真信用卡**验证身份（预付卡/虚拟卡会被拒），会有一笔约 $1 的预授权，验证完撤销。
2. **主区域注册后就锁死**，Always Free 只能建在主区域。选 **东京 / 大阪 / 首尔 / 新加坡**，别选美洲。
3. **ARM 经常「Out of host capacity」**：不是你的错，是热门区域免费机满了。换可用域、错峰重试，
   或者用脚本每 10 分钟试一次。**升级成 PAYG 后成功率会明显变高**（额度内仍然 0 元）。
4. **闲置会被回收**：官方规则是「7 天窗口内 CPU 95 分位 <20%、网络 <20%、内存 <20%（ARM）」就有权回收。
   你这台机器空载时三条全中——**这是 0 元方案唯一真正的风险**。

### 10.3 怎么把「被回收」的概率压下去

按靠谱程度排：

| 做法 | 说明 |
|---|---|
| **升级成 PAYG 账户** | 额度内依然 0 元（Always Free 资源升级后照旧免费），社区普遍反馈 PAYG 不会被判闲置。**最推荐**。设一个预算告警（`$0` 也行）兜底 |
| 让它干真活 | 把备份、监控（Uptime Kuma）、定时任务放上去，CPU/网络自然高于 20% |
| 别让它静默 30 天 | 官方 FAQ 还有一条「账户闲置 30 天可能视为废弃」，偶尔登录控制台 + 有真实访问就没事 |
| 有朋友在玩 | 游戏本身有轮询（约 1 秒一次），有人在线时不算闲置 |

> 不要写脚本空转 CPU 去骗检测——那是违反条款的玩法，而且 Oracle 随时能改判据。
> 要么接受「可能没了就重建」（配置脚本都在仓库里，重建 10 分钟），要么升级 PAYG。

### 10.4 开机器 + 部署

```bash
# ① 控制台建实例：Ubuntu 24.04，shape 选 VM.Standard.A1.Flex（1 OCPU / 6GB 起步就够）
#    建的时候把公钥贴进去，别用密码登录

ssh ubuntu@<公网IP>
sudo -i

# ② 一键准备（装 Docker、放行 80/443、小内存加 swap、开 BBR）
#    本地先 scp 上去（仓库没有远端，别用 curl）：
#      scp deploy/vps-setup.sh root@<公网IP>:/root/
#    Oracle 的默认用户是 ubuntu，先 sudo -i 再执行：
bash /root/vps-setup.sh

# ③ 代码 + 起服务（没远端就本地 node tools/deploy/pack.mjs 打包 scp 上来，见 §3.3）
git clone <仓库> /srv/agi2046 && cd /srv/agi2046/deploy
echo "DOMAIN=game.你的域名.com" > .env      # 没域名就 DOMAIN=:80
docker compose up -d --build

# ④ 验收
node tools/deploy/check.mjs http://<公网IP>
```

**两个必须手动做的**（脚本碰不到云控制台）：

1. OCI 控制台 → 实例所在子网 → **安全列表**放行 TCP 80/443（只放行 22 的话，外面永远打不开）。
2. 内存 12G 的 ARM 机器可以跳过 swap；如果你选了 1G 的 AMD 小机，脚本会自动加 2G swap，
   但 .NET 跑联机会吃紧，**不建议用 AMD micro 那两台**。

### 10.5 域名

- 有域名：`DOMAIN=game.xxx.com`，Caddy 自动申证书。
- 没域名：`DOMAIN=:80`，用 `http://IP` 玩。分享按钮走 `execCommand` 兜底（0.25.x 已修），能复制。

---

## 11. 家里那台旧设备 + Cloudflare Tunnel

> 如果你有一台常年开着的 **NAS / 软路由 / 旧笔记本 / 迷你主机**，这条路是**真 0 元且不会被回收**——
> 不占你主力电脑，也不用开公网端口。

```bash
# 设备上（装好 Docker）
git clone <仓库> /srv/agi2046 && cd /srv/agi2046/deploy

# 临时给朋友看（不用注册，地址每次重启会变）
docker compose run --rm tunnel tunnel --no-autoupdate --url http://app:5178

# 长期（推荐）：Cloudflare Zero Trust 建一条 named tunnel
#   Public hostname: game.你的域名.com → http://app:5178
TUNNEL_TOKEN=<token> docker compose --profile tunnel up -d app tunnel
```

三条注意：

1. **不需要开 80/443，也不需要公网 IP**——tunnel 是设备主动往外连，家宽没有固定 IP 也能用。
2. **域名**：named tunnel 需要一个托管在 Cloudflare 的域名（域名本身要钱，约 ¥60–100/年）；
   quick tunnel（`--url`）不要钱但地址每次重启都变。
3. **设备得一直开着**——但 NAS/软路由本来就是 24 小时开的，等于白捡。
   断电/搬家就断服，这是它唯一的短板。

> 存档在 `agi-data` 卷里，备份脚本同样适用（把 `VOLUME` 指到 compose 生成的卷名）。

---

## 12. 一句话总结

**想省心**：买台香港轻量云，`git clone` + `docker compose up -d`，配个域名，完事（¥25–60/月）。
**不想花钱**：Oracle 免费 ARM（2 核 12G）跑同一套 compose，0 元，代价是可能被回收、要会重建（§10）。
**有 NAS**：家里设备 + Cloudflare Tunnel，0 元且最稳，只是设备得一直开着（§11）。

三条路的部署命令完全一样——同一份 `Dockerfile`、同一份 `docker-compose.yml`，
换的只是「机器从哪来」。存档始终在 `agi-data` 卷里，搬家就是 `docker save` + 卷打包带走。
