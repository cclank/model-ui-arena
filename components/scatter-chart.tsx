"use client";

type Point = {
  model: string;
  linesTotal: number;
  sizeBytes: number;
  withinLineLimit: boolean;
  unlimitedLines?: boolean;
  usesBitmap?: boolean;
};

export function ScatterChart({ data }: { data: Point[] }) {
  if (!data.length) {
    return <p className="empty-selection">当前主题没有可绘制的作品</p>;
  }

  const W = 760;
  const H = 280;
  const pad = { l: 56, r: 18, t: 18, b: 42 };

  const xs = data.map((d) => d.linesTotal);
  const ys = data.map((d) => d.sizeBytes / 1024);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xr = xMax - xMin || 1;
  const yr = yMax - yMin || 1;

  const px = (x: number) => pad.l + ((x - xMin) / xr) * (W - pad.l - pad.r);
  const py = (y: number) => H - pad.b - ((y - yMin) / yr) * (H - pad.t - pad.b);

  const color = (d: Point) =>
    d.unlimitedLines
      ? d.usesBitmap
        ? "var(--warning)"
        : "var(--brand)"
      : d.withinLineLimit
        ? "var(--brand)"
        : "var(--warning)";

  return (
    <div className="scatter-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="scatter" role="img" aria-label="代码量与体积分布散点图">
        <line className="axis" x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} />
        <line className="axis" x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} />

        <text className="axis-label" x={(pad.l + W - pad.r) / 2} y={H - 8} textAnchor="middle">
          代码行数 →
        </text>
        <text className="axis-label" x={16} y={(pad.t + H - pad.b) / 2} textAnchor="middle" transform={`rotate(-90 16 ${(pad.t + H - pad.b) / 2})`}>
          体积 KB →
        </text>

        <text className="tick-label" x={pad.l} y={H - pad.b + 16} textAnchor="middle">{xMin}</text>
        <text className="tick-label" x={W - pad.r} y={H - pad.b + 16} textAnchor="end">{xMax}</text>
        <text className="tick-label" x={pad.l - 8} y={H - pad.b} textAnchor="end">{Math.round(yMin)}</text>
        <text className="tick-label" x={pad.l - 8} y={pad.t + 4} textAnchor="end">{Math.round(yMax)}</text>

        {data.map((d) => {
          const cx = px(d.linesTotal);
          const cy = py(d.sizeBytes / 1024);
          return (
            <g key={d.model}>
              <circle cx={cx} cy={cy} r="6.5" fill={color(d)} fillOpacity="0.85" stroke="#0c111b" strokeWidth="1.5">
                <title>{`${d.model} · ${d.linesTotal} 行 · ${Math.round(d.sizeBytes / 1024)} KB`}</title>
              </circle>
              <text className="tick-label" x={cx} y={cy - 11} textAnchor="middle">
                {d.model.length > 14 ? d.model.slice(0, 13) + "…" : d.model}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="scatter-hint">
        左下 = 更少代码、更小体积（更高效）。颜色：绿 = PASS / 手绘，红 = OVER / 贴图。悬停查看模型详情。
      </p>
    </div>
  );
}
