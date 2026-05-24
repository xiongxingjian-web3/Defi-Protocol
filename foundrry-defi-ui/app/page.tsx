"use client";

import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useDSC } from "@/hooks/Dsc";
import {
  type AtRiskPosition,
  useLiquidatableQueue,
} from "@/hooks/useLiquidatableQueue";
import { computeMiniAssetSeries } from "./miniAssetChartData";
import { useMiniAssetPriceHistory } from "@/hooks/useMiniAssetPriceHistory";

/** DSCEngine：LIQUIDATION_BONUS=10、LIQUIDATION_PRECISION=100 → 代币层面 +10%；1 DSC≈$1 时抵押物美元估值约 = 覆盖债务×此系数 */
const LIQUIDATION_COLLATERAL_USD_HINT_MULTIPLIER = 1.1;

type CollateralTab = "WETH" | "WBTC";

function formatUsd(n: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(n);
}

function formatNumber(n: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(n);
}

function formatCompact(n: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

/** 市场卡片 / 图表角标：无静态价，仅接口数值或加载、失败态 */
function ChartSpotDisplay({
  value,
  initialLoading,
  fetchFailed,
}: {
  value: number | null | undefined;
  initialLoading: boolean;
  fetchFailed: boolean;
}) {
  if (value != null && Number.isFinite(value)) {
    return <>{formatUsd(value, 2)}</>;
  }
  if (initialLoading) {
    return (
      <span className="animate-pulse font-normal text-xs text-slate-400">
        获取中…
      </span>
    );
  }
  if (fetchFailed) {
    return (
      <span className="font-normal text-xs text-amber-800">不可用</span>
    );
  }
  return <span className="font-normal text-slate-400">—</span>;
}

function hfBarColor(hf: number) {
  if (hf >= 1.35) return "from-emerald-400 to-cyan-400";
  if (hf >= 1.05) return "from-amber-400 to-yellow-300";
  return "from-rose-500 to-orange-400";
}

function hfLabel(hf: number) {
  if (hf >= 1.35) return { text: "安全", className: "text-emerald-400" };
  if (hf >= 1.05) return { text: "注意", className: "text-amber-400" };
  return { text: "危险", className: "text-rose-400" };
}

type MiniAssetChartProps = {
  ethValues: number[];
  btcValues: number[];
  ethSpotUsd?: number | null;
  btcSpotUsd?: number | null;
  /** 首次请求尚未返回曲线数据 */
  chartLoading: boolean;
  /** 首次请求失败且无曲线时可读原因 */
  chartError: string | null;
};

type ChartAssetTab = "ETH" | "BTC";

function MiniAssetChart({
  ethValues,
  btcValues,
  ethSpotUsd,
  btcSpotUsd,
  chartLoading,
  chartError,
}: MiniAssetChartProps) {
  const [asset, setAsset] = useState("ETH" as ChartAssetTab);
  const values = asset === "ETH" ? ethValues : btcValues;
  const themeHex = asset === "ETH" ? "#2563eb" : "#d97706";
  const chartId = asset === "ETH" ? "eth" : "btc";
  const chartHasSeries = values.length >= 2;
  const fetchFailed = !chartLoading && chartError != null && !chartHasSeries;

  const { path, points } = useMemo(
    () => computeMiniAssetSeries(values),
    [values],
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/50 p-5 sm:p-6">
      <div className="mb-3 flex flex-col gap-3 sm:mb-4">
        <p className="text-xs leading-relaxed text-slate-500">
          近几日美元价格曲线来自{" "}
          <span className="font-semibold text-slate-700">CoinGecko</span>
          （经本站 API 代理）。与协议内 Chainlink 喂价可能略有差异；清算与铸币仍以链上为准。
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2 rounded-lg bg-slate-200/50 p-1">
            <button
              type="button"
              onClick={() => setAsset("ETH")}
              className={`rounded-md px-3 py-1 text-[10px] font-black transition ${
                asset === "ETH"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              ETH
            </button>
            <button
              type="button"
              title="WBTC 完整功能后续完善，请以 WETH 为主"
              onClick={() => setAsset("BTC")}
              className={`rounded-md px-3 py-1 text-[10px] font-black transition ${
                asset === "BTC"
                  ? "bg-white text-amber-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              BTC
            </button>
          </div>
          <span className="font-mono text-sm font-black text-slate-900">
            <ChartSpotDisplay
              value={asset === "ETH" ? ethSpotUsd : btcSpotUsd}
              initialLoading={chartLoading}
              fetchFailed={fetchFailed}
            />
          </span>
        </div>
      </div>
      {chartHasSeries ? (
        <svg
          viewBox="0 0 800 150"
          className="block aspect-[800/150] w-full max-w-full"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <defs>
            <linearGradient
              id={`lineGrad-${chartId}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor={themeHex} stopOpacity="0.8" />
              <stop offset="100%" stopColor={themeHex} stopOpacity="1" />
            </linearGradient>
            <linearGradient id={`areaGrad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={themeHex} stopOpacity="0.15" />
              <stop offset="100%" stopColor={themeHex} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={`${path} L 800 150 L 0 150 Z`}
            fill={`url(#areaGrad-${chartId})`}
            stroke="none"
          />
          <path
            d={path}
            fill="none"
            stroke={`url(#lineGrad-${chartId})`}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {points.map((p, i) => {
            const [cx, cy] = p.split(",").map(Number);
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={4}
                fill={themeHex}
                className="opacity-100"
              />
            );
          })}
        </svg>
      ) : chartLoading ? (
        <div
          className="flex aspect-[800/150] w-full max-w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-100/60 text-xs font-medium text-slate-500"
          role="status"
        >
          正在加载曲线…
        </div>
      ) : chartError ? (
        <div
          className="flex aspect-[800/150] w-full max-w-full items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 text-center text-xs text-amber-900"
          role="alert"
        >
          {chartError}
        </div>
      ) : (
        <div className="flex aspect-[800/150] w-full max-w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-400">
          暂无曲线数据
        </div>
      )}
    </div>
  );
}


export default function Home() {
  const [tab, setTab] = useState("WETH" as CollateralTab);
  const {
    totalDscMinted,
    collateralValueInUsd,
    healthFactor,
    deposit,
    withdraw,
    isBalanceLoading,
    walletBalance,
    mintDsc,
    remainingDscMintable,
    burnDsc,
    dscWalletBalance,
    isDscBalanceLoading,
    totalDscNumber,
    totalCollateralValueInUsd,
    liquidate
  } = useDSC(tab);

  const { isConnected, address: walletAddress } = useAccount();
  const {
    positions: atRiskPositions,
    isLoading: liqLoading,
    isRefetching: liqRefetching,
    isError: liqIsError,
    error: liqError,
    refetch: refetchLiqQueue,
    subgraphConfigured,
    listHfThreshold,
  } = useLiquidatableQueue();

  const [wethInput, setWethInput] = useState("");
  const [wbtcInput, setWbtcInput] = useState("");
  const [dscInput, setDscInput] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [showPositionDetail, setShowPositionDetail] = useState(false);
  const [liquidateModalRow, setLiquidateModalRow] =
    useState<AtRiskPosition | null>(null);
  const [liquidateDscInput, setLiquidateDscInput] = useState("");
  const ITEMS_PER_PAGE = 3;
  const liqTotalPages = Math.max(
    1,
    Math.ceil(atRiskPositions.length / ITEMS_PER_PAGE),
  );
  const paginatedAtRisk = atRiskPositions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );
  const miniAssetChart = useMiniAssetPriceHistory({
    days: 7,
    maxPoints: 24,
  });
  const chartPriceLoading =
    miniAssetChart.isLoading && !miniAssetChart.isLive;
  const chartPriceFailed =
    !miniAssetChart.isLoading &&
    !miniAssetChart.isLive &&
    miniAssetChart.error != null;
  useEffect(() => {
    setCurrentPage((p) => Math.min(p, liqTotalPages));
  }, [liqTotalPages]);

  const closeLiquidateModal = () => {
    setLiquidateModalRow(null);
    setLiquidateDscInput("");
  };

  const liquidateCollateralHint = useMemo(() => {
    const row = liquidateModalRow;
    if (!row) return null;
    const raw = liquidateDscInput.trim().replace(/,/g, "");
    if (raw === "") return { state: "idle" as const };
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return { state: "invalid" as const };
    const capped = Math.min(n, row.totalDscMinted);
    const clampedToDebt =
      n > row.totalDscMinted && row.totalDscMinted > 0;
    return {
      state: "ready" as const,
      dscRequested: n,
      dscEffective: capped,
      clampedToDebt,
      collateralUsdEstimate:
        capped * LIQUIDATION_COLLATERAL_USD_HINT_MULTIPLIER,
    };
  }, [liquidateDscInput, liquidateModalRow]);

  const hfValue = healthFactor || 0;
  const hfPercent = Math.min(100, (hfValue / 2.5) * 100);
  const hfStyle = hfBarColor(hfValue);
  const hfInfo = hfLabel(hfValue);

  const walletExplorer =
    walletAddress && isConnected
      ? `https://sepolia.etherscan.io/address/${walletAddress}`
      : null;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 selection:bg-blue-500/20">
      {/* 柔和背景装饰 - 替换深色光晕 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[600px] w-[600px] rounded-full bg-blue-100/50 blur-[120px]" />
        <div className="absolute -right-20 top-1/4 h-[500px] w-[500px] rounded-full bg-indigo-50/50 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[min(100%,88rem)] flex-col px-4 pb-8 pt-6 sm:px-6 lg:px-10">
        {/* 顶部导航 - 浅色专业风 */}
        <header className="mb-10 flex flex-col gap-6 border-b border-slate-200 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-bold text-white shadow-lg shadow-blue-500/30">
              ◈
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">
                DSC <span className="text-blue-600 font-light">PROTOCOL</span>
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Decentralized Stability Engine
              </p>
            </div>
          </div>
          <div className="rounded-xl  px-6 py-2.5  tracking-widest text-white  transition ">
            <ConnectButton />
          </div>
        </header>

        {/* 核心状态摘要 - 浅色卡片 */}
        <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-3xl border border-white bg-white p-7 shadow-sm">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              总抵押品价值
            </p>
            <h3 className="text-3xl font-black text-slate-900">
              {formatUsd(collateralValueInUsd)}
            </h3>
          </div>
          <div className="rounded-3xl border border-white bg-white p-7 shadow-sm">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              已借出 DSC
            </p>
            <h3 className="text-3xl font-black text-slate-900">
              {formatNumber(totalDscMinted)}{" "}
              <span className="text-sm font-normal text-slate-400">DSC</span>
            </h3>
          </div>
          <div className="rounded-3xl border border-white bg-white p-7 shadow-sm">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                健康因子
              </p>
              <span
                className={`text-[10px] font-black uppercase ${hfInfo.className}`}
              >
                {hfInfo.text}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <h3 className={`text-3xl font-black ${hfInfo.className}`}>
                {hfValue > 1e10 ? "∞" : hfValue.toFixed(2)}
              </h3>
              <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${hfStyle}`}
                  style={{ width: `${hfPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 主内容区域 */}
        <main className="flex flex-col gap-10">
          {/* 市场 + 协议/状态：行情全宽一行，下面两卡并排，避免左右列高度错位 */}
          <section className="flex flex-col gap-6 lg:gap-8">
            <div className="w-full rounded-[40px] border border-white bg-white p-6 shadow-sm sm:p-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  市场洞察
                </h2>
                <div className="flex shrink-0 gap-6 sm:gap-8">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      WETH
                    </p>
                    <p className="font-mono text-sm font-black text-slate-900">
                      <ChartSpotDisplay
                        value={miniAssetChart.ethSpotUsd}
                        initialLoading={chartPriceLoading}
                        fetchFailed={chartPriceFailed}
                      />
                    </p>
                    <p className="mt-0.5 text-[9px] font-medium text-slate-400">
                      {miniAssetChart.isLive
                        ? "当前主路径 · 与下图同源"
                        : chartPriceLoading
                          ? "正在获取行情…"
                          : chartPriceFailed
                            ? "行情不可用"
                            : "—"}
                    </p>
                  </div>
                  <div className="text-right border-l border-slate-100 pl-6 sm:pl-8">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      WBTC
                    </p>
                    <p className="font-mono text-sm font-black text-slate-900">
                      <ChartSpotDisplay
                        value={miniAssetChart.btcSpotUsd}
                        initialLoading={chartPriceLoading}
                        fetchFailed={chartPriceFailed}
                      />
                    </p>
                    <p className="mt-0.5 text-[9px] font-medium text-slate-400">
                      {miniAssetChart.isLive
                        ? "现货参考（BTC/USD）· 与下图同源"
                        : chartPriceLoading
                          ? "正在获取行情…"
                          : chartPriceFailed
                            ? "行情不可用"
                            : "—"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 border-t border-slate-50 pt-4 sm:mt-5 sm:pt-5">
              {miniAssetChart.error ? (
                <p className="mb-2 text-[11px] text-amber-800" role="alert">
                  行情暂时不可用：{miniAssetChart.error}
                </p>
              ) : null}
              <MiniAssetChart
                ethValues={miniAssetChart.ethValues}
                btcValues={miniAssetChart.btcValues}
                ethSpotUsd={miniAssetChart.ethSpotUsd}
                btcSpotUsd={miniAssetChart.btcSpotUsd}
                chartLoading={chartPriceLoading}
                chartError={
                  chartPriceFailed ? miniAssetChart.error : null
                }
              />
              </div>
            </div>

            <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 md:gap-8">
              <div className="flex h-full flex-col rounded-[40px] border border-white bg-white p-6 shadow-sm sm:p-7">
                <h2 className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  协议统计
                </h2>
                <div className="flex flex-1 flex-col justify-center space-y-5">
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      总供应量 (DSC)
                    </p>
                    <p className="text-2xl font-black text-slate-900">
                      {formatCompact(totalDscNumber)}
                    </p>
                  </div>
                  <div className="border-t border-slate-50 pt-5">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      总抵押价值
                    </p>
                    <p className="text-2xl font-black text-slate-900">
                      {formatUsd(totalCollateralValueInUsd)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex h-full min-h-0 flex-col rounded-[40px] bg-gradient-to-br from-blue-600 to-indigo-700 p-6 shadow-lg shadow-blue-500/20 text-white relative overflow-hidden group sm:p-7 md:min-h-[260px]">
                <div className="absolute -right-8 -bottom-8 h-40 w-40 rounded-full bg-white/10 blur-3xl transition-transform group-hover:scale-150 duration-700" />
                <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-white/60">
                  您的当前状态
                </h2>
                <div className="space-y-4">
                  <p className="text-3xl font-black">
                    {formatUsd(collateralValueInUsd)}
                  </p>
                  <p className="text-sm font-medium text-blue-100">
                    已抵押资产总估值
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPositionDetail(true)}
                  className="mt-auto w-full rounded-2xl bg-white/20 py-3 text-xs font-black uppercase tracking-widest backdrop-blur-md hover:bg-white/30 transition-all"
                >
                  查看详情
                </button>
              </div>
            </div>
          </section>

          {/* 第二部分：操作中心 (中层) */}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="rounded-[40px] border border-white bg-white p-10 shadow-sm">
              <div className="mb-8">
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  管理抵押资产
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  当前以 <span className="font-semibold text-slate-600">WETH</span>{" "}
                  为主路径；WBTC 相关封装与联调仍在补充中。
                </p>
              </div>
              <div className="mb-8 flex rounded-2xl bg-slate-50 p-1.5">
                {(["WETH", "WBTC"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`flex-1 rounded-xl py-3 text-xs font-black transition-all ${
                      tab === t
                        ? "bg-white text-blue-600 shadow-md"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <span className="inline-flex flex-col items-center gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-2">
                      <span>{t}</span>
                      {t === "WBTC" ? (
                        <span className="rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                          即将完善
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
              {tab === "WBTC" ? (
                <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  <p className="font-bold">WBTC 尚未完整接入</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-amber-900/90">
                    代币解析、余额与合约路径仍在开发中。为获得稳定体验，请先使用{" "}
                    <span className="font-semibold">WETH</span>{" "}
                    进行抵押与赎回；WBTC 支持将在后续版本补齐。
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab("WETH")}
                    className="mt-3 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-amber-700"
                  >
                    切换到 WETH
                  </button>
                </div>
              ) : null}
              <div className="space-y-6">
                <div className="flex items-center justify-between px-2 text-[10px] font-bold uppercase text-slate-400 tracking-widest">
                  <span>输入数量</span>
                  <span>
                    余额:{" "}
                    {isBalanceLoading
                      ? "加载中..."
                      : formatNumber(walletBalance, 4)}{" "}
                    {tab}
                  </span>
                </div>
                <input
                  value={tab === "WETH" ? wethInput : wbtcInput}
                  onChange={(e) =>
                    tab === "WETH"
                      ? setWethInput(e.target.value)
                      : setWbtcInput(e.target.value)
                  }
                  placeholder="0.00"
                  disabled={tab === "WBTC"}
                  className="w-full rounded-[24px] border border-slate-100 bg-slate-50 px-8 py-6 font-mono text-3xl font-bold text-slate-900 outline-none transition-all focus:border-blue-500/30 focus:ring-4 focus:ring-blue-500/5 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    disabled={tab === "WBTC"}
                    title={
                      tab === "WBTC"
                        ? "WBTC 抵押尚未完整接入，请使用 WETH"
                        : undefined
                    }
                    onClick={() =>
                      deposit(
                        tab,
                        Number(tab === "WETH" ? wethInput : wbtcInput)
                      )
                    }
                    className="rounded-[24px] bg-slate-900 py-5 text-sm font-black text-white shadow-xl shadow-slate-900/10 transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-slate-900"
                  >
                    抵押
                  </button>
                  <button
                    type="button"
                    disabled={tab === "WBTC"}
                    title={
                      tab === "WBTC"
                        ? "WBTC 赎回尚未完整接入，请使用 WETH"
                        : undefined
                    }
                    onClick={() =>
                      withdraw(
                        tab,
                        Number(tab === "WETH" ? wethInput : wbtcInput)
                      )
                    }
                    className="rounded-[24px] border border-slate-200 py-5 text-sm font-black text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    赎回
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[40px] border border-white bg-white p-10 shadow-sm">
              <div className="mb-8">
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  铸造/销毁 DSC
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  铸造成功后 DSC 会进入<strong>当前连接的钱包</strong>。页面「可用借款额度」减少表示协议记账债务增加。若小狐狸余额不变，多半是未导入 DSC 代币或网络不一致。
                </p>
              </div>
              <div className="mb-8 rounded-3xl bg-amber-50/50 p-6 border border-amber-100/50">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">
                  可用借款额度
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-black text-slate-900">
                    {formatNumber(remainingDscMintable)}
                  </p>
                  <p className="text-sm font-bold text-slate-400">DSC</p>
                </div>
              </div>
              <div className="space-y-6">
                <input
                  value={dscInput}
                  onChange={(e) => setDscInput(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-[24px] border border-slate-100 bg-slate-50 px-8 py-6 font-mono text-3xl font-bold text-slate-900 outline-none focus:border-amber-500/30 focus:ring-4 focus:ring-amber-500/5 transition-all"
                />
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => mintDsc(Number(dscInput))}
                    className="rounded-[24px] bg-amber-500 py-5 text-sm font-black text-white hover:bg-amber-600 transition-all shadow-xl shadow-amber-500/20"
                  >
                    铸造
                  </button>
                  <button
                    onClick={() => burnDsc(Number(dscInput))}
                    className="rounded-[24px] border border-slate-200 py-5 text-sm font-black text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    销毁
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 第三部分：安全与清算 (下层) */}
          <div className="rounded-[40px] border border-white bg-white p-10 shadow-sm">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  待清算队列
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  The Graph 拉有债用户，链上 multicall 算实时 HF；展示 HF &lt;{" "}
                  {listHfThreshold} 的预警仓位（约每 15s 刷新
                  {liqRefetching ? " · 更新中" : ""}）。链上清算仍要求 HF &lt; 1。
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(1, prev - 1))
                  }
                  disabled={currentPage === 1}
                  className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-100 text-slate-400 hover:bg-slate-50 disabled:opacity-30 transition-all"
                >
                  ←
                </button>
                <div className="flex items-center px-4 font-mono text-xs font-black text-slate-400 bg-slate-50 rounded-xl">
                  {currentPage} / {liqTotalPages}
                </div>
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(liqTotalPages, prev + 1))
                  }
                  disabled={currentPage === liqTotalPages}
                  className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-100 text-slate-400 hover:bg-slate-50 disabled:opacity-30 transition-all"
                >
                  →
                </button>
              </div>
            </div>
            {!subgraphConfigured ? (
              <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                在 <code className="font-mono">foundrry-defi-ui/.env.local</code>{" "}
                设置{" "}
                <code className="font-mono">NEXT_PUBLIC_SUBGRAPH_URL</code>
                （The Graph Studio 部署子图后的查询 URL），保存后重启{" "}
                <code className="font-mono">npm run dev</code>。
              </div>
            ) : null}
            {liqIsError ? (
              <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
                {liqError?.message ?? "加载失败"}
              </div>
            ) : null}
            {tab === "WBTC" ? (
              <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-950">
                <p className="font-bold">清算路径说明</p>
                <p className="mt-1 leading-relaxed text-sky-900/90">
                  发起清算时使用的抵押代币与上方 Tab 一致。WBTC 路径尚未封装完整，若需尝试清算请先切换到{" "}
                  <span className="font-semibold">WETH</span>。
                </p>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {subgraphConfigured && liqLoading && atRiskPositions.length === 0 ? (
                <div className="col-span-full py-12 text-center text-sm font-bold text-slate-400">
                  正在从子图与链上拉取数据…
                </div>
              ) : null}
              {subgraphConfigured &&
              !liqLoading &&
              atRiskPositions.length === 0 &&
              !liqIsError ? (
                <div className="col-span-full py-12 text-center text-sm font-bold text-slate-400">
                  当前没有 HF &lt; {listHfThreshold} 的仓位。
                </div>
              ) : null}
              {paginatedAtRisk.map((row) => (
                <div
                  key={row.address}
                  className="group relative rounded-3xl border border-slate-100 bg-white p-6 transition-all hover:border-blue-500/30 hover:shadow-xl hover:shadow-blue-500/5"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span
                      className={`rounded-lg px-3 py-1 text-[10px] font-black uppercase ${
                        row.healthFactor < 1
                          ? "bg-rose-50 text-rose-600"
                          : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      HF: {row.healthFactor.toFixed(4)}
                      {row.isDevFixture ? (
                        <span className="ml-2 text-violet-600">· 演示</span>
                      ) : null}
                    </span>
                    <span className="font-mono text-[10px] font-bold text-slate-300">
                      {row.addressShort}
                    </span>
                  </div>
                  <div className="space-y-1 mb-6">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {row.collateralLabel} 抵押
                    </p>
                    <p className="text-xl font-black text-slate-900">
                      {formatNumber(row.totalDscMinted, 4)}{" "}
                      <span className="text-sm font-normal text-slate-400">
                        DSC 债务
                      </span>
                    </p>
                    <p className="text-[10px] font-bold text-slate-400">
                      抵押估值约 {formatUsd(row.collateralUsd)}
                    </p>
                  </div>
                  <button
                    type="button"
                    title={
                      row.isDevFixture
                        ? "演示行：HF 为假数据；链上 HF≥1 时无法 liquidate"
                        : row.healthFactor >= 1
                          ? "HF ≥ 1 时链上无法 liquidate"
                          : "输入要清算的 DSC 数量"
                    }
                    disabled={
                      !isConnected ||
                      (!row.isDevFixture && row.healthFactor >= 1)
                    }
                    onClick={() => {
                      setLiquidateModalRow(row);
                      setLiquidateDscInput("");
                    }}
                    className="w-full rounded-2xl bg-slate-50 py-3 text-xs font-black uppercase tracking-widest text-slate-600 group-hover:bg-rose-500 group-hover:text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {row.isDevFixture
                      ? "演示行 · 可打开弹窗（链上不可清算）"
                      : row.healthFactor >= 1
                        ? "仅监控（HF≥1 不可链上清算）"
                        : "立即清算 ⚡"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </main>

        <footer className="mt-16 text-center text-slate-400 pb-12">
          <p className="text-[10px] font-bold uppercase tracking-widest">
            © 2026 DSC PROTOCOL · DESIGNED FOR CLARITY & STABILITY
          </p>
        </footer>
      </div>

      {showPositionDetail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="position-detail-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setShowPositionDetail(false)}
        >
          <div
            className="relative w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowPositionDetail(false)}
              className="absolute right-6 top-6 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="关闭"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            <h2
              id="position-detail-title"
              className="pr-12 text-xl font-black text-slate-900"
            >
              我的协议仓位
            </h2>
            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">
              与「您的当前状态」卡片一致，展开链上读数
            </p>

            {!isConnected ? (
              <p className="mt-8 text-sm font-medium text-slate-500">
                请先连接钱包以查看您在 DSCEngine 中的仓位。
              </p>
            ) : (
              <dl className="mt-8 space-y-5">
                <div className="flex flex-col gap-1">
                  <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    钱包地址
                  </dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-800">
                      {walletAddress
                        ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
                        : "—"}
                    </span>
                    {walletExplorer && (
                      <a
                        href={walletExplorer}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-blue-600 hover:underline"
                      >
                        Sepolia 浏览器 ↗
                      </a>
                    )}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-t border-slate-100 pt-5">
                  <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    抵押品总估值（协议内）
                  </dt>
                  <dd className="text-right text-lg font-black text-slate-900">
                    {formatUsd(collateralValueInUsd)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    已借 DSC（记账）
                  </dt>
                  <dd className="text-right font-mono text-sm font-bold text-slate-800">
                    {formatNumber(totalDscMinted, 4)} DSC
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    健康因子
                  </dt>
                  <dd className="text-right">
                    <span
                      className={`text-lg font-black tabular-nums ${hfInfo.className}`}
                    >
                      {hfValue > 1e10 ? "∞" : hfValue.toFixed(2)}
                    </span>
                    <span className="ml-2 text-xs font-bold text-slate-500">
                      {hfInfo.text}
                    </span>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    剩余可铸（估算）
                  </dt>
                  <dd className="text-right font-mono text-sm font-bold text-slate-800">
                    {formatNumber(remainingDscMintable, 4)} DSC
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    钱包 DSC 余额
                  </dt>
                  <dd className="flex items-center justify-end gap-2 text-right font-mono text-sm font-bold text-slate-800">
                    {isDscBalanceLoading ? (
                      <span
                        className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600"
                        aria-hidden
                      />
                    ) : null}
                    {formatNumber(dscWalletBalance, 4)} DSC
                  </dd>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    协议级参考（非个人仓位）
                  </p>
                  <div className="mt-2 flex justify-between gap-4 text-xs">
                    <span className="font-medium text-slate-500">
                      全链 DSC 总供应
                    </span>
                    <span className="font-mono font-bold text-slate-800">
                      {formatCompact(totalDscNumber)} DSC
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between gap-4 text-xs">
                    <span className="font-medium text-slate-500">
                      协议总抵押估值
                    </span>
                    <span className="font-mono font-bold text-slate-800">
                      {formatUsd(totalCollateralValueInUsd)}
                    </span>
                  </div>
                </div>
              </dl>
            )}

            <button
              type="button"
              onClick={() => setShowPositionDetail(false)}
              className="mt-8 w-full rounded-2xl bg-slate-900 py-3 text-xs font-black uppercase tracking-widest text-white transition-opacity hover:opacity-90"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {liquidateModalRow ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="liquidate-modal-title"
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/55 p-3 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={closeLiquidateModal}
        >
          <div
            className="relative flex max-h-[min(92vh,880px)] w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/10 sm:rounded-[36px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-100 bg-slate-50/40 px-6 pb-6 pt-7 sm:px-10 sm:pb-7 sm:pt-9">
              <button
                type="button"
                onClick={closeLiquidateModal}
                className="absolute right-4 top-4 rounded-2xl p-2.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700 sm:right-6 sm:top-6"
                aria-label="关闭"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
              <h2
                id="liquidate-modal-title"
                className="pr-14 text-2xl font-black tracking-tight text-slate-900 sm:text-[1.65rem]"
              >
                清算 DSC
              </h2>
              <p className="mt-2 max-w-lg text-sm font-medium leading-relaxed text-slate-500">
                指定要代为偿还的 DSC 数量；链上交易接入后可在此确认。
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-7 sm:px-10 sm:py-9">
              {liquidateModalRow.isDevFixture ? (
                <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  <p className="font-bold">开发演示行</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-amber-900/95">
                    列表中的 HF / 债务等为前端假数据，不会写进链上。合约仍读取该地址真实{" "}
                    <span className="font-mono">getHealthFactor</span>；若真实
                    HF 仍 ≥ 1，会触发{" "}
                    <span className="font-mono">require(HF &lt; 1e18)</span>{" "}
                    并回滚。要测通真清算需：链上真实坏账地址、本地 Anvil
                    改预言机/造仓，或关闭环境变量中的演示行。
                  </p>
                </div>
              ) : null}
              {tab === "WBTC" ? (
                <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
                  <p className="font-bold">WBTC 清算路径未就绪</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-sky-900/95">
                    当前合约调用会使用 WBTC 作为抵押代币参数，但该路径尚未封装完整。请先关闭本弹窗，在「管理抵押资产」中切换到{" "}
                    <span className="font-semibold">WETH</span>{" "}
                    后再发起清算。
                  </p>
                </div>
              ) : null}
              <div className="rounded-3xl border border-slate-100 bg-slate-50/90 px-5 py-5 sm:px-6 sm:py-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  目标仓位
                </p>
                <div className="mt-4 space-y-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <span className="font-medium text-slate-500">地址</span>
                    <span className="font-mono text-sm font-bold text-slate-900">
                      {liquidateModalRow.addressShort}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] leading-relaxed break-all text-slate-500 sm:text-xs">
                    {liquidateModalRow.address}
                  </p>
                  <div className="h-px bg-slate-200/80" />
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <span className="font-medium text-slate-500">健康因子</span>
                    <span className="font-mono text-sm font-bold text-rose-600">
                      {liquidateModalRow.healthFactor.toFixed(4)}
                    </span>
                  </div>
                  <div className="h-px bg-slate-200/80" />
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <span className="font-medium text-slate-500">总债务（参考）</span>
                    <span className="font-mono text-sm font-bold text-slate-900">
                      {formatNumber(liquidateModalRow.totalDscMinted, 4)}{" "}
                      <span className="text-slate-400">DSC</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-9">
                <label
                  htmlFor="liquidate-dsc-amount"
                  className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400"
                >
                  清算数量
                </label>
                <div className="mt-3 flex w-full rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow focus-within:border-blue-400 focus-within:shadow-md focus-within:ring-2 focus-within:ring-blue-500/15">
                  <input
                    id="liquidate-dsc-amount"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="例如 5"
                    value={liquidateDscInput}
                    onChange={(e) => setLiquidateDscInput(e.target.value)}
                    className="min-w-0 flex-1 rounded-2xl bg-transparent px-5 py-4 font-mono text-base font-bold text-slate-900 outline-none placeholder:text-slate-300 sm:text-lg"
                  />
                  <span className="flex shrink-0 items-center pr-5 text-xs font-black uppercase tracking-widest text-slate-400">
                    DSC
                  </span>
                </div>
              </div>

              <div className="mt-5 min-h-[6.5rem]">
                {liquidateCollateralHint?.state === "idle" ? (
                  <div className="flex h-full min-h-[6.5rem] flex-col justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-5 sm:px-6">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      预估抵押物估值
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">
                      输入 DSC 数量后，将按合约{" "}
                      <span className="font-semibold text-slate-600">
                        10% 清算奖励
                      </span>{" "}
                      估算可获得的抵押物美元估值（1 DSC ≈ 1 USD）。
                    </p>
                  </div>
                ) : null}
                {liquidateCollateralHint?.state === "invalid" ? (
                  <div className="flex min-h-[6.5rem] flex-col justify-center rounded-3xl border border-amber-200/90 bg-amber-50/90 px-5 py-5 sm:px-6">
                    <p className="text-xs font-bold uppercase tracking-widest text-amber-800">
                      预估抵押物估值
                    </p>
                    <p className="mt-2 text-sm font-semibold text-amber-900">
                      请输入有效数字（可含小数点）。
                    </p>
                  </div>
                ) : null}
                {liquidateCollateralHint?.state === "ready" ? (
                  <div className="rounded-3xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50 to-teal-50/80 px-5 py-5 sm:px-6 sm:py-6">
                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">
                      预估抵押物估值
                    </p>
                    <p className="mt-3 text-3xl font-black tabular-nums tracking-tight text-emerald-950 sm:text-[2rem]">
                      {formatUsd(liquidateCollateralHint.collateralUsdEstimate)}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-emerald-900/85">
                      基于覆盖{" "}
                      <span className="font-mono font-bold text-emerald-950">
                        {formatNumber(liquidateCollateralHint.dscEffective, 4)}
                      </span>{" "}
                      DSC（1 DSC≈$1）并含{" "}
                      <span className="font-semibold">10%</span> 奖励。
                    </p>
                    {liquidateCollateralHint.clampedToDebt ? (
                      <p className="mt-3 rounded-xl bg-emerald-100/80 px-3 py-2 text-xs font-semibold text-emerald-900">
                        输入超过该仓位总债务，已按总债务封顶估算。
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <p className="mt-6 text-xs leading-relaxed text-slate-400">
                单一代币路径与预言机舍入可能与链上略有差异，以实际成交为准。
              </p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:gap-4">
                <button
                  type="button"
                  onClick={closeLiquidateModal}
                  className="w-full rounded-2xl border border-slate-200 py-3.5 text-xs font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-50 sm:flex-1"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={
                    !!liquidateModalRow.isDevFixture || tab === "WBTC"
                  }
                  title={
                    liquidateModalRow.isDevFixture
                      ? "演示行无法发清算交易"
                      : tab === "WBTC"
                        ? "请先切换到 WETH 再清算"
                        : "发起清算"
                  }
                  className="w-full rounded-2xl bg-slate-900 py-3.5 text-xs font-black uppercase tracking-widest text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-1"
                  onClick={() => {
                    if (
                      !liquidateModalRow ||
                      liquidateModalRow.isDevFixture ||
                      tab === "WBTC"
                    )
                      return;
                    const raw = liquidateDscInput.trim().replace(/,/g, "");
                    if (
                      raw === "" ||
                      !Number.isFinite(Number(raw)) ||
                      Number(raw) <= 0
                    ) {
                      alert("请输入有效的 DSC 数量");
                      return;
                    }
                    void liquidate(liquidateModalRow.address, raw);
                  }}
                >
                  确认清算
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
