# 0.15 内容层改进方案 —— 三个瓶颈与同类游戏的解

> **历史文档，仅作背景。**
> 当前实现状态、验收数字与已知限制一律以 [`HANDOFF.md`](../HANDOFF.md) 和 [`README.md`](../README.md) 为准；
> 本文描述的是当时的计划或审计快照，其中的版本号、文件路径和行为可能已经变化。

> 2026-10-25 · 承接 `docs/PLAN-0.13.md` / `docs/PLAN-0.14.md`（系统层已清空）
> 这一份只谈**内容**：第三幕 Boss、觉醒系统、支线数量。
> 结论先行：三个问题都有现成解，而且本作的代码框架**已经预留了接口**，不需要大改。

---

## 0. 修正：我第一版判断错了，先把账算清

> **⚠️ 这一节是修正记录。**第一版我把 `g_protocol` 当成了第三幕的 Boss 组，据此写下
> "第三幕 Boss 是三个杂兵、没有 BossPattern"。**这个判断是错的**，实施时才发现。

错在哪：

| 我第一版写的 | 实际情况 |
|---|---|
| 第三幕 Boss = `g_protocol`（执剑者 + 天使 + 猎犬） | `g_protocol` 是**第三幕的普通战斗组**（`MapGenerator:375`） |
| 第三幕没有 Boss 机制 | Boss 节点用的是 `actDef.BossGroup = "g_boss3"` |
| — | `g_boss3 = [e_boss_zero, e_blade_zero, e_orbit_guard, e_seraph]` |

**修正后的真实数据：**

| 项 | 第一幕 Boss | 第二幕 Boss | 第三幕 Boss |
|---|---|---|---|
| 单位 | 拍卖人 | 镜面执政官 | **零号协议·主脑** |
| HP | 90 | 125 | **165** |
| `Role` | 首领 | 首领 | **首领** |
| `BossPattern` | `auctioneer` | `archon` | **`zero`** |
| `BossShieldThreshold` | 60 | 55 | **50** |
| `BossSummonLimit` | 99 | 1 | **2** |
| 技能数 | 4 | 4 | **5** |

**第三幕 Boss 不但完整，而且是三幕里最强的**：165 HP、`boss_aoe`（零号脉冲）、
`boss_shield`（终焉壁垒 14 护盾 +3 甲）、`boss_summon`（碎片增殖）、`boss_delete`（删除请求）。
真机实测这场战斗打了 **50+ 步（约 12 轮）**，不是秒杀。

**所以 §1 的方案从"造一个 Boss"改成了"给已经完整的 Boss 补两个它真正缺的压力点"**。
这两个缺口是真实的（见 §1.2），但严重程度远低于我第一版的描述。

### 0.1 仍然成立的三个数字

| 项 | 数值 | 问题 |
|---|---|---|
| 觉醒技能 | **48 条**（16 角色 × 3） | 全局只能 1 人觉醒 → 一局最多看到 **3 条（6.25%）** |
| 觉醒节点 | 6 个（每幕 2） | 4 人队里 **3 个人永远摸不到**自己的觉醒 |
| 支线 | **6 条**（每幕 2） | 按 `slot` 硬绑节点，`QuestForAct(act, slot)` 无随机 |

> 这三个数字是逐个核对数据表得来的，§2 / §3 的方案建立在它们上面。

---

## 1. 第三幕 Boss：给已经完整的 Boss 补两个压力点

### 1.1 同类怎么做


**Slay the Spire 第三幕的三个 Boss 全是"反流派"，不是数值更高：**

| Boss | 机制 | 克制什么 |
|---|---|---|
| 觉醒者（Awakened One） | 玩家每打一张能力牌，它 +2 力量；两条命 | 能力流 |
| 时间吞噬者（Time Eater） | 玩家每出 **12 张牌强制结束回合** | 无限连/低质量循环 |
| 甜甜圈兄弟（Donu & Deca） | 一个加力量、一个加护盾，互相成长 | 单点爆发 |

来源：[Slay the Spire 设计拆解·内容篇](https://yifei-huang-cos.top/posts/98ac3117/)、[Bosses Guide](https://www.highgroundgaming.com/slay-the-spire-bosses-guide/)

第二幕的 The Champ 更直接：**HP 50% 时清空自身 debuff、+6 力量、立刻进二阶段**，第一次出手就是 10×2 的 Execute。
来源同上。

**Darkest Dungeon 的补充**：Boss 必须"特殊攻略法"才能破，有的打错目标会暴走、有的持续变形、有的自己不攻击但不断召唤。
来源：[IGN Review](https://www.ign.com/articles/darkest-dungeon-review)、[巴哈心得](https://home.gamer.com.tw/creationDetail.php?sn=3755634)

**Gloomhaven 的定位**：Boss 是"强度验证"——检验你这套构筑到底成不成立。
来源：[Roguelike 设计方法](https://www.yuque.com/kanfeiji-idtso/qc76el/katw007dgn41warm)

### 1.2 本作的框架已经够用

`CombatEngine.ChooseEnemyAction` 里已经有一个通用的 Boss 分支：

```csharp
if (bossDef?.Role == "首领")
{
    if (enemy.Hp < enemy.MaxHp * bossDef.BossShieldThreshold / 100 && enemy.Shield <= 0 && shield is not null)
        chosen = shield;                                    // 低血开盾
    else if (aliveEnemies < bossDef.BossAddCap && summoned < budget && summon is not null)
        chosen = summon;                                    // 召唤援军
    else
        chosen = usable.FirstOrDefault(s => s.Special == "boss_aoe") ?? ...;
}
```

**只要有 `Role = "首领"` + 三个带 `boss_shield` / `boss_summon` / `boss_aoe` 的技能，第三幕就能立刻拥有和拍卖人同级的机制。**

### 1.3 真正缺的两个东西

对着 `e_boss_zero` 的五个技能逐个看，它的缺口很具体：

| 现有技能 | Special | 覆盖了什么 |
|---|---|---|
| 零号脉冲 | `boss_aoe` | ✓ 群体压力 |
| 终焉壁垒 | `boss_shield` | ✓ 爆发窗口（14 护盾 +3 甲） |
| 碎片增殖 | `boss_summon` | ✓ 清场压力 |
| 删除请求 | **（空）** | ❌ 只是一发单体 2×80%，名字叫"删除"但没有删除的感觉 |
| 超频 | （空） | ✓ 自身强化 |
| — | — | ❌ **完全没有资源压力**：打终局时玩家背包里那堆药，它一无所知 |

**所以缺口是两个，不是"整个 Boss 缺"：**

1. **没有任何反囤积机制**。前两幕的商店、掉落、事件都在往背包里塞东西，
   而玩家几乎必然把它们攒到终局。没有代价的话，这些内容在最后一场变成"既用不上也用不完"。
2. **「删除请求」名不副实**。它听起来像处决，实际是一发普通单体攻击。

### 1.4 方案：两处数据改动（已实施）

**不动 Boss 本体，只给它补两行数据。**

| 改动 | 内容 | 反什么 |
|---|---|---|
| `e_zero_pulse` 加 `E("purge_item", 1)` | 零号脉冲命中时，**全队合计归档 1 件消耗品**；冷却 1 → 2 | 反囤积 |
| `e_zero_delete` 加 `E("execute", 30)` + `.Special = "boss_execute"` | 目标生命低于 30% 时直接删除；冷却 2 → 3 | 反龟缩换血 |

配套两处引擎改动：

```csharp
// 1) 新增效果：归档（ApplyEffectsPerTarget 里加一个 case）
case "purge_item":
    PurgeConsumables(state, combat, Math.Max(1, effect.Amount), rng);
    break;

// 2) Boss 决策：残血阶段优先处决，且专挑血最少的人
var execute = usable.FirstOrDefault(s => s.Special == "boss_execute");
if (execute is not null && enemy.Hp < enemy.MaxHp * 25 / 100)
{
    chosen = execute;
    targetForSkill = combat.Units.Where(u => u.Side == Side.Player && !u.Downed)
        .OrderBy(u => u.Hp).FirstOrDefault() ?? defaultTarget;
}
```

**「归档」必须按全队合计算，这是实测踩出来的**：

第一版写成"每人 N 件"，4 人队一次掉 4 件、9 轮把 16 件全清空
（探针输出：`消耗品 16 → 0`）。那不是惩罚囤积，是没收。
改成"全队合计 1 件"后变成 `16 → 9`——一场恶战拿走七八件，有痛感但不至于毁掉积累。

### 1.4.1 引擎能力核对（实施后更新）

| 需求 | 现状 |
|---|---|
| 处决（HP < 30% 秒杀） | ✅ **已有**：`E("execute", 30)` + `case "execute"`，终审判决/末日审判在用 |
| 护盾 / 召唤 / 全体降伤 | ✅ 全部现成 |
| 战斗中移除玩家消耗品 | ⚠️ **新增 12 行**：`PurgeConsumables`（`ApplyEffectsPerTarget` 本来就带 `state`，不用改签名） |
| 残血优先处决 | ⚠️ **新增 6 行**：Boss 决策分支 |
| 护盾反弹 | ❌ 不存在 → **放弃这条**，改用 `debuff_all_enemies` |

### 1.4.2 探针验证（`tools/audit/BossProbe.cs`，7/7 通过）

```
PASS  第三幕 Boss 的 Role 是「首领」            —  Role = 首领
PASS  四个 Boss 分支技能齐全                    —  boss_aoe, boss_shield, boss_summon, boss_execute
PASS  Boss 血量高于前两幕（90 / 125）           —  HP = 165
PASS  Boss 出现在战斗里                         —  零号协议·主脑 165/165，护甲 6，抗性 6
PASS  「归档」真的拿走了消耗品                  —  消耗品 16 → 9；日志里有「归档完成」
PASS  Boss 会使用「删除请求」                   —  日志里出现过
PASS  Boss 战持续了足够轮数（不是秒杀）         —  打到第 9 轮
```

> 探针里玩家只「结束回合」不还手，所以必败——它验证的是**机制有没有生效**，不是平衡。
> 平衡仍然靠真机 `browser-e2e`。


## 2. 觉醒：从"全队只能一人"到"每人都有一次"

### 2.1 同类怎么做

**Wildermyth 的变身系统**：
- 变身来自**随机事件**，不是固定节点
- **逐部位渐进**：第一次事件只换一条手臂，之后每次进新章节可以选择再进化一个部位
- **可选**：玩家可以暂缓，等更想要的变身
- **每个角色都能获得**，一个队里可以四个人全是"四不像"
- 变身改变战斗能力（新技能/攻击），不只是外观

来源：[PC Gamer](https://www.pcgamer.com/great-moments-in-pc-gaming-transforming-a-hero-into-something-bizarre-in-wildermyth)、[Wildermyth Wiki: Theme](https://www.wildermyth.com/w/index.php?oldid=19905&title=Theme)、[玩法回顾](https://steamcommunity.com/id/illuswav/recommended/763890)

**Gloomhaven 的个人任务**：
- 每个角色创建时抽 2 张个人任务卡、选 1 张
- 任务条件五花八门："完成 3 个地穴场景""拥有 13 件物品""杀 20 种不同怪物"
- **每个角色有自己的目标，不需要抢同一个**
- 完成后退休，解锁新角色

来源：[Personal Quests - Gloomhaven Wiki](https://gloomhaven.fandom.com/wiki/Personal_Quests)

**高光分配理论**（这篇是本轮最有价值的）：

| 类型 | 做法 | 问题 |
|---|---|---|
| 被动高光 | 给某个角色独特技能 + 场景硬性要求（需要盗贼开锁） | 不主动的玩家会忘记用；老手会"接管指挥" |
| 间接主动高光 | Helldivers：制造一个"必须有人去做"的情境，但不指定谁 | 失败要有代价，否则不酷 |
| **直接主动高光** | "这把剑只有你能用，天选之人" | —— |

来源：[Play and Privilege](https://trickdempsey.com/index.php/2015/10/12/play-and-privilege/)

**本作的"全局只能一人觉醒"是典型的"直接主动高光"——但只发一份，谁先抢到归谁。**
4 人队里，这等于**三个人全程当配角**，而且是被系统写死的。

### 2.2 方案：每人一次 + 回声共鸣

**核心改动（一处）**：`GameEngine.Awaken` 的全局检查改成"自己有没有觉醒过"。

```csharp
// 旧：一旦有人觉醒，其他人全部被拒
if (!string.IsNullOrEmpty(state.AwakenedPlayerId)) { ...拒绝... }

// 新：只检查这个人自己
if (p.Awakened) { state.Message = "你已经找回过自己一次。回声不再回应。"; return state; }
```

**配套设计**：

| 项 | 现在 | 改后 |
|---|---|---|
| 觉醒名额 | 全队 1 人 | **每人 1 次** |
| 觉醒节点 | 6 个，抢 | 6 个，**每个节点仍只能被取走一次**（节点唯一，人可多） |
| 48 条觉醒技 | 一局看到 3 条（6.25%） | 4 人队看到 **12 条（25%）** |
| 叙事 | "这段回响跟着别人走了" | "这个回声已经被取走了，去下一个" |

**加一条"共鸣"让多人觉醒不只是叠加**：

> 每有一名已觉醒的队友，全队获得 **+1 护甲 / +1 抗性 / +5 最大生命**（上限 3 层）。

理由：Gloomhaven 的退休是"解锁新东西"，Wildermyth 的变身是"每个人更独特"。
本作的觉醒是"找回自己"——**多人觉醒应该有"队伍更完整"的叙事回报，而不只是数值叠加**。

**风险与对策**：

| 风险 | 对策 |
|---|---|
| 4 人全觉醒会让第三幕太简单 | 第三幕 Boss 同步加强（见 §1）；共鸣给的是防御不是输出 |
| 6 个节点不够 4 人分 | 每幕 2 个 × 3 幕 = 6 ≥ 4 ✓；但要保证每幕至少 1 个可达（`DataAudit` 已有可达性断言） |
| "唯一性"的叙事张力消失 | 保留"节点唯一"：一个回声只能被一个人取走，先到先得。**稀缺的是回声，不是名额** |

### 2.3 实施记录（已落地）

改的过程中发现一个前提是错的：**每幕只放了 1 个觉醒节点**（`fixedCells[(AwakenLayer, ...)]` 单点），
不是我原以为的 2 个。也就是说光改 `Awaken` 的判断，4 人队里仍然只有 1 个人能觉醒。

所以实际改了三处：

| 改动 | 内容 |
|---|---|
| `GameEngine.Awaken` | 去掉 `AwakenedPlayerId` 全局检查，改成检查 `node.Cleared`（节点唯一）与 `p.Awakened`（个人一次） |
| `MapGenerator` | `AwakenSlots = { (9,3), (7,2) }`，每幕 2 个；小战斗配额 20 → 19 保持总节点数不变 |
| `PlayerState.AwakenResonance` | 共鸣层数，`RecalculatePlayer` 里 +护甲/+抗性/+5×层 最大生命，上限 3 层 |

**共鸣给的是防御不是输出**（护甲/抗性/生命），所以不会让第三幕变成"数值碾压"。

`tools/audit/AwakenProbe.cs` **12/12 通过**：

```
PASS  地图上有至少 2 个觉醒节点              —  共 2 个
PASS  第一个人觉醒成功                        —  白垩 Awakened=True
PASS  觉醒共鸣 1 层（自己也吃）               —  Resonance=1
PASS  全队护甲 +1 / 最大生命 +5               —  4→5 / 40→45
PASS  同一节点不能重复觉醒（回声已被取走）    —  宪章 Awakened=False
PASS  第二个人在另一个节点也能觉醒            —  宪章 Awakened=True
PASS  两人都觉醒后共鸣升到 2 层               —  白垩=2 / 宪章=2
PASS  全队护甲 +2 / 最大生命 +10              —  4→6 / 40→50
PASS  已觉醒的角色重复交互不消耗 AP           —  AP 3 → 3
PASS  觉醒后技能换成觉醒版                    —  gpt_1_awakened,gpt_2_awakened,gpt_u_awakened
```

---

## 3. 支线：从 6 条固定到"池化 + 参数化"

### 3.1 同类怎么做

**Gloomhaven**：95 个场景 + 分支叙事 + 模块化（场景/角色/敌人可混搭），
重玩价值来自"不同职业组合 + 不同剧情分支"。
来源：[Steam 商店页](https://store.steampowered.com/app/780290/Gloomhaven/)、[评测](https://bghut.com/goods-6106.html)

**The Binding of Isaac**：700+ 道具不失控，靠的是**三层筛选**——章节、房间类型、道具池。
来源：[Roguelike 随机系统设计](https://tuyaart.com/news/2026-10-08_e556eb.html)

**For The King 的正反两面**（用户提过这款，值得细看）：

| 做法 | 评价 |
|---|---|
| 地图/事件/支线**程序化生成** | ✅ 正面："every run is unique" |
| 支线与主线无关、随机刷出 | ✅ 正面：给了玩家"要不要绕路"的决策 |
| **主线任务每次重开都一样** | ❌ 被明确批评："After a few plays I found myself wanting to check out a new town... but I could not" |
| 混沌计时 + 等级压力 + 支线压力叠加 | ❌ 被批评："玩家最后很可能不是死于随机性，而是死于混沌和 12345 合起来的压力" |

来源：[Gamecritics 评测](https://gamecritics.com/aj-small/for-the-king-review/)、[3DM 评测](https://m.3dmgame.com/score/3671226.html)、[Phenixx 评测](https://web.phenixxgaming.com/?post_type=post&p=3181)

**给本作的两条教训**：
1. **支线要随机，主线要稳**——FTK 恰恰做反了（支线随机 ✓、主线固定 ✗）。本作主线是三幕固定结构，没问题；支线该随机。
2. **不要叠加压力**——本作已经有电子追踪（时钟）+ 队伍生命 + 信号三层压力，支线**必须保持"纯可选、不接就消失"**。这一点现有设计是对的，不能改。

**事件系统的工程经验**（独游魔盒）：
- 事件分四类，**不要一个大池混抽**
- 同类事件冷却（避免连续同类型打击）
- 压力预算制（一段时间窗内的事件总压力有上限）
- **恢复窗口保护**：玩家状态低于警戒线时，冻结高压力事件

来源：[威胁事件系统：随机事件、节奏控制与难度曲线](https://xmohe.com/techie/special/rimworld-like/05-threat-event-system)

### 3.2 本作的确切瓶颈

```csharp
// MapGenerator.cs:262
case NodeType.Echo:
    var echoQuest = GameData.QuestForAct(act, echoSlot);   // 按幕+序号硬取，无随机
    node.QuestId = echoQuest?.Id;
```

```csharp
// GameData.Quests.cs:11
public static QuestDef? QuestForAct(int act, int slot) =>
    Quests.Values.Where(q => q.Act == act).OrderBy(q => q.Id, StringComparer.Ordinal).Skip(slot).FirstOrDefault();
```

**每幕永远只有那 2 条**，第二周目和第一周目一模一样。

### 3.3 方案：每幕 5 条池、每局抽 2 条、目标参数化

**第一步：扩池（6 → 15 条，每幕 5 条）**

新增 9 条，每条只需 8 个字段 + 3 段文案（Body / DoneText / Objective）。
参考现有 4 种 `Kind`，再补 2 种：

| Kind | 现有 | 新增 |
|---|---|---|
| `fetch` 寻物 | ✓ | |
| `hunt` 猎杀 | ✓ | |
| `explore` 探索到某层 | ✓ | |
| `action` 特定行动 | ✓ | |
| **`purge` 清巢** | | 清空某层的全部敌人（比 hunt 更重） |
| **`escort` 护送** | | 带某个 NPC 抵达终点（用现有节点移动模拟） |

**第二步：按 seed 抽（不新增状态字段）**

```csharp
// GameData.Quests.cs
public static QuestDef? QuestForAct(int act, int slot, int seed)
{
    var pool = Quests.Values.Where(q => q.Act == act).OrderBy(q => q.Id, StringComparer.Ordinal).ToList();
    if (pool.Count <= 2) return pool.Skip(slot).FirstOrDefault();
    // 同一局内同一幕的两个残响必须抽到不同的支线：用 seed + act 洗牌后取前 2
    var rng = new Random(seed ^ (act * 7919));
    var picked = pool.OrderBy(_ => rng.Next()).Take(2).ToList();
    return picked.Skip(slot).FirstOrDefault();
}
```

`MapGenerator` 已经有 seed（`state.Seed`），直接传进来即可。

**第三步：目标参数化（同一模板的变体）**

现有 `TargetCount` 是写死的。改成按 seed 浮动：

| 支线 | 现在 | 改后 |
|---|---|---|
| 清道（hunt） | 固定 3 场 | 3–4 场（seed 决定） |
| 还给我（fetch） | 固定 1 件工牌 | 1–2 件（数量浮动） |
| 探索 | 固定某层 | 第 2–4 层随机 |

浮动范围小（±1），既能让第二周目有变化，又不会让奖励失衡。

**为什么不做"程序化叙事生成"**：
本作的支线文案是**手写的、带人物弧光的**（"周也。下城区排污班。4471。"）。
程序化生成会立刻毁掉这个质感。**池化 + 参数化就够了**——Gloomhaven 的 95 个场景也是手写的。

**验证方式**：
- `DataAudit`：每幕池 ≥ 5 条；任意 seed 下 `QuestForAct(act,0) != QuestForAct(act,1)`
- 多 seed 跑：连续 5 个 seed 的抽中组合不全相同

### 3.4 实施记录（已落地）

**写了 9 条新支线**（每幕 3 条，共 15 条），全部用现有的 4 种 `Kind` 的变体——
原本方案里提的 `purge` / `escort` 两种新类型需要写新钩子，收益不抵成本，放弃了。

| 幕 | 新增 | Kind |
|---|---|---|
| 一 · 霓虹港 | 还在呼吸的东西 / 换班记录 / 收据 | explore / action / fetch(treasure) |
| 二 · 镜海穹顶 | 手套 / 没有听众的合唱 / 别让他们看见 | fetch(mirror) / explore / hunt(elite) |
| 三 · 零号轨道 | 货运清单 / 安静下来 / 主脑的歌 | fetch(any) / hunt / explore |

顺带补了一个钩子：`fetch` 的 `Source` 原来只认 `corpse` / `mirror` / `any`，
新增 `treasure`（只从宝库找），否则「在宝库里找那张收据」会退化成"任意搜刮"。

**抽样验证**（`DataAudit`）：

```
PASS  15 条支线（每幕 5 条池）
PASS  每幕池 >= 5 条，且 QuestForAct 按 seed 抽 2 条
PASS  不同 seed 抽到的支线组合不同（第二周目不会一字不差）
```

### 3.5 顺带修掉的一个潜伏测试 bug

`systems-check` 的 `walkTo()` 里有这么一行：

```js
if (node(step).type === 'trap') return step;   // 走到陷阱就停
```

它等于"路径上有陷阱就到不了目标"。地图结构一变（这次多放了一个觉醒节点），
某条路径上就出现了陷阱，测试直接崩在"只能与当前节点互动"。

**这条 bug 和游戏本身无关，是测试写窄了**。陷阱进入即触发一次、之后 `cleared`，继续走就行。

---

## 4. 优先级、工作量与风险

| 顺序 | 方案 | 实际改动量 | 状态 |
|---|---|---|---|
| **①** | 第三幕 Boss（§1） | 2 行数据 + 18 行引擎 + 1 个探针 | ✅ **已实施** |
| **②** | 觉醒每人一次（§2） | 1 处判断 + 1 个共鸣字段 + 1 个地图槽位 + 1 个探针 | ✅ **已实施** |
| **③** | 支线池化（§3） | 9 条文案 + 3 处代码 + 断言更新 | ✅ **已实施** |

**建议顺序的理由**：
- Boss 是"体验最差、改动最小"的一项——玩家打完两幕，终局却是三个杂兵，这是最刺眼的问题
- 觉醒的改动只有一处判断，但它牵动叙事（"唯一性"），需要你拍板
- 支线的收益在第二周目才体现，而且写文案最花时间

**三个方案都不碰系统层**：不加新资源、不加新相位、不加新计时器。
FTK 的教训就在那里——**内容不够时加压力系统是饮鸩止渴**。

---

## 5. 如果只能做一件事

**做 §1（第三幕 Boss）。**

因为它是唯一一个"不改任何系统、只加数据、就能让终局体验翻倍"的改动，
而另外两项的收益都要等玩家开第二局才显现。
