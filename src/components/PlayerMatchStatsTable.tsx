// src/components/PlayerMatchStatsTable.tsx
import type { PlayerMatchStat, Skill } from "../lib/matchStats";
import { formatPct } from "../lib/matchStats";

const SKILLS: Skill[] = ["spike", "serve", "block", "receive", "set"];

function skillLabel(s: Skill): string {
  switch (s) {
    case "spike": return "スパイク";
    case "serve": return "サーブ";
    case "block": return "ブロック";
    case "receive": return "レシーブ";
    case "set": return "トス";
  }
}

export default function PlayerMatchStatsTable(props: { stats: PlayerMatchStat[] }) {
  const { stats } = props;

  if (stats.length === 0) {
    return <div style={{ opacity: 0.75 }}>この選手のイベントがまだありません。</div>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {stats.map((m) => (
        <div
          key={m.matchId}
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 14,
            padding: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
            <div style={{ fontWeight: 800 }}>{m.matchName}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              試行 {m.total} / 決定 {formatPct(m.decisionRate)} / 効果 {formatPct(m.effectRate)}
            </div>
          </div>

          <div style={{ marginTop: 10, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.85 }}>
                  <th style={{ padding: "6px 6px" }}>項目</th>
                  <th style={{ padding: "6px 6px" }}>試行</th>
                  <th style={{ padding: "6px 6px" }}>決定率</th>
                  <th style={{ padding: "6px 6px" }}>効果率</th>
                </tr>
              </thead>
              <tbody>
                {SKILLS.map((s) => {
                  const st = m.bySkill?.[s];
                  if (!st || st.total === 0) return null;
                  return (
                    <tr key={s} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                      <td style={{ padding: "6px 6px", fontWeight: 700 }}>{skillLabel(s)}</td>
                      <td style={{ padding: "6px 6px" }}>{st.total}</td>
                      <td style={{ padding: "6px 6px" }}>{formatPct(st.decisionRate)}</td>
                      <td style={{ padding: "6px 6px" }}>{formatPct(st.effectRate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
