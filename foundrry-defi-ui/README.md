# Foundrry DeFi UI（前端）

Next.js 仪表板：连接钱包（RainbowKit + wagmi），与 **Sepolia** 上的 `DSCEngine` 交互，展示健康因子、抵押与 DSC 余额，并支持行情小图与「风险队列」演示。

## 技术栈

| 技术                                                  | 版本/说明                      |
| ----------------------------------------------------- | ------------------------------ |
| [Next.js](https://nextjs.org/) App Router             | `app/` 路由与布局              |
| React                                                 | 19.x                           |
| [wagmi](https://wagmi.sh/) + [viem](https://viem.sh/) | 读链、写合约、等回执           |
| [@rainbow-me/rainbowkit](https://www.rainbowkit.com/) | 钱包连接 UI                    |
| [@tanstack/react-query](https://tanstack.com/query)   | 子图 + 链上批量查询缓存与轮询  |
| Tailwind CSS v4                                       | 样式（`@tailwindcss/postcss`） |

## 目录结构

```
foundrry-defi-ui/
├── app/
│   ├── layout.tsx              # 根布局、字体、Provider
│   ├── page.tsx                # 主页面（连接钱包、存取抵押、铸/销 DSC、清算 UI 等）
│   ├── Provider.tsx            # WagmiProvider + QueryClient + RainbowKitProvider
│   ├── globals.css
│   ├── miniAssetChartData.ts   # 迷你图数据加工
│   └── api/market-chart/route.ts   # 服务端代理 CoinGecko 行情（降采样）
├── hooks/
│   ├── Dsc.ts                  # useDSC：批量读引擎、存/取/铸/销/清算写交易
│   ├── useLiquidatableQueue.ts # 子图 + multicall 风险列表（HF 演示阈值）
│   └── useMiniAssetPriceHistory.ts  # 拉取 ETH/BTC 价格序列
├── constants/index.js          # DSCEngine 地址、ABI、DSC 与 Sepolia 代币地址
├── rainbowkit.ts               # wagmi 链（Sepolia）、RPC transport
├── next.config.ts
└── package.json
```

## 环境变量

在项目根目录创建 `.env.local`（勿提交密钥到 Git）：

| 变量                       | 说明                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUBGRAPH_URL` | The Graph 子图 HTTP 端点；`useLiquidatableQueue` 用于拉取有过 DSC 债务的用户，再结合链上 `getHealthFactor` 筛选展示。未配置时相关功能不可用或降级。 |
| `COINGECKO_API_KEY`        | 可选；存在时请求 CoinGecko 会带上 Demo API Key 头，减轻限流。                                                                                       |

## 配置说明

### 合约与 RPC

- **链**：`rainbowkit.ts` 中当前仅启用 **Sepolia**。
- **RPC**：在 `rainbowkit.ts` 的 `transports` 中配置（如 Alchemy）。生产环境请使用自有密钥并限制域名，勿将敏感 URL 长期硬编码在公开仓库。
- **合约地址**：`constants/index.js` 中的 `DSCEngineAddress`、`DSCAddress`、`SepoliaWethAddress`、`SepoliaWbtcAddress` 须与链上部署一致。`useDSC` 会通过 `getDsc()` 以链上引擎绑定地址为准读 DSC 余额；若与 `constants` 不一致会标记 `dscAddressMismatch`，便于发现配置过期。

### ABI

- `DSCEngineAbi`、`DSCAbi` 与链上接口需保持同步（重新部署或改合约后应更新）。

## 本地运行

```bash
cd foundrry-defi-ui
npm install
npm run dev
```

浏览器访问终端提示的本地地址（默认 `http://localhost:3000`）。

```bash
npm run build    # 生产构建
npm run start    # 运行构建产物
npm run lint     # ESLint
```

## 功能模块（与代码对应）

| 模块           | 文件                                                                  | 行为摘要                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 账户与协议读数 | `hooks/Dsc.ts`                                                        | `useReadContracts` 批量读取 `getAccountInformation`、`getHealthFactor`、`getCollateralTokens`、`getDsc`、`totalSupply`、`totalCollateralValue` 等                        |
| 写交易         | `hooks/Dsc.ts`                                                        | 抵押前先 `approve`；`depositCollateral`、`redeemCollateral`、`mintDsc`；销 DSC 前对 DSC `approve` 引擎再 `burnDsc`；清算前校验链上 HF 小于 1，再 `approve` + `liquidate` |
| 风险列表       | `hooks/useLiquidatableQueue.ts`                                       | GraphQL 拉用户列表 + `multicall` 读健康因子；列表为 **演示阈值（如 HF 小于 1.2）**，与链上可清算条件（HF 小于 1）不同，注释中已说明                                      |
| 行情小图       | `hooks/useMiniAssetPriceHistory.ts` + `app/api/market-chart/route.ts` | 请求同源 `/api/market-chart`，服务端请求 CoinGecko `market_chart`，支持 `coin`、`days`、`maxPoints`，结果降采样以控制体积                                                |

## 与智能合约仓库的关系

链上逻辑与部署脚本位于同级目录 **`foundry-defi-stablecoin/`**。重新部署后请更新本项目的 `constants/index.js`，并在区块浏览器核对引擎与 DSC 地址。

## 许可证

以 `package.json` / 仓库根约定为准（`private: true` 为应用包元数据）。
