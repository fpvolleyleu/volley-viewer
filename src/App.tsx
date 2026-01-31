import { useMemo, useRef, useState } from "react";
import { findEventArrays, normalizeToKeyBag, pickDbRoot, summarizeEvents } from "./lib/extract";
import "./App.css";

type Loaded = { source: string; filename?: string; raw: unknown };

function formatDate(s?: string) {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

export default function App() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);

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
      const msg =
        e instanceof Error ? e.message : "latest.json の取得に失敗しました";
      setError(
        msg +
          "\n（対策）viewer リポの public/latest.json を更新して push してください。"
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
