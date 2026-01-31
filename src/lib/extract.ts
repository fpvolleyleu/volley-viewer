export type LoadedJson =
  | { format?: string; exportedAt?: string; keys?: Record<string, unknown> }
  | Record<string, unknown>;

export type EventLike = {
  type?: string;
  skill?: string;
  label?: string;
  result?: string;
  outcome?: string;
  playerId?: string;
  player?: string;
  ts?: string | number;
  at?: string | number;
  [k: string]: unknown;
};

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isEventLike(x: unknown): x is EventLike {
  if (!isObject(x)) return false;
  const type = x.type ?? x.skill ?? x.label;
  const res = x.result ?? x.outcome;
  return typeof type === "string" && typeof res === "string";
}

// volley-pwa の exportSnapshotJson.ts 互換：{ format, exportedAt, keys: {...} } を想定しつつ、
// それ以外のJSONは “直下を keybag 扱い” で解析する
export function normalizeToKeyBag(root: unknown): Record<string, unknown> {
  if (!isObject(root)) return {};
  const maybeKeys = (root as any).keys;
  if (isObject(maybeKeys)) return maybeKeys as Record<string, unknown>;
  return root as Record<string, unknown>;
}

// DBキーの候補を順に探す（決め打ちしすぎない）
export function pickDbRoot(keybag: Record<string, unknown>): unknown {
  return (
    keybag["valleyPwa.db.v2"] ??
    keybag["volleyPwa.db.v2"] ??
    keybag["valleyPwa.db"] ??
    keybag["volleyPwa.db"] ??
    keybag
  );
}

// “イベントっぽい配列”をBFSで探索して拾う
export function findEventArrays(root: unknown): EventLike[] {
  const out: EventLike[] = [];
  const seen = new Set<unknown>();
  const queue: unknown[] = [root];

  let steps = 0;
  const STEP_LIMIT = 50_000;

  while (queue.length > 0 && steps < STEP_LIMIT) {
    const cur = queue.shift();
    steps++;

    if (!cur || seen.has(cur)) continue;
    if (typeof cur === "object") seen.add(cur);

    if (Array.isArray(cur)) {
      if (cur.length >= 1) {
        const eventCount = cur.reduce((acc, v) => (isEventLike(v) ? acc + 1 : acc), 0);
        if (eventCount / cur.length >= 0.5) {
          for (const v of cur) if (isEventLike(v)) out.push(v);
          continue;
        }
      }
      for (const v of cur) queue.push(v);
      continue;
    }

    if (isObject(cur)) {
      for (const v of Object.values(cur)) queue.push(v);
    }
  }

  return out;
}

export function summarizeEvents(events: EventLike[]) {
  const byType = new Map<string, number>();
  const byResult = new Map<string, number>();
  const byPlayer = new Map<string, number>();

  for (const e of events) {
    const t = String((e.type ?? e.skill ?? e.label) ?? "unknown");
    const r = String((e.result ?? e.outcome) ?? "unknown");
    const p = (e.playerId ?? e.player) ? String(e.playerId ?? e.player) : "unknown";

    byType.set(t, (byType.get(t) ?? 0) + 1);
    byResult.set(r, (byResult.get(r) ?? 0) + 1);
    byPlayer.set(p, (byPlayer.get(p) ?? 0) + 1);
  }

  const toSorted = (m: Map<string, number>) =>
    Array.from(m.entries()).sort((a, b) => b[1] - a[1]);

  return {
    total: events.length,
    byType: toSorted(byType),
    byResult: toSorted(byResult),
    byPlayer: toSorted(byPlayer).slice(0, 30),
  };
}
