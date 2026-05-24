"use client";
// ↑ Next.js App Router：声明此文件里的代码在「浏览器」运行（不是只在服务器跑）。
//   来源：Next.js 框架

/**
 * =============================================================================
 * 【新手地图】这个文件在干什么？用到了哪些「库」？
 * =============================================================================
 *
 * 一句话：从 The Graph 子图拿到「有谁欠 DSC」，再用以太坊 RPC 批量查每个人
 *         的实时健康因子，筛出 HF < 1.2 的人，给页面显示。
 *
 * -----------------------------------------------------------------------------
 * 库 / 技术           | 它是啥？                    | 本文件里用到了什么
 * -----------------------------------------------------------------------------
 * Next.js            | React 网站框架              | 第一行的 "use client"
 * TypeScript         | 带类型的 JavaScript         | type、: Promise<...> 等
 * @tanstack/react-query | 管理「异步数据」的 React 库 | useQuery（自动加载、缓存、定时刷新）
 * wagmi              | 连钱包 + 读链的 React 库    | getPublicClient（拿到读链客户端）
 * viem               | 底层以太坊工具库（wagmi 依赖它）| getAddress、parseEther、类型 Abi/Address
 *                    |                             | publicClient.multicall（批量读合约）
 * 浏览器内置 fetch   | 发 HTTP 请求（不是 npm 包）  | fetch(子图URL, { method POST ... })
 * The Graph          | 索引链上事件的服务           | 我们只通过 HTTP 把 GraphQL 字符串 POST 过去
 * 项目自己的 constants | 合约地址、ABI 放在 index.js | DSCEngineAddress、DSCEngineAbi、WETH/WBTC 地址
 * RainbowKit 配置    | 钱包与 RPC 网络配置         | import config from @/rainbowkit
 *
 * 注意：本文件没有直接用「React 的 useState」，数据状态交给 useQuery 管。
 * =============================================================================
 */

/**
 * 待清算风险列表（演示阈值 HF < 1.2）：
 * - The Graph：枚举有过 DSC 债务的用户 id
 * - 链上 multicall：拉实时 getHealthFactor / getAccountInformation
 *
 * 注意：DSCEngine.liquidate 仍要求 HF < 1，本列表是「预警」，不等于链上可清算。
 */

// ---------- TanStack React Query：负责「请求数据、加载中、报错、重新拉取」----------
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

// ---------- wagmi：从全局 wagmi 配置里取出「只读链上客户端」（不弹钱包签名）----------
import { getPublicClient } from "wagmi/actions";

// ---------- viem：以太坊地址校验、单位转换、类型、以及链上 multicall 的能力 ----------
import { getAddress, parseEther, type Abi, type Address } from "viem";

// ---------- 项目内：RainbowKit 生成的 wagmi config（里面写了 Sepolia + Alchemy RPC）----------
import config from "@/rainbowkit";

// ---------- 项目内：合约地址和 ABI（普通 JS 导出）----------
import {
  DSCEngineAbi,
  DSCEngineAddress,
  SepoliaWbtcAddress,
  SepoliaWethAddress,
} from "@/constants";

/** 排入列表的健康因子上限（不含）：HF < 1.2；parseEther 来自 viem，把 "1.2" 转成链上用的 wei（1e18 精度） */
const LIST_HF_THRESHOLD_WEI = parseEther("1.2");

/**
 * 子图 HTTP 地址：来自 Next.js 注入的环境变量（构建/启动时读 .env.local）。
 * process.env 是 Node/Next 侧约定；NEXT_PUBLIC_ 前缀会让变量在浏览器里也可用。
 */
const SUBGRAPH_URL =
  typeof process.env.NEXT_PUBLIC_SUBGRAPH_URL === "string"
    ? process.env.NEXT_PUBLIC_SUBGRAPH_URL.trim()
    : "";

/** 把 JS 里的 ABI 数组断言成 viem 认识的 Abi 类型，避免 TypeScript 报错 */
const engineAbi = DSCEngineAbi as Abi;

/** 读合约时反复用到的「合约地址 + abi」打包成一个对象，方便拼 multicall */
const DSCEngine = {
  address: DSCEngineAddress as Address,
  abi: engineAbi,
};

/**
 * GraphQL：The Graph 子图提供的查询语言（不是 SQL）。
 * 这段字符串会原样放进 fetch 的 body 里发给子图服务器。
 * 实体 users / collateralBalances 来自子图 schema（另一个仓库里的 schema.graphql）。
 */
const USERS_QUERY = `
  query UsersWithDebt($first: Int!, $skip: Int!) {
    users(
      first: $first
      skip: $skip
      where: { totalDscMinted_gt: "0" }
      orderBy: totalDscMinted
      orderDirection: desc
    ) {
      id
      totalDscMinted
      collateralBalances {
        token
        amount
      }
    }
  }
`;

/** TypeScript：描述子图返回的一行抵押记录长什么样（仅用于类型检查，运行时不存在） */
type SubgraphCollateralBalance = { token: string; amount: string };
type SubgraphUser = {
  id: string;
  totalDscMinted: string;
  collateralBalances: SubgraphCollateralBalance[];
};

/** 纯函数 + 原生 JS：把链上代币地址转成人类可读标签（不依赖任何库） */
function tokenLabel(token: string): string {
  const t = token.toLowerCase();
  if (t === SepoliaWethAddress.toLowerCase()) return "WETH";
  if (t === SepoliaWbtcAddress.toLowerCase()) return "WBTC";
  return "Token";
}

/** 数组方法 filter/map：ES 标准；BigInt：JS 内置大整数（处理链上 uint256） */
function collateralLabelFromSubgraph(
  balances: SubgraphCollateralBalance[],
): string {
  if (!balances?.length) return "—";
  const labels = balances
    .filter((b) => BigInt(b.amount) > BigInt(0))
    .map((b) => tokenLabel(b.token));
  if (!labels.length) return "—";
  return [...new Set(labels)].sort().join(" + ");
}

/**
 * 浏览器 Web API：fetch
 * 向 The Graph 的 HTTP 端点 POST GraphQL，分页拉齐所有「有债用户」。
 */
async function fetchAllUsersWithDebt(): Promise<SubgraphUser[]> {
  const pageSize = 200;
  let skip = 0;
  const all: SubgraphUser[] = [];
  const maxPages = 30;

  for (let page = 0; page < maxPages; page++) {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: USERS_QUERY,
        variables: { first: pageSize, skip },
      }),
    });
    if (!res.ok) throw new Error(`子图请求失败: HTTP ${res.status}`);
    const json: {
      data?: { users: SubgraphUser[] };
      errors?: { message: string }[];
    } = await res.json();
    if (json.errors?.length) {
      throw new Error(json.errors[0]?.message ?? "子图返回错误");
    }
    const batch = json.data?.users ?? [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    skip += pageSize;
  }
  return all;
}

/** 每批用 multicall 打包多少个用户（每人 2 个调用），太大会触发 RPC 限制 */
const USERS_PER_CHUNK = 40;

/** 导出类型：给 page.tsx 用，表示「一条预警仓位」的数据形状 */
export type AtRiskPosition = {
  address: Address;
  addressShort: string;
  healthFactor: number;
  totalDscMinted: number;
  debtWei: bigint;
  collateralUsd: number;
  collateralLabel: string;
  /** 为 true 时表示本行 HF/债务等为前端演示注入，与链上读数无关；liquidate 仍会按链上真实 HF 判断 */
  isDevFixture?: boolean;
};

/**
 * 核心异步逻辑（被 useQuery 调用）：
 * 1) fetchAllUsersWithDebt → The Graph
 * 2) getPublicClient(config) → wagmi，拿到 viem 的 PublicClient
 * 3) publicClient.multicall → viem，一次 RPC 读多个合约函数
 */
async function loadAtRiskPositions(): Promise<AtRiskPosition[]> {
  const users = await fetchAllUsersWithDebt();
  if (!users.length) return [];

  // wagmi：根据 rainbowkit.ts 里的 config，创建「读 Sepolia」的客户端（viem PublicClient）
  const publicClient = getPublicClient(config);
  const rows: AtRiskPosition[] = [];

  for (let i = 0; i < users.length; i += USERS_PER_CHUNK) {
    const slice = users.slice(i, i + USERS_PER_CHUNK);

    // flatMap：ES 数组方法；把每个用户展开成 2 条「待调用合约描述」
    const contracts = slice.flatMap((u) => {
      // viem：校验并规范化地址格式（checksum）
      const addr = getAddress(u.id) as Address;
      return [
        {
          address: DSCEngine.address,
          abi: DSCEngine.abi,
          functionName: "getHealthFactor",
          args: [addr],
        },
        {
          address: DSCEngine.address,
          abi: DSCEngine.abi,
          functionName: "getAccountInformation",
          args: [addr],
        },
      ];
    });

    // viem（通过 PublicClient）：multicall 一次发多条 eth_call，比逐个 await 快很多
    const results = await publicClient.multicall({
      contracts,
      allowFailure: true, // 某一条失败不拖垮整批
    });

    for (let j = 0; j < slice.length; j++) {
      const u = slice[j];
      const hfRes = results[j * 2];
      const accRes = results[j * 2 + 1];
      if (hfRes.status !== "success" || accRes.status !== "success") continue;

      const hf = hfRes.result as bigint;
      const acc = accRes.result as readonly [bigint, bigint];
      const debt = acc[0];
      if (debt === BigInt(0)) continue;
      if (hf >= LIST_HF_THRESHOLD_WEI) continue;

      const addr = getAddress(u.id) as Address;
      rows.push({
        address: addr,
        addressShort: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
        healthFactor: Number(hf) / 1e18,
        totalDscMinted: Number(debt) / 1e18,
        debtWei: debt,
        collateralUsd: Number(acc[1]) / 1e18,
        collateralLabel: collateralLabelFromSubgraph(u.collateralBalances),
      });
    }
  }

  rows.sort((a, b) => a.healthFactor - b.healthFactor);
  return rows;
}

/**
 * 开发用：在列表最前插入一条 HF&lt;1 的「演示行」，方便接清算按钮 / writeContract / 错误提示。
 * 行里的 HF、债务、抵押估值是**写死的假数**；链上 liquidate 是否成功只取决于该地址在 DSCEngine
 * 里是否**真的** HF&lt;1（多数情况下会 revert，直到你换成真实 underwater 地址或用 Anvil 造仓）。
 *
 * .env.local 示例：
 *   NEXT_PUBLIC_DEV_UNDERWATER_FIXTURE=1
 *   NEXT_PUBLIC_DEV_UNDERWATER_ADDR=0x你的校验和地址
 */
function mergeDevUnderwaterFixture(rows: AtRiskPosition[]): AtRiskPosition[] {
  const on =
    typeof process.env.NEXT_PUBLIC_DEV_UNDERWATER_FIXTURE === "string" &&
    process.env.NEXT_PUBLIC_DEV_UNDERWATER_FIXTURE.trim() === "1";
  if (!on) return rows;

  const raw = process.env.NEXT_PUBLIC_DEV_UNDERWATER_ADDR?.trim();
  if (!raw?.startsWith("0x")) return rows;

  try {
    const address = getAddress(raw as Address);
    const debtWei = parseEther("10");
    const fixture: AtRiskPosition = {
      address,
      addressShort: `${address.slice(0, 6)}…${address.slice(-4)}`,
      healthFactor: 0.92,
      totalDscMinted: Number(debtWei) / 1e18,
      debtWei,
      collateralUsd: 15,
      collateralLabel: "DEV 演示（假 HF）",
      isDevFixture: true,
    };
    const rest = rows.filter(
      (r) => r.address.toLowerCase() !== address.toLowerCase(),
    );
    return [fixture, ...rest];
  } catch {
    return rows;
  }
}

/**
 * React 自定义 Hook（约定以 use 开头）：给组件用。
 * 内部 useQuery 来自 @tanstack/react-query，不是 React 自带的。
 */
export function useLiquidatableQueue() {
  const enabled = SUBGRAPH_URL.length > 0;

  const query = useQuery({
    // 缓存键：URL 或阈值变了会重新请求
    queryKey: ["at-risk-queue", SUBGRAPH_URL, LIST_HF_THRESHOLD_WEI.toString()],
    // 真正干活的异步函数（上面定义的 loadAtRiskPositions）
    queryFn: loadAtRiskPositions,
    // 没配子图 URL 时不要去请求（避免无意义报错）
    enabled,
    staleTime: 0,
    // 每隔 15 秒自动再拉一次（React Query 功能）
    refetchInterval: enabled ? 15_000 : false,
    // 切回浏览器标签页时再拉一次
    refetchOnWindowFocus: true,
  });

  const positions = useMemo(
    () => mergeDevUnderwaterFixture(query.data ?? []),
    [query.data],
  );

  // 把 query 对象「整理成」页面更好用的几个字段
  return {
    positions,
    isLoading: query.isPending,
    isRefetching: query.isFetching && !query.isPending,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    subgraphConfigured: enabled,
    listHfThreshold: 1.2,
  };
}
