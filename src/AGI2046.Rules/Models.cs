using System.Text.Json.Serialization;

namespace AGI2046.Rules;

public enum GamePhase { Exploration, Combat, Event, Coop, Shop, Safehouse, ActTransition, Victory, Defeat }
public enum NodeType { Start, Event, Combat, Skirmish, Elite, Shop, Safehouse, Terminal, Treasure, Key, Boss, Blank, Trap, Corpse, Server, KeyElite, Awakening, Echo }
public enum Side { Player, Enemy }
public enum DamageType { Physical, Tech }
public enum TargetType { Enemy, Ally, Self, AllEnemies, AllAllies, Area, None }

/// <summary>
/// 一局的玩法模式。Standard 是正式三幕 Roguelike；Tutorial 是固定教学，不进入三幕流程；
/// Challenge 预留给 0.21 的规则变异局。
/// </summary>
public enum GameMode { Standard, Tutorial, Challenge }

/// <summary>教学步骤。顺序即玩家要走的固定流程，前端按 Steps 画进度。</summary>
public enum TutorialStep { Intro, Move, Attack, Skill, EnemyIntent, EndTurn, Resource, Retreat, Complete }

/// <summary>一步教学要玩家做什么、为什么做、做不了时看哪里。</summary>
public sealed class TutorialGoal
{
    public string Title { get; set; } = "";
    public string Detail { get; set; } = "";
    public string Hint { get; set; } = "";
    public string Why { get; set; } = "";
    /// <summary>按钮上的短标签，例如「知道了」「我看到了」。</summary>
    public string ActionLabel { get; set; } = "下一步";
    /// <summary>要在 UI 上高亮的元素：node / basic / skill / intent / endturn / item / retreat / safehouse。</summary>
    public string Focus { get; set; } = "";
}

/// <summary>
/// 教学状态。只存在于 Tutorial 模式的存档里；完成或跳过都不会写进正式对局。
/// </summary>
public sealed class TutorialState
{
    public bool Active { get; set; } = true;
    public TutorialStep Step { get; set; } = TutorialStep.Intro;
    public List<TutorialStep> Steps { get; set; } = new();
    public List<TutorialStep> Done { get; set; } = new();
    public TutorialGoal Goal { get; set; } = new();
    public bool FirstTime { get; set; } = true;
    public bool Skippable { get; set; } = true;
    public bool Skipped { get; set; }
    public bool Completed { get; set; }
    public bool Failed { get; set; }
    /// <summary>上一步被拒的原因。前端只显示一条，别堆成错误日志。</summary>
    public string? Blocked { get; set; }
}

/// <summary>目标面板上的一条目标。</summary>
public sealed class GoalItem
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Detail { get; set; } = "";
    /// <summary>mercy / key / level / quest / gear / exp。</summary>
    public string Kind { get; set; } = "";
    public bool Done { get; set; }
    public int Progress { get; set; }
    public int Target { get; set; }
    [JsonIgnore]
    public int Percent => Target <= 0 ? 0 : Math.Clamp(Progress * 100 / Target, 0, 100);
}

/// <summary>
/// 「此刻最重要的事」的唯一出口。主目标永远只有一个；近期目标最多三条；
/// 支线不在这里（它们有自己的面板），避免支线压过主线。
/// </summary>
public sealed class ObjectiveBoard
{
    public string Main { get; set; } = "";
    public string Current { get; set; } = "";
    public string Progress { get; set; } = "";
    public string Recommended { get; set; } = "";
    public string Risk { get; set; } = "";
    public List<GoalItem> Near { get; set; } = new();
    public List<string> Failure { get; set; } = new();
    /// <summary>目标文本变化时的说明，写进行动记录用。</summary>
    public string Change { get; set; } = "";
    public int Round { get; set; }
}

/* ── 0.21 挑战模式 / 复盘 / 评级 ─────────────────────────────────── */

/// <summary>一条规则变异。说明、风险、奖励、适合策略都必须能在开局前看到。</summary>
public sealed class MutatorDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Desc { get; set; } = "";
    public string Risk { get; set; } = "";
    public string Reward { get; set; } = "";
    public string Strategy { get; set; } = "";
    /// <summary>结算倍率（只影响评分，不直接改数值）。</summary>
    public double ScoreMul { get; set; } = 1.1;
    /// <summary>需要先解锁才能选。</summary>
    public string? UnlockId { get; set; }
}

/// <summary>开局时选择的挑战配置。同一 seed + 同一变异 = 同一张图。</summary>
public sealed class ChallengeConfig
{
    public string? ChallengeId { get; set; }
    public int Seed { get; set; }
    public List<string> MutatorIds { get; set; } = new();
    /// <summary>normal / hard / nightmare，只影响评分倍率与敌人强度微调。</summary>
    public string Difficulty { get; set; } = "normal";
}

/// <summary>一局挑战的元数据，随存档落盘。</summary>
public sealed class ChallengeRun
{
    public string? ChallengeId { get; set; }
    /// <summary>
    /// 这一局是什么性质：
    ///   standard    标准局（没有挑战配置）
    ///   custom_seed 挑战模式但没勾变异 —— 规则等同标准局，只是固定种子，用来复现同一张图
    ///   mutated     勾了至少一个变异
    /// 三者都走同一条规则路径，区别只在展示与复盘描述。
    /// </summary>
    public string Kind { get; set; } = "standard";
    public int Seed { get; set; }
    public List<string> MutatorIds { get; set; } = new();
    public string Difficulty { get; set; } = "normal";
    public double ScoreMultiplier { get; set; } = 1.0;
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string? Result { get; set; }
}

/// <summary>本局统计。只存摘要，不存完整日志（训练/复盘都够用）。</summary>
public sealed class RunStats
{
    public int Battles { get; set; }
    public int Victories { get; set; }
    public int DamageDealt { get; set; }
    public int DamageTaken { get; set; }
    public int SkillsUsed { get; set; }
    public int UltimatesUsed { get; set; }
    public int ItemsUsed { get; set; }
    public int RetreatAttempts { get; set; }
    public int RetreatSuccess { get; set; }
    public int CombatRounds { get; set; }
    public int Moves { get; set; }
    public int Assists { get; set; }
    public int SynergyTriggers { get; set; }
    public int EliteKills { get; set; }
    public int BossTradesOffered { get; set; }
    public int BossTradesAccepted { get; set; }
    public Dictionary<string, int> SkillUse { get; set; } = new();
    public Dictionary<string, int> DamageBySkill { get; set; } = new();
    /// <summary>本局见过的敌人（档案里用来区分「已记录 / 未知」）。</summary>
    public List<string> SeenEnemies { get; set; } = new();
    /// <summary>本局进过的事件（同上）。</summary>
    public List<string> SeenEvents { get; set; } = new();
    /// <summary>本局见过的节点类型，档案里当「地图认知」用。</summary>
    public List<string> SeenNodes { get; set; } = new();
}

/// <summary>拍卖人开出的一笔交易。State: open / accepted / declined。</summary>
public sealed class BossTrade
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Cost { get; set; } = "";
    public string Gain { get; set; } = "";
    public string Detail { get; set; } = "";
    public string State { get; set; } = "open";
}

/// <summary>
/// 首领专属机制状态（0.24）。三个首领各一套：
///   auction  拍卖人：交易 → 拒绝则变强，接受则付代价
///   mirror   镜面执政官：学习玩家最近的技能类型，镜像抗性跟着变
///   protocol 主脑：关闭格子 + 限时并行目标
/// 只放「玩家能看见并据此决策」的字段。
/// </summary>
public sealed class BossMechanicState
{
    public string BossId { get; set; } = "";
    public string Kind { get; set; } = "";
    public string Title { get; set; } = "";
    public string Hint { get; set; } = "";
    /// <summary>镜面：正在学习的伤害类型（physical / tech / none）。</summary>
    public string LearnType { get; set; } = "";
    public int LearnStacks { get; set; }
    /// <summary>拍卖人：拒绝次数 → 每次 +2 伤害。</summary>
    public int Refusals { get; set; }
    public int Accepted { get; set; }
    public List<BossTrade> Trades { get; set; } = new();
    /// <summary>主脑：被关闭的格子（"col,row"）。</summary>
    public List<string> ClosedCells { get; set; } = new();
    /// <summary>主脑：并行目标单位 id。</summary>
    public List<string> ProtocolNodes { get; set; } = new();
    /// <summary>主脑：并行目标的截止轮。</summary>
    public int DeadlineRound { get; set; }
    public List<string> Flags { get; set; } = new();
}

/// <summary>一幕开始时的计数快照。只存数字，不参与判定。</summary>
public sealed class ActSnapshot
{
    public int Act { get; set; } = 1;
    public int Battles { get; set; }
    public int Victories { get; set; }
    public int Events { get; set; }
    public int Assists { get; set; }
    public int Synergies { get; set; }
    public int Nodes { get; set; }
}

/// <summary>结局复盘：一局为什么成功或失败。字段都来自规则层，前端只负责排版。</summary>
public sealed class RunReview
{
    public bool Victory { get; set; }
    public string FailureStage { get; set; } = "";
    public string Reason { get; set; } = "";
    public string KeyCause { get; set; } = "";
    public int PurgeLeft { get; set; }
    public int PurgeMax { get; set; }
    public int AvgHpPct { get; set; }
    public int TeamLives { get; set; }
    public List<string> KeyBattles { get; set; } = new();
    public List<string> LastActions { get; set; } = new();
    public string TopSkill { get; set; } = "";
    public List<string> UnusedResources { get; set; } = new();
    public int RetreatAttempts { get; set; }
    public int RetreatSuccess { get; set; }
    public List<string> KeyChoices { get; set; } = new();
    public List<string> Mutators { get; set; } = new();
    public string Suggestion { get; set; } = "";
}

/// <summary>一个评级维度。分数是反馈，不是惩罚。</summary>
public sealed class RatingDimension
{
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    public int Score { get; set; }
    public string Note { get; set; } = "";
}

public sealed class RunRating
{
    public string Grade { get; set; } = "C";
    public int Score { get; set; }
    public List<RatingDimension> Dimensions { get; set; } = new();
    public List<string> UnlockedIds { get; set; } = new();
}

/* ── 0.22 协同 / 支援 / 多人事件 ─────────────────────────────────── */

/// <summary>一条协同规则：谁触发、效果是什么、技能卡上怎么预览。</summary>
public sealed class SynergyDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Trigger { get; set; } = "";
    public string Effect { get; set; } = "";
    public string Preview { get; set; } = "";
}

public sealed class CoopOption
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "";
    public string Desc { get; set; } = "";
    /// <summary>结算效果：memory:+40 / hp:-6 / purge:+2 / alloy:+1 / focus / item。</summary>
    public string Effect { get; set; } = "";
}

public sealed class CoopEventDef
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Text { get; set; } = "";
    public List<CoopOption> Options { get; set; } = new();
    /// <summary>超时/掉线时自动采用的安全选项。</summary>
    public string DefaultOptionId { get; set; } = "";
}

/// <summary>进行中的多人事件。投票存在共享状态里，所有人都看得到。</summary>
public sealed class CoopState
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Text { get; set; } = "";
    public List<CoopOption> Options { get; set; } = new();
    public Dictionary<string, string> Votes { get; set; } = new();
    public int DeadlineRound { get; set; }
    public bool Resolved { get; set; }
    public string? ChosenId { get; set; }
    public string? Result { get; set; }
    public bool TimedOut { get; set; }
    /// <summary>投票截止时间（unix ms）。超时按安全默认选项结算。</summary>
    public long DeadlineAt { get; set; }
}

/// <summary>章节回顾：一幕结束时定格的数字，换幕/档案里回看用。</summary>
public sealed class RunRecap
{
    public int Act { get; set; }
    public string Name { get; set; } = "";
    public int Nodes { get; set; }
    public int Battles { get; set; }
    public int Victories { get; set; }
    public int Events { get; set; }
    public int Assists { get; set; }
    public int Synergies { get; set; }
    public int PurgeLeft { get; set; }
    public int PurgeMax { get; set; }
    public int TeamLives { get; set; }
    public int AvgLevel { get; set; }
    public List<string> ConsequenceTitles { get; set; } = new();
    public List<string> BondLines { get; set; } = new();
}

/// <summary>事件留下的长期后果。最多同时追踪 5 条，换幕到期。</summary>
public sealed class Consequence
{
    public string Id { get; set; } = "";
    /// <summary>来源事件标题——UI 里「为什么」的一半答案。</summary>
    public string Source { get; set; } = "";
    public string Title { get; set; } = "";
    public string Desc { get; set; } = "";
    /// <summary>shop / enemy / player / route / act / boss / chance。</summary>
    public string Kind { get; set; } = "";
    public int ExpiresAct { get; set; }
    public string Payload { get; set; } = "";
    /// <summary>玩家做了什么导致它（另一半「为什么」）。</summary>
    public string Why { get; set; } = "";
}

/// <summary>后果定义（数据层）。引擎按这个生成 Consequence。</summary>
public sealed class ConsequenceDef
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Desc { get; set; } = "";
    public string Kind { get; set; } = "";
    /// <summary>持续几幕（含当前幕）。</summary>
    public int Acts { get; set; } = 1;
    public string Payload { get; set; } = "";
    public string Why { get; set; } = "";
}

/// <summary>两名角色之间的关系。等级 0–3，靠同行、支援与事件推进。</summary>
public sealed class Relationship
{
    public string A { get; set; } = "";
    public string B { get; set; } = "";
    public int Points { get; set; }
    public int Level { get; set; }
    public string Note { get; set; } = "";
}

/// <summary>「标记路线/目标/风险」的只读共享标记，不改变任何规则状态。</summary>
public sealed class PingState
{
    public string NodeId { get; set; } = "";
    public string By { get; set; } = "";
    public string Note { get; set; } = "";
    public long At { get; set; }
}

public sealed class Stats
{
    public int Vit { get; set; }
    public int C { get; set; }
    public int H { get; set; }
    public int E { get; set; }
    public int Spd { get; set; }
    public int L { get; set; }

    public Stats() { }
    public Stats(int vit, int c, int h, int e, int spd, int l)
    {
        Vit = vit; C = c; H = h; E = e; Spd = spd; L = l;
    }

    [JsonIgnore]
    public int this[string key] => key.ToUpperInvariant() switch
    {
        "VIT" => Vit, "C" => C, "H" => H, "E" => E, "SPD" => Spd, "L" => L,
        _ => 0
    };

    public Stats Clone() => new(Vit, C, H, E, Spd, L);

    public void Add(Stats other)
    {
        Vit += other.Vit; C += other.C; H += other.H; E += other.E; Spd += other.Spd; L += other.L;
    }

    public static Stats Sum(params Stats?[] all)
    {
        var result = new Stats();
        foreach (var s in all) if (s is not null) result.Add(s);
        return result;
    }
}

public sealed class ActDef
{
    public int Act { get; set; }
    public string Name { get; set; } = "";
    public string Subtitle { get; set; } = "";
    public string Objective { get; set; } = "";
    public string KeyName { get; set; } = "密钥";
    public string BossName { get; set; } = "";
    public string BossGroup { get; set; } = "g_boss";
    public string BossDrop { get; set; } = "";
    public string StartName { get; set; } = "";
    public string StartDesc { get; set; } = "";
    public string Interlude { get; set; } = "";
    public string FinalOutcome { get; set; } = "";
    public int PurgeMax { get; set; } = 10;
    public int EntryMemory { get; set; }
    public int EntryAlloy { get; set; }
    public int EntryXp { get; set; }
}

public sealed class CharacterDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Model { get; set; } = "";
    public string Faction { get; set; } = "";
    public string Role { get; set; } = "";
    public string Portrait { get; set; } = "";
    public string Tagline { get; set; } = "";
    /// <summary>战术标签：爆发 / 持续 / 增益 / 减益 / 护盾 / 治疗 / 召唤 / 控制。</summary>
    public List<string> Tags { get; set; } = new();
    public string PassiveName { get; set; } = "";
    public string PassiveDesc { get; set; } = "";
    public string PassiveKey { get; set; } = "";
    public int BaseHp { get; set; }
    public Stats Stats { get; set; } = new();
    public List<string> SkillIds { get; set; } = new();
    public string StarterWeaponId { get; set; } = "w_blade";
    public string Color { get; set; } = "#00f0ff";
}

public sealed class EffectDef
{
    public string Type { get; set; } = "";
    public int Amount { get; set; }
    public int Duration { get; set; }
    public string? Stat { get; set; }
    public string? Value { get; set; }
}

public sealed class SkillDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Desc { get; set; } = "";
    public string Owner { get; set; } = "";
    public int FocusCost { get; set; }
    public int Cooldown { get; set; }
    public int Range { get; set; } = 1;
    public int Dice { get; set; }
    public int Accuracy { get; set; }
    public int DamagePerDie { get; set; }
    public DamageType DamageType { get; set; } = DamageType.Physical;
    public string ScaleStat { get; set; } = "H";
    public bool IsUltimate { get; set; }
    public bool IsEnemySkill { get; set; }
    public TargetType Target { get; set; } = TargetType.Enemy;
    public List<EffectDef> Effects { get; set; } = new();
    public string? Special { get; set; }
    public string Icon { get; set; } = "◈";
}

/// <summary>
/// 装备特性（0.24）。只做有限集合，不给每件装备写独立脚本：
/// 同一时机 + 同一条件的触发用同一个 key，数值来自 Value。
/// </summary>
public sealed class GearTraitDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Trigger { get; set; } = "";
    public string Condition { get; set; } = "";
    public string Effect { get; set; } = "";
    public string Desc { get; set; } = "";
    /// <summary>数值（伤害、护盾、层数…），含义由 Effect 决定。</summary>
    public int Value { get; set; } = 1;
    /// <summary>每场战斗只能用一次。</summary>
    public bool Once { get; set; }
    /// <summary>写日志用的短标签。</summary>
    public string LogKey { get; set; } = "";
}

public sealed class GearDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Slot { get; set; } = "Weapon";
    /// <summary>装备特性 id（见 GameData.Traits）。空 = 纯数值装备。</summary>
    public string? TraitId { get; set; }
    public string Rarity { get; set; } = "普通";
    public string SetId { get; set; } = "";
    public string Desc { get; set; } = "";
    public int Price { get; set; } = 60;
    public int Dice { get; set; }
    public int Accuracy { get; set; }
    public int DamagePerDie { get; set; }
    public DamageType DamageType { get; set; } = DamageType.Physical;
    public string ScaleStat { get; set; } = "H";
    public int Range { get; set; } = 1;
    public int Armor { get; set; }
    public int Resistance { get; set; }
    public int Evasion { get; set; }
    public int Hp { get; set; }
    public int Focus { get; set; }
    public int AccuracyBonus { get; set; }
    public int DamageBonus { get; set; }
    /// <summary>首领机制「学习」加过的护甲/抗性（用来回滚，不会无限叠）。</summary>
    public int Movement { get; set; }
    public Stats Stats { get; set; } = new();
}

public sealed class ItemInstance
{
    public string InstanceId { get; set; } = "";
    public string ItemId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Slot { get; set; } = "Weapon";
    public string Rarity { get; set; } = "普通";
    public string SetId { get; set; } = "";
    public string Desc { get; set; } = "";
    public int Level { get; set; }
    public int Price { get; set; }
    public int Dice { get; set; }
    public int Accuracy { get; set; }
    public int DamagePerDie { get; set; }
    public DamageType DamageType { get; set; } = DamageType.Physical;
    public string ScaleStat { get; set; } = "H";
    public int Range { get; set; } = 1;
    public int Armor { get; set; }
    public int Resistance { get; set; }
    public int Evasion { get; set; }
    public int Hp { get; set; }
    public int Focus { get; set; }
    public int AccuracyBonus { get; set; }
    public int DamageBonus { get; set; }
    /// <summary>首领机制「学习」加过的护甲/抗性（用来回滚，不会无限叠）。</summary>
    public int Movement { get; set; }
    public Stats Stats { get; set; } = new();

    [JsonIgnore]
    public int EnchantLevel => Level;

    public string LevelText => Level > 0 ? $"+{Level}" : "+0";
}

public sealed class GearSetDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public List<GearSetTier> Tiers { get; set; } = new();
}

public sealed class GearSetTier
{
    public int Pieces { get; set; }
    public string Text { get; set; } = "";
    public int Armor { get; set; }
    public int Resistance { get; set; }
    public int Evasion { get; set; }
    public int Hp { get; set; }
    public int Focus { get; set; }
    public int AccuracyBonus { get; set; }
    public int DamageBonus { get; set; }
    /// <summary>首领机制「学习」加过的护甲/抗性（用来回滚，不会无限叠）。</summary>
    public int Movement { get; set; }
    public Stats Stats { get; set; } = new();
}

public sealed class EnemyDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Role { get; set; } = "";
    public string Portrait { get; set; } = "";
    public string Desc { get; set; } = "";
    public int Hp { get; set; }
    public int Armor { get; set; }
    public int Resistance { get; set; }
    public int Evasion { get; set; }
    public int Speed { get; set; }
    public int Movement { get; set; } = 3;
    public int Tier { get; set; } = 1;
    public bool Ranged { get; set; }
    public string BossPattern { get; set; } = "";
    public int BossShieldThreshold { get; set; } = 60;
    public int BossSummonLimit { get; set; } = 1;
    public int BossAddCap { get; set; } = 3;
    public List<string> SkillIds { get; set; } = new();
    public string Color { get; set; } = "#ff2e88";
}

public sealed class EventChoice
{
    public string Text { get; set; } = "";
    public string? Stat { get; set; }
    public int Dc { get; set; }
    public int CostMemory { get; set; }
    public int CostHp { get; set; }
    public string? CostItem { get; set; }
    public string SuccessText { get; set; } = "";
    public string FailText { get; set; } = "";
    public int SuccessMemory { get; set; }
    public int FailMemory { get; set; }
    public int SuccessHp { get; set; }
    public int FailHp { get; set; }
    public int SuccessXp { get; set; }
    public int FailXp { get; set; }
    public int SuccessPurge { get; set; }
    public int FailPurge { get; set; }
    public string? SuccessItem { get; set; }
    public string? FailItem { get; set; }
    public int SuccessAlloy { get; set; }
    public int FailAlloy { get; set; }
    public int SuccessSignal { get; set; }
    public int FailSignal { get; set; }
}

public sealed class EventDef
{
    public string Id { get; set; } = "";
    public int Act { get; set; } = 1;
    public string Title { get; set; } = "";
    public string Subtitle { get; set; } = "";
    public string Text { get; set; } = "";
    public string Icon { get; set; } = "◇";
    public List<EventChoice> Choices { get; set; } = new();
}

public sealed class NodeState
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public NodeType Type { get; set; }
    public string District { get; set; } = "";
    public string Desc { get; set; } = "";
    public int X { get; set; }
    public int Y { get; set; }
    public int Layer { get; set; }
    public int Lane { get; set; }
    public bool Revealed { get; set; }
    public bool Visited { get; set; }
    public bool Cleared { get; set; }
    public List<string> Neighbors { get; set; } = new();
    public string? EnemyGroup { get; set; }
    public string? EventId { get; set; }
    public string? LootItem { get; set; }
    /// <summary>服务器变体：vit/c/h/e/spd/l/heal/focus/xp。</summary>
    public string? ServerKind { get; set; }
    /// <summary>商店首访免费补给是否已领。</summary>
    public bool Supplied { get; set; }
    /// <summary>空地节点的旁白，走进来时显示。</summary>
    public string Flavor { get; set; } = "";
    /// <summary>残响节点发放的支线 id。</summary>
    public string? QuestId { get; set; }
}

/// <summary>支线定义。文案与奖励都写在这里，换幕即失效。</summary>
public sealed class QuestDef
{
    public string Id { get; set; } = "";
    public int Act { get; set; } = 1;
    /// <summary>fetch 寻物 / hunt 猎杀 / explore 探索 / action 行动。</summary>
    public string Kind { get; set; } = "";
    public string Title { get; set; } = "";
    /// <summary>发放时残响说的话。</summary>
    public string Giver { get; set; } = "";
    /// <summary>面板上显示的一行目标。</summary>
    public string Objective { get; set; } = "";
    /// <summary>接受任务时弹出的卡正文。</summary>
    public string Body { get; set; } = "";
    /// <summary>交付时弹出的卡正文。</summary>
    public string DoneText { get; set; } = "";
    public int TargetCount { get; set; } = 1;
    /// <summary>探索类目标层。</summary>
    public int TargetLayer { get; set; }
    /// <summary>寻物类目标：corpse / treasure / any。</summary>
    public string Source { get; set; } = "";
    public int RewardMemory { get; set; }
    public string? RewardItem { get; set; }
    public int RewardConsumableCount { get; set; }
    public int RewardPurge { get; set; }
    public int RewardTeamLife { get; set; }
    public string RewardText { get; set; } = "";
}

/// <summary>支线进度。Status: offered / active / done / claimed。</summary>
public sealed class QuestState
{
    public string QuestId { get; set; } = "";
    public string Status { get; set; } = "active";
    public int Progress { get; set; }
    public int Act { get; set; } = 1;
    [JsonIgnore]
    public bool IsDone => Status == "done";
}

/// <summary>极简叙事：一张文字卡的标题、小标题与正文。</summary>
/// <summary>联机剧情游标。At 用毫秒时间戳，客户端据此判断“这条是不是新的”。</summary>
public sealed class StoryCue
{
    public string SceneId { get; set; } = "";
    public int Line { get; set; }
    public string By { get; set; } = "";
    public long At { get; set; }
}

public sealed class StoryBeat
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Subtitle { get; set; } = "";
    public string Body { get; set; } = "";
}

public sealed class EdgeState
{
    public string From { get; set; } = "";
    public string To { get; set; } = "";
}

public sealed class StatusState
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public int Duration { get; set; }
    public int DamagePerTurn { get; set; }
    public int AccuracyMod { get; set; }
    public int DamageMod { get; set; }
    public int ArmorMod { get; set; }
    public int ResistanceMod { get; set; }
    public int EvasionMod { get; set; }
    public int SpeedMod { get; set; }
    public int MovementMod { get; set; }
    public bool Stun { get; set; }
    public bool Taunt { get; set; }
    public bool Marked { get; set; }
    /// <summary>被「暴露」：下一次技能攻击必中（协同：暴露 → 技能必中）。</summary>
    public bool Exposed { get; set; }
    public string? SourceId { get; set; }
    public bool IsBuff { get; set; }
}

public sealed class PlayerState
{
    public string Id { get; set; } = "";
    public string CharacterId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Model { get; set; } = "";
    public string Faction { get; set; } = "";
    public string Role { get; set; } = "";
    public string Portrait { get; set; } = "";
    public string Color { get; set; } = "#00f0ff";
    public string PassiveName { get; set; } = "";
    public string PassiveDesc { get; set; } = "";
    public string PassiveKey { get; set; } = "";
    public int Level { get; set; } = 1;
    public int Xp { get; set; }
    public int XpNext { get; set; } = 100;
    public Stats BaseStats { get; set; } = new();
    public Stats Stats { get; set; } = new();
    public int BaseHp { get; set; }
    public int MaxHp { get; set; }
    public int Hp { get; set; }
    /// <summary>生命上限倍率（变异「玻璃队伍」=0.75）。旧存档默认 1。</summary>
    public double HpScale { get; set; } = 1.0;
    public int Armor { get; set; }
    public int Resistance { get; set; }
    public int Evasion { get; set; }
    public int AccuracyBonus { get; set; }
    public int DamageBonus { get; set; }
    /// <summary>首领机制「学习」加过的护甲/抗性（用来回滚，不会无限叠）。</summary>
    public int Movement { get; set; } = 3;
    public int Focus { get; set; }
    public int MaxFocus { get; set; }
    public int Ap { get; set; } = 3;
    public string NodeId { get; set; } = "";
    /// <summary>上一次所在的节点：撤出战斗时退回到这里。</summary>
    public string LastNodeId { get; set; } = "";
    public bool Downed { get; set; }
    public int AssistBonus { get; set; }
    public List<string> SkillIds { get; set; } = new();
    public Dictionary<string, ItemInstance> Equipment { get; set; } = new();
    public List<ItemInstance> Inventory { get; set; } = new();
    /// <summary>消耗品堆叠：consumableId -> 数量。</summary>
    public Dictionary<string, int> Consumables { get; set; } = new();
    /// <summary>本幕已写入的属性服务器台数（每幕上限 2）。</summary>
    public int ServerWrites { get; set; }
    /// <summary>服务器写入的永久属性，重算时叠加在角色基础值上。</summary>
    public Stats ServerBonus { get; set; } = new();
    /// <summary>是否已完成「找回自我」觉醒。</summary>
    public bool Awakened { get; set; }
    /// <summary>
    /// 觉醒共鸣层数（0–3）：每有一名已觉醒的队友，全队 +1 护甲 / +1 抗性 / +5 最大生命。
    /// 0.15 之前全队只能一个人觉醒，所以这个字段不存在——现在多人可以各自觉醒，需要一个"队伍更完整"的回报。
    /// </summary>
    public int AwakenResonance { get; set; }
    public Dictionary<string, int> Cooldowns { get; set; } = new();
    public bool UltimateUsed { get; set; }
    /// <summary>被队友「掩护」时的承担者（协同：支援动作 assistGuard）。</summary>
    public string? GuardLinkFrom { get; set; }
    /// <summary>本幕已经用过救援（每幕一次）。</summary>
    public int RescueUsedAct { get; set; }
    /// <summary>资源赠与攒下的终极技加成（每击 +N，战斗开始时结算一次）。</summary>
    public int UltimatePrep { get; set; }
}

public sealed class HexPos
{
    public int Col { get; set; }
    public int Row { get; set; }
    public string Key => $"{Col},{Row}";
    public HexPos() { }
    public HexPos(int col, int row) { Col = col; Row = row; }
    public override string ToString() => Key;
}

public sealed class TerrainState
{
    public int Col { get; set; }
    public int Row { get; set; }
    public string Type { get; set; } = "cover";
    public string Name { get; set; } = "掩体";
}

public sealed class DieResult
{
    public int Value { get; set; }
    public bool Success { get; set; }
    public bool Exploded { get; set; }
}

public sealed class RollResult
{
    public string Kind { get; set; } = "attack";
    public string Label { get; set; } = "";
    public string? SkillName { get; set; }
    public string? TargetName { get; set; }
    public string? AttackerName { get; set; }
    public List<DieResult> Dice { get; set; } = new();
    public int Accuracy { get; set; }
    public int Hits { get; set; }
    public int Damage { get; set; }
    public int Roll { get; set; }
    public int Target { get; set; }
    public bool Success { get; set; }
    public bool Perfect { get; set; }
    public string Detail { get; set; } = "";
}

public sealed class CombatUnit
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public Side Side { get; set; }
    public string? PlayerId { get; set; }
    public string? EnemyId { get; set; }
    public string Portrait { get; set; } = "";
    public string Color { get; set; } = "#00f0ff";
    public string Role { get; set; } = "";
    public int Hp { get; set; }
    public int MaxHp { get; set; }
    public int Shield { get; set; }
    public int Armor { get; set; }
    public int Resistance { get; set; }
    public int Evasion { get; set; }
    public int Speed { get; set; }
    public int AccuracyBonus { get; set; }
    public int DamageBonus { get; set; }
    /// <summary>首领机制「学习」加过的护甲/抗性（用来回滚，不会无限叠）。</summary>
    public int? LearnedArmor { get; set; }
    public int? LearnedResist { get; set; }
    public int Focus { get; set; }
    public int MaxFocus { get; set; }
    public int Col { get; set; }
    public int Row { get; set; }
    public int Movement { get; set; } = 3;
    public bool Moved { get; set; }
    public bool Acted { get; set; }
    public bool Downed { get; set; }
    public bool IsSummon { get; set; }
    public int SummonDuration { get; set; }
    public Stats Stats { get; set; } = new();
    public List<string> SkillIds { get; set; } = new();
    public Dictionary<string, int> Cooldowns { get; set; } = new();
    public bool UltimateUsed { get; set; }
    /// <summary>护盾来源（协同：护盾 → 反击）。</summary>
    public string? ShieldFrom { get; set; }
    /// <summary>资源赠与带来的终极技加成（每次命中 +N）。</summary>
    public int UltimateBonus { get; set; }
    public List<StatusState> Statuses { get; set; } = new();
    public string? WeaponItemId { get; set; }
    public string WeaponName { get; set; } = "";
    public int WeaponDice { get; set; } = 2;
    public int WeaponAccuracy { get; set; } = 70;
    public int WeaponDamage { get; set; } = 3;
    public DamageType WeaponType { get; set; } = DamageType.Physical;
    public string WeaponScale { get; set; } = "H";
    public int WeaponRange { get; set; } = 1;
    public int MovementLeft { get; set; } = 3;
    public int ExtraActions { get; set; }
    public string PassiveKey { get; set; } = "";
    public bool CheatDeathUsed { get; set; }
    public bool DecoyUsed { get; set; }
    public bool KimiUsed { get; set; }
    public bool GeminiRerollUsed { get; set; }
    public string? SummonKind { get; set; }
    /// <summary>敌方下回合的意图预告（给玩家看的一行字，不参与规则判定）。</summary>
    public string Intent { get; set; } = "";
}

/// <summary>一次战斗动作的表现快照（供观战端回放，不参与规则判定）。</summary>
public sealed class CombatActionTrace
{
    public int Seq { get; set; }
    public string CasterId { get; set; } = "";
    public string SkillId { get; set; } = "";
    public int CasterCol { get; set; }
    public int CasterRow { get; set; }
    public int TargetCol { get; set; }
    public int TargetRow { get; set; }
    public List<HexPos> Targets { get; set; } = new();
    public bool Ranged { get; set; }
    /// <summary>判定次数：表现层按这个数把伤害拆成一段一段飘出来。</summary>
    public int Dice { get; set; }
    /// <summary>每个目标实际挨了多少。</summary>
    public List<CombatHitTrace> Hits { get; set; } = new();
}

public sealed class CombatHitTrace
{
    public string TargetId { get; set; } = "";
    public int Damage { get; set; }
    public int Hits { get; set; }
    public bool Perfect { get; set; }
    public bool Evaded { get; set; }
}

public sealed class CombatState
{
    public string NodeId { get; set; } = "";
    public string EnemyGroupId { get; set; } = "";
    public int Width { get; set; } = 7;
    public int Height { get; set; } = 5;
    public int Round { get; set; } = 1;
    public List<CombatUnit> Units { get; set; } = new();
    public List<string> TurnOrder { get; set; } = new();
    public string ActiveUnitId { get; set; } = "";
    public List<TerrainState> Terrain { get; set; } = new();
    public List<HexPos> Reachable { get; set; } = new();
    public List<string> Targetable { get; set; } = new();
    public List<string> Log { get; set; } = new();
    public RollResult? LastRoll { get; set; }
    /// <summary>Most recent roll produced by a player action. Enemy turns may overwrite LastRoll afterwards.</summary>
    public RollResult? LastPlayerRoll { get; set; }
    /// <summary>最近几次战斗动作的表现信息（一次请求可能含玩家动作 + 敌方回合，按列表逐条回放）。</summary>
    public List<CombatActionTrace> LastActions { get; set; } = new();
    public bool IsOver { get; set; }
    public string? Result { get; set; }
    public string? Hint { get; set; }
    public string? SelectedSkillId { get; set; }
    /// <summary>Boss 阶段：1 = 一阶段，2 = 二阶段（血量 ≤50% 时由引擎切换）。</summary>
    public int BossPhase { get; set; } = 1;
    /// <summary>二阶段的名字（清仓 / 分摊 / 上传倒计时），用于横幅与日志。</summary>
    public string? BossPhaseName { get; set; }
    /// <summary>二阶段已经回收生命的次数（清仓最多 3 次，防止打不死的僵局）。</summary>
    public int BossPhaseHeals { get; set; }
    /// <summary>变异「过热」：本场战斗每个技能用过几次。</summary>
    public Dictionary<string, int> SkillRepeats { get; set; } = new();
    /// <summary>变异「镜像」：敌方已复制几层（最多 3 层）。</summary>
    public int MirrorStacks { get; set; }
    /// <summary>0.24：首领专属机制。非首领战为 null。</summary>
    public BossMechanicState? BossMechanic { get; set; }
    /// <summary>装备特性的一次性/每轮计数（键是 单位:特性[:轮]）。随战斗丢弃。</summary>
    public Dictionary<string, int> TraitUsed { get; set; } = new();

    /// <summary>
    /// 战斗开始时的快照（长夜「上下文回滚」用）。
    /// 必须落盘：以前标了 [JsonIgnore]，刷新/重启后快照为空，
    /// 终极技会静默空转却照扣 Focus —— 这是 0.12.0 的一个真 bug。
    /// </summary>
    public List<CombatUnit> StartUnits { get; set; } = new();
    public List<string> StartTurnOrder { get; set; } = new();
    public int StartRound { get; set; } = 1;
    [JsonIgnore]
    public string? LastAllySkillId { get; set; }
    [JsonIgnore]
    public int LastAllySkillRound { get; set; }
    [JsonIgnore]
    public int SummonCounter { get; set; }

    [JsonIgnore]
    public List<CombatUnit> PlayerUnits => Units.Where(u => u.Side == Side.Player).ToList();
    [JsonIgnore]
    public List<CombatUnit> EnemyUnits => Units.Where(u => u.Side == Side.Enemy).ToList();
    [JsonIgnore]
    public CombatUnit? ActiveUnit => Units.FirstOrDefault(u => u.Id == ActiveUnitId);
}

public sealed class EventState
{
    public string PlayerId { get; set; } = "";
    public string NodeId { get; set; } = "";
    public EventDef Event { get; set; } = new();
}

public sealed class ShopItem
{
    public string ItemId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Slot { get; set; } = "";
    public string Rarity { get; set; } = "";
    public string Desc { get; set; } = "";
    public int Price { get; set; }
    public int Level { get; set; }
    public bool Sold { get; set; }
}

public sealed class LogEntry
{
    public int Round { get; set; }
    public string Kind { get; set; } = "info";
    public string Text { get; set; } = "";
}

public sealed class ConsumableDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Desc { get; set; } = "";
    public string Icon { get; set; } = "✚";
    public string Rarity { get; set; } = "普通";
    public int Price { get; set; }
    /// <summary>heal / focus / cleanse / shield / haste</summary>
    public string Effect { get; set; } = "heal";
    public int Amount { get; set; }
    /// <summary>self / ally / allAllies</summary>
    public string Scope { get; set; } = "ally";
    /// <summary>仅战斗中可用。</summary>
    public bool CombatOnly { get; set; }
    public string Color { get; set; } = "#3ddc97";
}

public sealed class GameState
{
    public string SessionId { get; set; } = "";
    public string Version { get; set; } = "0.25.0";
    /// <summary>存档格式版本。改动 DTO 结构（字段增删/改义）时递增；加载时用于兼容性判断。</summary>
    public int SaveFormat { get; set; } = SaveFormatCurrent;
    /// <summary>当前存档格式版本。0 表示 0.11.0 之前没有这个字段的旧档。</summary>
    public const int SaveFormatCurrent = 2;
    /// <summary>玩法模式。0.20 之前没有这个字段的存档反序列化后是 Standard（枚举 0），正好兼容。</summary>
    public GameMode Mode { get; set; } = GameMode.Standard;
    /// <summary>教学模式状态；Standard / Challenge 局永远是 null。</summary>
    public TutorialState? Tutorial { get; set; }
    /// <summary>新手首局标记：地图更温和，首次遇到觉醒/支线/服务器各弹一次解释。</summary>
    public bool FirstRun { get; set; }
    /// <summary>「此刻最重要的事」面板数据，每次行动后由规则层重算。</summary>
    public ObjectiveBoard? Objectives { get; set; }
    /// <summary>挑战局元数据；标准局为 null。</summary>
    public ChallengeRun? Challenge { get; set; }
    /// <summary>本局统计（复盘与评级用）。</summary>
    public RunStats Stats { get; set; } = new();
    /// <summary>结局复盘；只在 Victory / Defeat 时生成。</summary>
    public RunReview? Review { get; set; }
    /// <summary>结局评级与解锁。</summary>
    public RunRating? Rating { get; set; }
    /// <summary>变异「全局故障」本幕关闭的节点类型（给 UI 预告用）。</summary>
    public string? ClosedNodeType { get; set; }
    /// <summary>进行中的多人事件（投票）。</summary>
    public CoopState? Coop { get; set; }
    /// <summary>共享标记（标记路线/风险，不改变规则）。</summary>
    public PingState? Ping { get; set; }
    /// <summary>本局触发过的协同 id（给复盘/图鉴用）。</summary>
    public List<string> Synergies { get; set; } = new();
    /// <summary>已经出现过多人事件的幕（每幕一次）。</summary>
    public List<int> CoopSeenActs { get; set; } = new();
    /// <summary>事件留下的长期后果（最多 5 条）。</summary>
    public List<Consequence> Consequences { get; set; } = new();
    /// <summary>遗物后果的「留 1 HP」本幕是否已经用掉。</summary>
    public bool LastStandUsed { get; set; }
    /// <summary>队伍内的角色关系。</summary>
    public List<Relationship> Relationships { get; set; } = new();
    /// <summary>每一幕的回顾（换幕后追加）。</summary>
    public List<RunRecap> Recaps { get; set; } = new();
    /// <summary>本幕开始时的统计快照，用来算「这一幕做了什么」。</summary>
    public ActSnapshot ActStart { get; set; } = new();
    /// <summary>状态修订号：每次成功执行动作后 +1，用于联机轮询与重复提交检测。</summary>
    public int Revision { get; set; }
    public int Seed { get; set; }
    public string ActName { get; set; } = "第一幕 · 霓虹港";
    public string ActSubtitle { get; set; } = "NEON HARBOR";
    public int Act { get; set; } = 1;
    public string? NextActName { get; set; }
    public string? NextActSubtitle { get; set; }
    public string? NextActObjective { get; set; }
    public int Round { get; set; } = 1;
    public int Purge { get; set; } = 10;
    public int PurgeMax { get; set; } = 10;
    /// <summary>
    /// 时钟的「行动计数」：每结束一个玩家回合 +1，满 4 就扣 1 点电子追踪。
    /// 为什么不是按「轮」扣：一轮是"所有玩家各行动一次"，4 人队一轮走 4 份行动、2 人队只走 2 份，
    /// 但两者同样扣 1 点 —— 少人局的时钟压力会翻倍（实测 2 人局 25 轮就被追踪追上，第一幕都没打完）。
    /// </summary>
    public int PurgeTicks { get; set; }
    public int TeamLives { get; set; } = 3;
    public int Memory { get; set; } = 120;
    public int Alloy { get; set; } = 4;
    public int Signal { get; set; } = 2;
    public bool HasKey { get; set; }
    /// <summary>本幕已收集的密钥碎片（0-3）。</summary>
    public int KeyShards { get; set; }
    /// <summary>全局唯一：完成觉醒的角色 id。空字符串表示还没人觉醒。</summary>
    public string AwakenedPlayerId { get; set; } = "";
    public int KeyShardGoal { get; set; } = 3;
    public bool BossDefeated { get; set; }
    public GamePhase Phase { get; set; } = GamePhase.Exploration;
    public string ActivePlayerId { get; set; } = "";
    public string Objective { get; set; } = "找到王冠密钥，关闭拍卖人的零号协议。";
    public List<PlayerState> Players { get; set; } = new();
    public List<NodeState> Nodes { get; set; } = new();
    public List<EdgeState> Edges { get; set; } = new();
    public CombatState? Combat { get; set; }
    public EventState? PendingEvent { get; set; }
    public List<ShopItem> Shop { get; set; } = new();
    public List<ItemInstance> Stash { get; set; } = new();
    public List<LogEntry> Log { get; set; } = new();
    public RollResult? LastRoll { get; set; }
    public string Message { get; set; } = "";
    public string? Outcome { get; set; }
    public string? ShopNodeId { get; set; }
    public string? SafehouseNodeId { get; set; }
    public string? DefeatedBy { get; set; }
    /// <summary>待展示的剧情卡；前端展示后回传 ackBeat 清空。</summary>
    public StoryBeat? PendingBeat { get; set; }
    /// <summary>
    /// 联机剧情游标：房主推进到第几句，其他人跟随。
    /// 单人局不写这个字段（前端也不会读），所以它不会影响任何既有流程。
    /// </summary>
    public StoryCue? StoryCue { get; set; }
    /// <summary>已经看过的剧情卡 id，避免重复播放。</summary>
    public List<string> SeenBeats { get; set; } = new();
    /// <summary>本幕进行中的支线（含已领取的记录，换幕只清未领取的）。</summary>
    public List<QuestState> Quests { get; set; } = new();
    /// <summary>待玩家确认接取的支线；前端展示后回传 acceptQuest / declineQuest。</summary>
    public QuestDef? PendingQuestOffer { get; set; }
    /// <summary>累计领取的支线数量，用于结局追加文字。</summary>
    public int QuestClaims { get; set; }

    [JsonIgnore]
    public PlayerState? ActivePlayer => Players.FirstOrDefault(p => p.Id == ActivePlayerId);
    public PlayerState? Player(string id) => Players.FirstOrDefault(p => p.Id == id);

    public NodeState? Node(string id) => Nodes.FirstOrDefault(n => n.Id == id);
}

public sealed class GameAction
{
    public string Type { get; set; } = "";
    public string? PlayerId { get; set; }
    public string? NodeId { get; set; }
    public string? TargetPlayerId { get; set; }
    public string? SkillId { get; set; }
    public string? TargetUnitId { get; set; }
    public string? ItemId { get; set; }
    public string? Slot { get; set; }
    public int Col { get; set; } = -1;
    public int Row { get; set; } = -1;
    public int ChoiceIndex { get; set; }
    public int Seed { get; set; }
    public string? BeatId { get; set; }
    /// <summary>剧情游标用：场景 id 与句号。</summary>
    public string? SceneId { get; set; }
    public int? Line { get; set; }
}

public sealed class NewGameRequest
{
    public List<string> CharacterIds { get; set; } = new();
    public int PlayerCount { get; set; }
    public int Seed { get; set; }
    /// <summary>默认 Standard；Tutorial 会走固定教学流程，忽略 CharacterIds。</summary>
    public GameMode Mode { get; set; } = GameMode.Standard;
    /// <summary>新手首局地图节奏。null = 由服务端按档案决定。</summary>
    public bool? FirstRun { get; set; }
    /// <summary>挑战配置；Mode=Challenge 时必填。不填则按标准局处理。</summary>
    public ChallengeConfig? Challenge { get; set; }
    /// <summary>服务端已校验解锁并算好倍率的挑战元数据（直接给规则层用）。</summary>
    public ChallengeRun? PreparedChallenge { get; set; }
}

public sealed class ActionRequest
{
    public string SessionId { get; set; } = "";
    public GameAction Action { get; set; } = new();
    /// <summary>客户端看到的修订号；服务端不匹配时返回 409，避免重复提交推进两次。</summary>
    public int? ExpectedRevision { get; set; }
    /// <summary>联机房间码；为空表示本地热座或单人。</summary>
    public string? RoomCode { get; set; }
    /// <summary>联机身份凭证，由房间加入时发放。</summary>
    public string? Token { get; set; }
    /// <summary>
    /// 请求级幂等键（客户端每次「一次逻辑动作」生成一个，重试时复用同一个）。
    /// 服务端对同一个 key 只应用一次；重复请求返回当前状态并打 X-Idempotent-Replay。
    /// 与 ExpectedRevision 互补：修订号防「旧状态覆盖新状态」，幂等键防「同一个动作执行两次」。
    /// </summary>
    public string? RequestId { get; set; }
}

public sealed class ApiError
{
    public string Error { get; set; } = "";
    public string? Detail { get; set; }
}
