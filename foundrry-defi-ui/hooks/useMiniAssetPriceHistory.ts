import { useEffect, useState } from "react";

type Options = {
  days?: number;
  maxPoints?: number;
  /** 定时重新拉取行情（毫秒）。默认 60_000 = 每分钟；设为 0 则只在挂载时请求一次 */
  refetchIntervalMs?: number;
};

type ApiOk = { prices: number[]; latestUsd: number };
type ApiErr = { error: string };

function isApiOk(data: unknown): data is ApiOk {
  return (
    typeof data === "object" &&
    data !== null &&
    "prices" in data &&
    Array.isArray((data as ApiOk).prices) &&
    (data as ApiOk).prices.length >= 2
  );
}

export function useMiniAssetPriceHistory({
  days = 7,
  maxPoints = 24,
  refetchIntervalMs = 60_000,
}: Options = {}) {
  const [ethPrices, setEthPrices] = useState<number[] | null>(null);
  const [btcPrices, setBtcPrices] = useState<number[] | null>(null);
  const [ethSpot, setEthSpot] = useState<number | null>(null);
  const [btcSpot, setBtcSpot] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams({
      days: String(days),
      maxPoints: String(maxPoints),
    });

    async function load(silent: boolean) {
      if (!silent) {
        setIsLoading(true);
        setError(null);
      }
      try {
        const [ethRes, btcRes] = await Promise.all([
          fetch(`/api/market-chart?coin=ethereum&${q}`),
          fetch(`/api/market-chart?coin=bitcoin&${q}`),
        ]);
        const ethJson: unknown = await ethRes.json();
        const btcJson: unknown = await btcRes.json();
        if (cancelled) return;
        if (!ethRes.ok) {
          throw new Error((ethJson as ApiErr).error ?? String(ethRes.status));
        }
        if (!btcRes.ok) {
          throw new Error((btcJson as ApiErr).error ?? String(btcRes.status));
        }
        if (isApiOk(ethJson)) {
          setEthPrices(ethJson.prices);
          setEthSpot(ethJson.latestUsd);
        }
        if (isApiOk(btcJson)) {
          setBtcPrices(btcJson.prices);
          setBtcSpot(btcJson.latestUsd);
        }
        setError(null);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "load failed";
          if (!silent) {
            setError(msg);
            setEthPrices(null);
            setBtcPrices(null);
            setEthSpot(null);
            setBtcSpot(null);
          }
        }
      } finally {
        if (!cancelled && !silent) {
          setIsLoading(false);
        }
      }
    }

    void load(false);

    if (refetchIntervalMs <= 0) {
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setInterval(() => {
      void load(true);
    }, refetchIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [days, maxPoints, refetchIntervalMs]);

  return {
    ethValues: ethPrices ?? [],
    btcValues: btcPrices ?? [],
    ethSpotUsd: ethSpot,
    btcSpotUsd: btcSpot,
    isLoading,
    error,
    isLive: ethPrices !== null && btcPrices !== null,
  };
}