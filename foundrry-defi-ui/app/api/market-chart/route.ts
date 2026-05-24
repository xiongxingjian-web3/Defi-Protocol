import { NextRequest, NextResponse } from "next/server";

const ALLOWED_COINS = new Set(["ethereum", "bitcoin"]);
const CG_BASE = "https://api.coingecko.com/api/v3";

function downsample(values: number[], maxPoints: number): number[] {
  if (values.length <= maxPoints) return values;
  const out: number[] = [];
  const last = values.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i / (maxPoints - 1)) * last);
    out.push(values[idx]);
  }
  return out;
}

function parsePrices(json: unknown): number[] {
  if (!json || typeof json !== "object" || !("prices" in json)) return [];
  const raw = (json as { prices: unknown }).prices;
  if (!Array.isArray(raw)) return [];
  const nums: number[] = [];
  for (const row of raw) {
    if (Array.isArray(row) && row.length >= 2) {
      const n = Number(row[1]);
      if (Number.isFinite(n)) nums.push(n);
    }
  }
  return nums;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const coin = searchParams.get("coin") ?? "ethereum";
  const daysRaw = searchParams.get("days") ?? "7";
  const maxPointsRaw = searchParams.get("maxPoints") ?? "32";

  if (!ALLOWED_COINS.has(coin)) {
    return NextResponse.json({ error: "invalid coin" }, { status: 400 });
  }

  const days = Math.min(365, Math.max(1, Math.floor(Number(daysRaw)) || 7));
  const maxPoints = Math.min(
    200,
    Math.max(8, Math.floor(Number(maxPointsRaw)) || 32),
  );

  const url = `${CG_BASE}/coins/${coin}/market_chart?vs_currency=usd&days=${days}`;

  const headers: HeadersInit = { Accept: "application/json" };
  const apiKey = process.env.COINGECKO_API_KEY;
  if (apiKey) {
    headers["x-cg-demo-api-key"] = apiKey;
  }

  try {
    // 不用长缓存，否则前端定时刷新仍拿到旧 latestUsd（看起来像「价格不动」）
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `CoinGecko ${res.status}` },
        { status: 502 },
      );
    }
    const json: unknown = await res.json();
    const series = parsePrices(json);
    if (series.length < 2) {
      return NextResponse.json({ error: "no prices" }, { status: 502 });
    }
    const prices = downsample(series, maxPoints);
    return NextResponse.json({
      coin,
      days,
      prices,
      latestUsd: prices[prices.length - 1],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}