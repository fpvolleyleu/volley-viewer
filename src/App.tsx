import { useMemo, useRef, useState } from "react";
import { findEventArrays, normalizeToKeyBag, pickDbRoot, summarizeEvents } from "./lib/extract";
import PlayerPicker from "./components/PlayerPicker";
import PlayerMatchStatsTable from "./components/PlayerMatchStatsTable";
import {
  buildPlayerMatchStats,
  type Match,
  type Player,
  type PlayerId,
  type RallyEvent,
  type Skill,
  type Result,
  type Weights,
} from "./lib/matchStats";
import "./App.css";

type Loaded = { source: string; filename?: string; raw: unknown };

function formatDate(s?: string) {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

const DEFAULT_WEIGHTS: Weights = {
  spike: { point: 1, effective: 0.7, continue: 0.3, miss: 0 },
  serve: { point: 1, effective: 0.7, continue: 0.3, miss: 0 },
  block: { point: 1, effective: 0.7, continue: 0.3, miss: 0 },
  receive: { point: 1, effective: 0.7, continue: 0.3, miss: 0 },
  set: { point: 1, effective: 0.7, continue: 0.3, miss: 0 },
};

function isWeights(x: unknown): x is Weights {
  const o = x as any;
  const skills: Skill[] = ["spike", "serve", "block", "receive", "set"];
  const results: Result[] = ["point", "effective", "continue", "miss"];
  if (!o || typeof o !== "object") return false;
  for (const s of skills) {
    if (!o[s] || typeof o[s] !== "object") return false;
    for (const r of results) {
      if (typeof o[s][r] !== "number") return false;
    }
  }
  return true;
}

function getByPath(obj: any, path: string): unknown {
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function pickString(obj: any, paths: string[]): string | undefined {
  for (const p of paths) {
    const v = getByPath(obj, p);
    if (typeof v === "string" && v.trim() !== "") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function toSkill(v: unknown): Skill | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();

  if (["spike", "attack", "atk", "スパイク"].includes(s)) return "spike";
  if (["serve", "srv", "サーブ"].includes(s)) return "serve";
  if (["block", "blk", "ブロック"].includes(s)) return "block";
  if (["receive", "pass", "レシーブ"].includes(s)) return "receive";
  if (["set", "toss", "トス"].includes(s)) return "set";

  return null;
}

function toResult(v: unknown): Result | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();

  if (["point", "決定", "得点", "kill"].includes(s)) return "point";
  if (["effective", "効果的"].includes(s)) return "effective";
  if (["continue", "継続", "inplay"].includes(s)) return "continue";
  if (["miss", "ミス", "error"].includes(s)) return "miss";

  return null;
}

function normalizePlayerId(v: unknown): PlayerId | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function deriveMatchesAndEvents(rawEvents: any[]): { matches: Match[]; events: RallyEvent[] } {
  const matchMap = new Map<string, Match>();
  const out: RallyEvent[] = [];

  for (let i = 0; i < rawEvents.length; i++) {
    const e = rawEvents[i] ?? {};

    const skill = toSkill(
      pickString(e, ["skill", "type", "action", "eventType", "kind", "label"]) ?? ""
    );
    const result = toResult(
      pickString(e, ["result", "outcome", "judgement", "judge", "eval"]) ?? ""
    );

    // 集計できるイベントだけ採用
    if (!skill || !result) continue;

    const matchName =
      pickString(e, ["matchName", "match.name", "gameName", "game.name"]) ??
      (() => {
        const v = getByPath(e, "match");
        return typeof v === "string" && v.trim() !== "" ? v : undefined;
      })() ??
      (() => {
        const v = getByPath(e, "game");
        return typeof v === "string" && v.trim() !== "" ? v : undefined;
      })() ??
      "(名称未設定)";

    const rawMatchId =
      pickString(e, ["matchId", "match_id", "gameId", "game_id", "match.id", "game.id"]) ??
      undefined;

    const matchId = rawMatchId ?? `name:${matchName}`;

    const dateISO =
      pickString(e, ["dateISO", "date", "datetime", "createdAt", "time"]) ?? undefined;

    if (!matchMap.has(matchId)) {
      matchMap.set(matchId, { id: matchId, name: matchName, dateISO });
    }

    const playerId = normalizePlayerId(
      getByPath(e, "playerId") ?? getByPath(e, "player") ?? getByPath(e, "who")
    );

    out.push({
      id: pickString(e, ["id"]) ?? `ev-${i}`,
      matchId,
      skill,
      result,
      playerId, // null は「未指定」
    });
  }

  return { matches: Array.from(matchMap.values()), events: out };
}

export default function App() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);

  // null = 「選手を指定しない（未指定イベントを見る）」として扱う
  const [selectedPlayerId, setSelectedPlayerId] = useState<PlayerId | null>(null);

  const onPick = () => inputRef.current?.click();

  const onFile = async (f: File | null) => {
    setError(null);
    setLoaded(null);
    if (!f) return;

    try {
      const text = await f.text();
      const json = JSON.parse(text);
      setLoaded({ source: "file", filename: f.name, raw: json });
    } catch {
      setError("JSONの読み込みに失敗しました（壊れている / 形式が違う可能性）");
    }
  };

  const loadLatest = async () => {
    setError(null);
    setLoaded(null);
    setLoadingLatest(true);

    try {
      const url = new URL("latest.json", window.location.href).toString();
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`latest.json の取得に失敗: HTTP ${res.status}`);
      }
      const json = await res.json();
      setLoaded({ source: "latest", filename: "latest.json", raw: json });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "latest.json の取得に失敗しました";
      setError(
        msg + "\n（対策）viewer リポの public/latest.json を更新して push してください。"
      );
    } finally {
      setLoadingLatest(false);
    }
  };

  const analysis = useMemo(() => {
    if (!loaded) return null;

    const keybag = normalizeToKeyBag(loaded.raw);
    const exportedAt =
      (loaded.raw as any)?.exportedAt ??
      (loaded.raw as any)?.exported_at ??
      (loaded.raw as any)?.meta?.exportedAt;

    const dbRoot = pickDbRoot(keybag);
    const events = findEventArrays(dbRoot);
    const summary = summarizeEvents(events);

    return { keybag, exportedAt, events, summary };
  }, [loaded]);

  const derived = useMemo(() => {
    if (!analysis || !loaded) return null;

    const { matches, events } = deriveMatchesAndEvents(analysis.events as any[]);

    const weightsCandidate =
      (loaded.raw as any)?.weights ??
      (loaded.raw as any)?.meta?.weights ??
      (analysis.keybag as any)?.weights ??
      (analysis.keybag as any)?.meta?.weights;

    const weights = isWeights(weightsCandidate) ? weightsCandidate : DEFAULT_WEIGHTS;

    // いまの viewer は「player名(or id)の文字列」しか持ってないので、そのまま id/name として扱う
    const players: Player[] = analysis.summary.byPlayer.map(([k]) => ({
      id: String(k),
      name: String(k),
    }));

    return { matches, events, weights, players };
  }, [analysis, loaded]);

  const playerMatchStats = useMemo(() => {
    if (!derived) return null;
    return buildPlayerMatchStats({
      playerId: selectedPlayerId,
      matches: derived.matches,
      events: derived.events,
      weights: derived.weights,
    });
  }, [derived, selectedPlayerId]);

  return (
    <div className="page">
      <div className="topbar">
        <div className="brand">
          <div className="title">volley-viewer</div>
          <div className="subtitle">閲覧専用（編集なし）</div>
        </div>

        <div className="actions">
          <button className="btn primary" onClick={loadLatest} disabled={loadingLatest}>
            {loadingLatest ? "読み込み中…" : "最新（latest.json）を読む"}
          </button>

          <button className="btn" onClick={onPick}>JSONを読み込む</button>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <div className="container">
        {error && (
          <div className="alert error">
            <div className="alertTitle">エラー</div>
            <pre className="pre">{error}</pre>
          </div>
        )}

        {!error && !loaded && (
          <div className="hint">
            ①「最新（latest.json）を読む」または ②「JSONを読み込む」から開始
          </div>
        )}

        {loaded && (
          <div className="card">
            <div className="cardHead">
              <div className="cardTitle">読み込み情報</div>
              <div className="pill">{loaded.source === "latest" ? "latest" : "file"}</div>
            </div>
            <div className="kv">
              <div className="k">source</div>
              <div className="v">
                {loaded.source === "latest" ? "public/latest.json" : "アップロードJSON"}
              </div>

              <div className="k">file</div>
              <div className="v">{loaded.filename ?? "-"}</div>

              <div className="k">exportedAt</div>
              <div className="v">{formatDate(analysis?.exportedAt)}</div>
            </div>
          </div>
        )}

        {analysis && (
          <>
            <div className="grid">
              <div className="stat">
                <div className="statLabel">イベント件数</div>
                <div className="statValue">{analysis.summary.total}</div>
              </div>
              <div className="stat">
                <div className="statLabel">キー数</div>
                <div className="statValue">{Object.keys(analysis.keybag).length}</div>
              </div>
              <div className="stat">
                <div className="statLabel">type種類</div>
                <div className="statValue">{analysis.summary.byType.length}</div>
              </div>
            </div>

            {analysis.summary.total === 0 ? (
              <div className="alert warn">
                <div className="alertTitle">event-like を自動検出できませんでした</div>
                <div className="alertBody">
                  DB構造や項目名が想定と違う可能性があります。<br />
                  まずは viewer 側の latest.json が空でないか確認してください。
                </div>
              </div>
            ) : (
              <>
                <div className="grid3">
                  <div className="card">
                    <div className="cardTitle">type / skill 上位</div>
                    <div className="list">
                      {analysis.summary.byType.slice(0, 20).map(([k, n]) => (
                        <div key={k} className="row">
                          <div className="name">{k}</div>
                          <div className="num">{n}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card">
                    <div className="cardTitle">result / outcome 上位</div>
                    <div className="list">
                      {analysis.summary.byResult.slice(0, 20).map(([k, n]) => (
                        <div key={k} className="row">
                          <div className="name">{k}</div>
                          <div className="num">{n}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card">
                    <div className="cardTitle">player 上位（最大30）</div>
                    <div className="list">
                      {analysis.summary.byPlayer.map(([k, n]) => (
                        <div key={k} className="row">
                          <div className="name">{k}</div>
                          <div className="num">{n}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="card" style={{ marginTop: 12 }}>
                  <div className="cardHead">
                    <div className="cardTitle">選手別：試合ごとの決定率 / 効果率</div>
                    <div className="pill">
                      {derived ? `${derived.matches.length} 試合 / ${derived.events.length} 件` : "-"}
                    </div>
                  </div>

                  {!derived ? (
                    <div className="hint">JSONを読み込むと表示されます。</div>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      <PlayerPicker
                        players={derived.players}
                        selectedPlayerId={selectedPlayerId}
                        onSelect={setSelectedPlayerId}
                        label="誰が（未指定= playerId が無いイベント）"
                      />

                      {derived.events.length === 0 ? (
                        <div className="hint">
                          集計対象（skill/result が判定できるイベント）が見つかりませんでした。
                          （viewer 側のマッピングに無い表記の可能性）
                        </div>
                      ) : (
                        <PlayerMatchStatsTable stats={playerMatchStats ?? []} />
                      )}

                      <div className="hint">
                        ※ JSONに matchId / matchName が入っていない場合、試合名が「(名称未設定)」になり、
                        matchName から疑似ID（name:xxx）でまとめます。<br />
                        volley-pwa 側の export に match 情報を含めると、ここが正確になります。
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            <details className="details">
              <summary>デバッグ：キー一覧を見る</summary>
              <div className="monoBox">
                {Object.keys(analysis.keybag).sort().map((k) => (
                  <div key={k} className="monoRow">
                    <span className="monoKey">{k}</span>
                    <span className="monoType">{typeof (analysis.keybag as any)[k]}</span>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
