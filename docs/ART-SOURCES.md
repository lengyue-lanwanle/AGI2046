# 美术与音效素材来源 / Credits

> **历史文档，仅作背景。**
> 当前实现状态、验收数字与已知限制一律以 [`HANDOFF.md`](../HANDOFF.md) 和 [`README.md`](../README.md) 为准；
> 本文描述的是当时的计划或审计快照，其中的版本号、文件路径和行为可能已经变化。

本项目的美术资产分两类：**自产图**（ImageGen 生成 + `tools/art/*.py` 后期，自有版权）与**外部素材**（下列）。

> 0.19.1 之前还有一批 Pillow 程序化生成的占位图（`tools/art/generate-art.py`，输出到 Unity 工程），
> 随 Unity 版一起移除了；现在 `web/assets/` 里没有任何那张脚本产出的图。

## 节点图标（14 个）

来源：**Game-icons.net**，许可 [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)。
导出时清除了原图背景元素并统一为白色前景，供 CSS `mask` 着色使用。

| 用途 | 图标 | 作者 |
|---|---|---|
| combat | crossed-swords.svg | lorc |
| skirmish | broad-dagger.svg | lorc |
| elite | shield.svg | badges |
| boss | skull.svg | badges |
| event | scroll-unfurled.svg | lorc |
| shop | shop.svg | delapouite |
| safehouse | campfire.svg | lorc |
| server | server-rack.svg | delapouite |
| treasure | chest.svg | delapouite |
| terminal | radar-sweep.svg | lorc |
| corpse | tombstone.svg | lorc |
| echo | sound-waves.svg | skoll |
| awakening | sparkles.svg | delapouite |
| trap | spikes.svg | sbed |

> 分发时请保留本节与原作者署名，或到 game-icons.net 按图标名查找原页面。

## 资源图标（8 个）

来源：**Game-icons.net**，许可 [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)。

| 用途 | 图标 | 作者 |
|---|---|---|
| 电子追踪 | crosshair.svg | lorc |
| 记忆币 | coins.svg | lorc |
| 合金 | metal-bar.svg | lorc |
| 生命 / HP | heart.svg | lorc |
| AP | sprint.svg | delapouite |
| Focus | eye-target.svg | delapouite |
| 密钥 | key.svg | lorc |

## 音效（战斗打击 / 脚步）

来源：**Kenney · Impact Sounds**，许可 CC0（[kenney.nl](https://kenney.nl/assets/impact-sounds)）。

| 文件 | 原文件 | 用途 |
|---|---|---|
| `web/assets/audio/hit-light.ogg` | impactGeneric_light_000.ogg | 普攻命中 |
| `web/assets/audio/hit-heavy.ogg` | impactGeneric_light_002.ogg | 技能命中 |
| `web/assets/audio/step.ogg` | footstep_concrete_000.ogg | 移动 |

## BGM（探索 / 战斗）

来源：**OpenGameArt · Residual World - 4 Game Audio Samples (CC0)**，作者 SRG774，许可 CC0。
原页面：https://opengameart.org/content/residual-world-4-game-audio-samples-cc0 （作者注明「未使用 AI」）

| 文件 | 原文件 | 用途 |
|---|---|---|
| `web/assets/audio/bgm-explore.mp3` | sample1.mp3（Main Theme） | 探索/地图 |
| `web/assets/audio/bgm-battle.mp3` | sample3.mp3（Jam） | 战斗 |

## 3D 战斗地面贴图

来源：**Poly Haven · brushed_concrete_04**（diffuse 1k），许可 CC0。
https://polyhaven.com/a/brushed_concrete_04

| 文件 | 用途 |
|---|---|
| `web/assets/textures/floor.jpg` | Three.js 战斗地面（缩到 512，53KB） |

## 已验证可下载、尚未接入

| 素材 | 来源 | 许可 | 说明 |
|---|---|---|---|
| Kenney UI Pack | kenney.nl/assets/ui-pack | CC0 | 按钮/面板/字体/音效，1.2MB |
| Kenney Game Icons | kenney.nl/assets/game-icons | CC0 | 105 个 UI 控件图标 |
| Poly Haven 贴图 / HDRI | polyhaven.com | CC0 | Three.js 战斗地面与环境光 |

## 不可用

- `itch.io`：连接超时（当前网络不可达）
- `craftpix.net`：403
- 知乎原文链接：403（反爬），无法读取具体清单
