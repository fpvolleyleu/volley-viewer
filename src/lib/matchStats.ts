// src/lib/matchStats.ts
export type Skill = "spike" | "serve" | "block" | "receive" | "set";
export type Result = "point" | "effective" | "continue" | "miss";

// “誰が”を未指定にするため playerId は null 許容
export type PlayerId = string;
export type MatchId = string;

export type Weights = Record<Skill, Record<Result, number>>;

export type RallyEvent = {
  id: string;
  matchId: MatchId;
  skill: Skill;
  result: Result;
  playerId: PlayerId | null;
};

export type Match = {
  id: MatchId;
  name: string;
  dateISO?: string;
};

export type Player = {
  id: PlayerId;
  name: string;
};

type Counts = Record<Result, number>;
const RESULTS: Result[] = ["point", "effective", "continue", "miss"];

function emptyCounts(): Counts {
  return { point: 0, effective: 0, continue: 0, miss: 0 };
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function calcDecisionRate(counts: Counts): number {
  const total = RESULTS.reduce((s, r) => s + counts[r], 0);
  if (total === 0) return 0;
  return counts.point / total;
}

export function calcEffectRate(
  counts: Counts,
  weightsForSkill: Record<Result, number>
): number {
  const total = RESULTS.reduce((s, r) => s + counts[r], 0);
  if (total === 0) return 0;

  const score = RESULTS.reduce(
    (s, r) => s + counts[r] * (weightsForSkill[r] ?? 0),
    0
  );
  return clamp01(score / total);
}

export type PerSkillStat = {
  total: number;
  counts: Counts;
  decisionRate: number; // 0..1
  effectRate: number; // 0..1
};

export type PlayerMatchStat = {
  matchId: MatchId;
  matchName: string;
  total: number;
  decisionRate: number; // 0..1
  effectRate: number; // 0..1
  bySkill: Partial<Record<Skill, PerSkillStat>>;
};

export function buildPlayerMatchStats(args: {
  playerId: PlayerId | null; // ← 未指定もOK
  matches: Match[];
  events: RallyEvent[];
  weights: Weights;
}): PlayerMatchStat[] {
  const { playerId, matches, events, weights } = args;

  const matchMap = new Map(matches.map((m) => [m.id, m]));
  const eventsOfPlayer = events.filter((e) => e.playerId === playerId);

  // matchId -> skill -> counts
  const acc = new Map<MatchId, Map<Skill, Counts>>();

  for (const e of eventsOfPlayer) {
    const m = acc.get(e.matchId) ?? new Map<Skill, Counts>();
    const c = m.get(e.skill) ?? emptyCounts();
    c[e.result] = (c[e.result] ?? 0) + 1;
    m.set(e.skill, c);
    acc.set(e.matchId, m);
  }

  const out: PlayerMatchStat[] = [];

  for (const [matchId, perSkill] of acc.entries()) {
    const matchName = matchMap.get(matchId)?.name ?? "(名称未設定)";

    const totalCounts = emptyCounts();
    for (const c of perSkill.values()) {
      for (const r of RESULTS) totalCounts[r] += c[r];
    }
    const total = RESULTS.reduce((s, r) => s + totalCounts[r], 0);

    let totalScore = 0;
    for (const [skill, c] of perSkill.entries()) {
      const w = weights[skill];
      for (const r of RESULTS) totalScore += c[r] * (w?.[r] ?? 0);
    }

    const decisionRate = total === 0 ? 0 : totalCounts.point / total;
    const effectRate = total === 0 ? 0 : clamp01(totalScore / total);

    const bySkill: Partial<Record<Skill, PerSkillStat>> = {};
    for (const [skill, c] of perSkill.entries()) {
      const skillTotal = RESULTS.reduce((s, r) => s + c[r], 0);
      bySkill[skill] = {
        total: skillTotal,
        counts: c,
        decisionRate: calcDecisionRate(c),
        effectRate: calcEffectRate(c, weights[skill]),
      };
    }

    out.push({ matchId, matchName, total, decisionRate, effectRate, bySkill });
  }

  out.sort((a, b) => a.matchName.localeCompare(b.matchName, "ja"));
  return out;
}

export function formatPct(x01: number): string {
  const v = Math.round(clamp01(x01) * 1000) / 10; // 小数1桁
  return `${v.toFixed(1)}%`;
}
