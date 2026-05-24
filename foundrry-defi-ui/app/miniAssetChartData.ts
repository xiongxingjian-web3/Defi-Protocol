export type MiniAssetSeries = {
  path: string;
  points: string[];
};

export function computeMiniAssetSeries(values: number[]): MiniAssetSeries {
  if (values.length < 2) {
    return { path: "", points: [] };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 12;
  const w = 800;
  const h = 150;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const t = max === min ? 0.5 : (v - min) / (max - min);
    const y = h - pad - t * (h - pad * 2);
    return `${x},${y}`;
  });
  const pathD = `M ${pts.join(" L ")}`;
  return { path: pathD, points: pts };
}
