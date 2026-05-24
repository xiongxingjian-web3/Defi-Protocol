# Foundry DeFi Stablecoin（智能合约）

基于 **Foundry** 的超额抵押稳定币协议：用户存入允许的 ERC20 抵押品，通过 **Chainlink 预言机** 计价，铸造与销毁 **DSC**；健康因子不足时可被清算。本项目为学习与演示用途。

## 技术栈

- **Solidity** `^0.8.19`
- **Foundry**（`forge`、`cast`、`anvil`）
- **OpenZeppelin**：`ReentrancyGuard`、`IERC20`、测试用 `ERC20Mock` 等
- **Chainlink**：`AggregatorV3Interface` 喂价；自定义 `OracleLib` 做陈旧价格检查

## 目录结构

```
foundry-defi-stablecoin/
├── foundry.toml           # src、remappings、invariant 等配置
├── src/
│   ├── DecentralizedStableCoin.sol   # DSC：ERC20，mint/burn 仅 owner（引擎）
│   ├── DSCEngine.sol                 # 抵押、铸销、清算、健康因子与视图函数
│   └── libraries/
│       └── OracleLib.sol             # latestRoundData + 超时回滚防陈旧价
├── script/
│   ├── DeployDSC.s.sol    # 部署 DSC → 引擎 → transferOwnership(引擎)
│   └── HelperConfig.s.sol # Anvil 部署 Mock；Sepolia 读环境变量与官方喂价/代币地址
├── test/
│   ├── unit/DSCEngineTest.t.sol
│   ├── fuzz/Handler.t.sol、Invariants.t.sol、OpenInvariantsTest.t.sol
│   └── mocks/MockV3Aggregator.sol
├── broadcast/               # 部署广播记录（如 Sepolia）
└── defi-stablecoin-studio/ # 可选：TypeScript 侧 ABI/网络辅助（见该子目录 package.json）
```

## 核心合约说明

### `DecentralizedStableCoin`

- 继承 `ERC20Burnable`、`Ownable`。
- `mint(address, uint256)`、`burn(uint256)`：**仅 `onlyOwner`**。部署脚本将 Owner 转给 `DSCEngine`，由引擎统一铸销。
- 名称符号：`DecentralizedStableCoin` / `DSC`。

### `DSCEngine`

- **抵押**：`depositCollateral`（需用户事先对引擎 `approve`）；可组合 `depostitCollateralAndMintDsc`（函数名拼写与链上 ABI 一致，前端需对应）。
- **铸/销 DSC**：`mintDsc`、`burnDsc`；组合 `redeemCollateralForDsc` 等。
- **清算**：`liquidate(token, user, debtToCover)`，要求被清算用户健康因子 **小于** `1e18`（即小于 1）。
- **健康因子**：与 `LIQUIDATION_THRESHOLD`（如 50 表示 50% 有效抵押折算）、`PRECISION` 相关；无债务时返回极大值。
- **预言机**：`getUsdValue` 等通过 `OracleLib.staleCheckLatestRoundData` 读价（具体路径以源码为准）；注意与 `getTokenAmountFromUsd` 等路径保持审计一致性。
- **安全**：关键路径使用 `nonReentrant`；抵押记账与外部 `transferFrom`/`transfer` 顺序需结合测试理解。

### `OracleLib`

- 封装 `latestRoundData`，若 `block.timestamp - updatedAt` 超过 `TIMEOUT`（默认 3 小时）则 `revert`，避免使用过时价格。

## 部署

### 依赖安装

```bash
cd foundry-defi-stablecoin
forge install   # 若尚未安装 lib 依赖
```

### Anvil（本地链 ID `31337`）

`HelperConfig` 会在本地创建 **Mock** 价格聚合器与 **ERC20Mock** 作为 WETH/WBTC 占位，无需 `.env`。

```bash
anvil
# 另开终端
forge script script/DeployDSC.s.sol:DeployDSC --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

（私钥仅用于本地默认 Anvil 账户，**切勿用于主网**。）

### Sepolia

1. 准备 `.env`（勿提交），例如：

   ```env
   PRIVATE_KEY=<你的测试网钱包私钥 uint256>
   ```

2. 执行部署：

   ```bash
   forge script script/DeployDSC.s.sol:DeployDSC --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
   ```

3. `HelperConfig.getSepoliaEthConfig` 中写入了 Sepolia 上 **WETH/WBTC 代币** 与 **Chainlink ETH/USD、BTC/USD 喂价** 的公开地址；部署完成后将 **`DSCEngine`** 与 **`DecentralizedStableCoin`** 地址同步到前端 `foundrry-defi-ui/constants/index.js`。

## 测试

```bash
forge test              # 全部测试
forge test -vv          # 更详细日志
forge test --match-path test/fuzz   # 仅 fuzz 相关（示例）
```

`foundry.toml` 中配置了 **invariant** 运行参数（如 `runs`、`depth`）。`test/fuzz/Invariants.t.sol` 等文件维护协议级不变量与 Handler 随机操作。

## Remappings

见 `foundry.toml`：

- `@openzeppelin/contracts` → `lib/openzeppelin-contracts/contracts`
- `@chainlink/contracts` → `lib/chainlink-brownie-contracts/contracts`

## 与前端的关系

前端仓库 **`foundrry-defi-ui`** 通过 `constants` 中的地址与 ABI 调用本仓库部署的合约；重新部署或升级合约后需更新前端常量并重新验证用户流程。

## 免责声明

**未经专业审计，不得用于托管真实资金**。主网部署前需完整安全审查与参数治理设计。
