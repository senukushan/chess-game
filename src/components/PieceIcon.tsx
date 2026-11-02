import { useId } from "react";
import { PIECE_ART, THEMES, type Color, type PType } from "../game/pieces";

interface Props {
  type: PType;
  color: Color;
  size?: number;
  className?: string;
  glow?: boolean;
  style?: React.CSSProperties;
}

export default function PieceIcon({ type, color, size = 32, className, glow = true, style }: Props) {
  const raw = useId();
  const id = "pg" + raw.replace(/[^a-zA-Z0-9]/g, "");
  const th = THEMES[color];
  const art = PIECE_ART[type];
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      style={{ filter: glow ? `drop-shadow(0 0 ${Math.max(2, size / 14)}px ${th.glow})` : undefined, ...style }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={th.top} />
          <stop offset="0.5" stopColor={th.mid} />
          <stop offset="1" stopColor={th.bottom} />
        </linearGradient>
      </defs>
      <path d={art.body} fill={`url(#${id})`} stroke={th.rim} strokeWidth="3" strokeLinejoin="round" />
      {art.detail.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={th.detail} strokeWidth="2.2" strokeLinecap="round" />
      ))}
      {(art.dots ?? []).map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill={th.detail} />
      ))}
    </svg>
  );
}
