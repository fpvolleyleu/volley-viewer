// src/components/PlayerPicker.tsx
import type { Player, PlayerId } from "../lib/matchStats";

type Props = {
  players: Player[];
  selectedPlayerId: PlayerId | null;
  onSelect: (playerId: PlayerId | null) => void;
  label?: string;
};

export default function PlayerPicker(props: Props) {
  const { players, selectedPlayerId, onSelect, label } = props;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {label ? <div style={{ fontSize: 12, opacity: 0.8 }}>{label}</div> : null}

      <button
        type="button"
        onClick={() => onSelect(null)}
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.15)",
          background: selectedPlayerId === null ? "rgba(0,0,0,0.06)" : "white",
          textAlign: "left",
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        選手を指定しない（未指定）
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 8,
        }}
      >
        {players.map((p) => {
          const active = selectedPlayerId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                background: active ? "rgba(0,0,0,0.06)" : "white",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
