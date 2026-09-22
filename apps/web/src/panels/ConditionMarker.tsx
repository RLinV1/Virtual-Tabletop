import { CONDITIONS, conditionSpec, type ConditionId, type ConditionShape } from "@vtt/shared";

/**
 * A condition marker outside the canvas (FR-TAC-08).
 *
 * Mirrors what `boardView` draws: a distinct shape carrying the condition's abbreviation.
 * Colour is decoration — remove it and the marker still reads, both visually and to a
 * screen reader, because the shape differs and the abbreviation is real text.
 */
export function ConditionMarker({ id, size = 22 }: { id: ConditionId; size?: number }) {
  const spec = conditionSpec(id);
  const half = size / 2;

  return (
    <span
      className="condition-marker"
      style={{ width: size, height: size }}
      title={spec.label}
      role="img"
      aria-label={spec.label}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true" focusable="false">
        <ShapePath shape={spec.shape} cx={half} cy={half} r={half - 1} fill={spec.color} />
        <text
          x={half}
          y={half}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.42}
          fontWeight="700"
          fill="#fff"
          stroke="#000"
          strokeWidth="0.6"
          paintOrder="stroke"
        >
          {spec.abbr}
        </text>
      </svg>
    </span>
  );
}

function ShapePath({
  shape,
  cx,
  cy,
  r,
  fill,
}: {
  shape: ConditionShape;
  cx: number;
  cy: number;
  r: number;
  fill: string;
}) {
  const stroke = { stroke: "rgba(0,0,0,.75)", strokeWidth: 1 };
  const poly = (pts: number[][]) => pts.map(([x, y]) => `${x},${y}`).join(" ");

  switch (shape) {
    case "circle":
      return <circle cx={cx} cy={cy} r={r} fill={fill} {...stroke} />;
    case "square":
      return <rect x={cx - r * 0.86} y={cy - r * 0.86} width={r * 1.72} height={r * 1.72} fill={fill} {...stroke} />;
    case "triangle":
      return <polygon points={poly([[cx, cy - r], [cx + r, cy + r * 0.8], [cx - r, cy + r * 0.8]])} fill={fill} {...stroke} />;
    case "diamond":
      return <polygon points={poly([[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]])} fill={fill} {...stroke} />;
    case "hexagon":
      return (
        <polygon
          points={poly(
            Array.from({ length: 6 }, (_, i) => {
              const a = (Math.PI / 3) * i - Math.PI / 2;
              return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
            }),
          )}
          fill={fill}
          {...stroke}
        />
      );
    case "heart": {
      const k = r * 0.55;
      return (
        <path
          d={`M ${cx} ${cy + r * 0.75} C ${cx - r * 1.3} ${cy - k}, ${cx - k * 0.5} ${cy - r * 1.15}, ${cx} ${cy - r * 0.35} C ${cx + k * 0.5} ${cy - r * 1.15}, ${cx + r * 1.3} ${cy - k}, ${cx} ${cy + r * 0.75} Z`}
          fill={fill}
          {...stroke}
        />
      );
    }
  }
}

/** Checkbox grid for choosing a token's conditions. */
export function ConditionPicker({
  value,
  onChange,
  disabled,
}: {
  value: ConditionId[];
  onChange: (next: ConditionId[]) => void;
  disabled?: boolean;
}) {
  const toggle = (id: ConditionId) =>
    onChange(value.includes(id) ? value.filter((c) => c !== id) : [...value, id]);

  return (
    <fieldset className="condition-picker" disabled={disabled}>
      <legend className="sr-only">Conditions</legend>
      {CONDITIONS.map((c) => (
        <label key={c.id} className={value.includes(c.id) ? "condition-option on" : "condition-option"}>
          <input
            type="checkbox"
            checked={value.includes(c.id)}
            onChange={() => toggle(c.id)}
            aria-label={c.label}
          />
          <ConditionMarker id={c.id} size={20} />
          <span>{c.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
