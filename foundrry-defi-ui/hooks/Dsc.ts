"use client";
import {
  useReadContracts,
  useAccount,
  useWriteContract,
  useReadContract,
} from "wagmi";
import { getPublicClient } from "wagmi/actions";
import { erc20Abi, formatEther, getAddress, parseEther, type Address } from "viem";
import {
  DSCEngineAddress,
  DSCEngineAbi,
  DSCAddress,
} from "../constants";
import config from "../rainbowkit";

export function useDSC(activeTab?: string) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const DSCEngineContract = {
    address: DSCEngineAddress as `0x${string}`,
    abi: DSCEngineAbi,
  } as const;

  
  const result = useReadContracts({
    contracts: [
      {
        ...DSCEngineContract,
        functionName: "getAccountInformation",
        args: [address],
      },
      {
        ...DSCEngineContract,
        functionName: "getHealthFactor",
        args: [address],
      },
      {
        ...DSCEngineContract,
        functionName: "getCollateralTokens",
      },
      {
        ...DSCEngineContract,
        functionName: "getDsc",
      },
      {
        ...DSCEngineContract,
        functionName: "s_DSCMinted",
        args: [address],
      },
      {
        address: DSCAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "totalSupply",
      },
      {
        ...DSCEngineContract,
        functionName: "totalCollateralValue",
      }
    ],
  });
// 获取DSC总供应量
const totalSupply = result.data?.[5]?.result as bigint | undefined;
const totalDscNumber = totalSupply ? parseFloat(formatEther(totalSupply)) : 0;
// 获取总抵押价值
const totalCollateralValue = result.data?.[6]?.result as bigint | undefined;
const totalCollateralValueInUsd = totalCollateralValue ? parseFloat(formatEther(totalCollateralValue)) : 0;
  const collateralTokens = result.data?.[2]?.result as string[];
  /** 引擎实际绑定的 DSC（铸造/销毁都走这里；与 constants 不一致时以前者为准） */
  const dscFromEngine = result.data?.[3]?.result as `0x${string}` | undefined;
  const effectiveDscAddress = (() => {
    try {
      if (dscFromEngine) return getAddress(dscFromEngine);
      return getAddress(DSCAddress as `0x${string}`);
    } catch {
      return DSCAddress as `0x${string}`;
    }
  })();
  const dscAddressMismatch =
    !!dscFromEngine &&
    getAddress(dscFromEngine).toLowerCase() !==
      getAddress(DSCAddress as `0x${string}`).toLowerCase();
  const accountInfo = result.data?.[0]?.result as [bigint, bigint] | undefined;
  const totalDscMinted = accountInfo?.[0] ? Number(accountInfo[0]) / 1e18 : 0;
  const collateralValueInUsd = accountInfo?.[1]
    ? Number(accountInfo[1]) / 1e18
    : 0;
  const maxDscMintable = collateralValueInUsd * 0.5;
  const remainingDscMintable = Math.max(0, maxDscMintable - totalDscMinted);
  const rawHealthFactor = result.data?.[1]?.result as bigint | undefined;
  const healthFactor = rawHealthFactor ? Number(rawHealthFactor) / 1e18 : 0;
  // 公共辅助函数：根据 tab 获取对应的代币地址
  const getTokenAddress = (tab: string) => {
    return tab === "WETH" ? collateralTokens?.[0] : collateralTokens?.[1];
  };

  // 获取当前选定代币的钱包余额 (顶层调用)
  const currentTokenAddress = activeTab
    ? getTokenAddress(activeTab)
    : undefined;
  const balanceResult = useReadContract({
    address: currentTokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
    query: {
      enabled: !!address && !!currentTokenAddress,
    },
  });

  // 格式化钱包余额（WETH/WBTC）
  const walletBalance = balanceResult.data
    ? Number(balanceResult.data as bigint) / 1e18
    : 0;

  // 钱包内 DSC：必须用引擎 getDsc() 的地址，否则 constants 过期时余额不随铸造变化
  const dscBalanceResult = useReadContract({
    address: effectiveDscAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  });
  const dscWalletWei = dscBalanceResult.data
    ? (dscBalanceResult.data as bigint)
    : BigInt(0);
  const dscWalletBalance =
    dscWalletWei > BigInt(0) ? Number(formatEther(dscWalletWei)) : 0;

  //抵押
  const deposit = async (tab: string, amount: number) => {
    const tokenAddress = getTokenAddress(tab);
    if (!tokenAddress) {
      console.error("未找到代币地址");
      return;
    }

    const weiAmount = parseEther(amount.toString());
    const publicClient = getPublicClient(config);

    try {
      // 授权
      const approveHash = await writeContractAsync({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "approve",
        args: [DSCEngineContract.address, weiAmount],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      // 存款
      const depositHash = await writeContractAsync({
        ...DSCEngineContract,
        functionName: "depositCollateral",
        args: [tokenAddress, weiAmount],
        gas: BigInt(300000),
      });
      await publicClient.waitForTransactionReceipt({ hash: depositHash });

      // 刷新数据
      await Promise.all([
        result.refetch(),
        balanceResult.refetch(),
        dscBalanceResult.refetch(),
      ]);
      console.log("存款成功，数据已更新");
    } catch (err) {
      console.error("存款失败:", err);
      // 可选：显示用户提示
    }
  };
  // ：赎回
  const withdraw = async (tab: string, amount: number) => {
    const tokenAddress = getTokenAddress(tab);
    const weiAmount = parseEther(amount.toString());
    const publicClient = getPublicClient(config);
    try {
      const redeemHash = await writeContractAsync({
        ...DSCEngineContract,
        functionName: "redeemCollateral",
        args: [tokenAddress, weiAmount],
        gas: BigInt(300000),
      });

      await publicClient.waitForTransactionReceipt({ hash: redeemHash });
      // 刷新数据
      await Promise.all([
        result.refetch(),
        balanceResult.refetch(),
        dscBalanceResult.refetch(),
      ]);
      console.log("赎回成功，数据已更新");
    } catch (err) {
      console.error("赎回失败:", err);
      // 可选：显示用户提示
    }
  };
  // :铸造 DSC
  const mintDsc = async (amount: number) => {
    const weiAmount = parseEther(amount.toString());
    const publicClient = getPublicClient(config);
    try {
      const mintHash = await writeContractAsync({
        ...DSCEngineContract,
        functionName: "mintDsc",
        args: [weiAmount],
        gas: BigInt(300000),
      });
      await publicClient.waitForTransactionReceipt({ hash: mintHash });
      // 刷新数据
      await Promise.all([
        result.refetch(),
        balanceResult.refetch(),
        dscBalanceResult.refetch()
      ]);
      console.log("Mint成功，数据已更新");
    } catch (err) {
      console.error("Mint失败:", err);
      alert(
        "铸造失败（链上已回滚，不会扣额度也不会增发 DSC）。请查看控制台或区块浏览器中的交易回执。",
      );
    }
  };
  // :销毁 DSC
  const burnDsc = async (amount: number) => {
    const weiAmount = parseEther(amount.toString());
    const publicClient = getPublicClient(config);
    try {
      // 授权
      const approveHash = await writeContractAsync({
        address: effectiveDscAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [DSCEngineAddress, weiAmount],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      const burnHash = await writeContractAsync({
        ...DSCEngineContract,
        functionName: "burnDsc",
        args: [weiAmount],
        gas: BigInt(300000),
      });
      await publicClient.waitForTransactionReceipt({ hash: burnHash });
      // 刷新数据
      await Promise.all([
        result.refetch(),
        balanceResult.refetch(),
        dscBalanceResult.refetch()
      ]);
      console.log("销毁成功，数据已更新");
    } catch (err) {
      console.error("销毁失败:", err);
      // 可选：显示用户提示
    }
  };
  /**
   * 清算被清算用户仓位。
   * @param userToLiquidate 完整链上地址：来自列表行的 `AtRiskPosition.address`（子图 `users.id` → viem `getAddress`），不要用 `addressShort`（那只是 `0xabc…1234` 展示串）。
   * @param debtToCoverDscHuman 要代为偿还的 DSC 人类可读字符串（如 "5"），发交易时用 `parseEther` 转成 wei。
   */
  const liquidate = async (
    userToLiquidate: Address,
    debtToCoverDscHuman: string,
  ) => {
    const publicClient = getPublicClient(config);
    const user = getAddress(userToLiquidate);
    const debtWei = parseEther(debtToCoverDscHuman.trim() || "0");
    /** 从引擎取到的抵押品地址；须是被清算用户实际存入的代币，否则 _redeemCollateral 会失败 */
    const tokenAddress = getTokenAddress(activeTab as string);
    if (!tokenAddress) {
      console.error("清算失败: 未解析到抵押代币地址（检查 activeTab / getCollateralTokens）");
      return;
    }
    try {
      const hfWei = (await publicClient.readContract({
        ...DSCEngineContract,
        functionName: "getHealthFactor",
        args: [user],
      })) as bigint;
      const hfOne = parseEther("1");
      if (hfWei >= hfOne) {
        console.error(
          "清算已中止: 该地址链上健康因子仍 ≥ 1，合约 require 会失败。开发演示行里的 HF 仅为 UI，无法改变此读数。",
          { user, hfWei: hfWei.toString() },
        );
        return;
      }

      const approveHash = await writeContractAsync({
        address: effectiveDscAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [DSCEngineAddress, debtWei],
      });
      const approveReceipt = await publicClient.waitForTransactionReceipt({
        hash: approveHash,
      });
      if (approveReceipt.status !== "success") {
        console.error("清算失败: DSC 授权交易回滚", approveReceipt.status);
        return;
      }

      const liquidateHash = await writeContractAsync({
        ...DSCEngineContract,
        functionName: "liquidate",
        args: [tokenAddress, user, debtWei],
        gas: BigInt(300000),
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: liquidateHash,
      });
      if (receipt.status !== "success") {
        console.error("清算失败: 交易已在链上回滚 (receipt.status)", receipt.status);
        return;
      }
      await Promise.all([
        result.refetch(),
        balanceResult.refetch(),
        dscBalanceResult.refetch(),
      ]);
      console.log("清算成功，数据已更新");
    } catch (err) {
      console.error("清算失败:", err);
    }
  };
  return {
    DSCEngineAddress,
    totalDscMinted,
    collateralValueInUsd,
    isLoading: result.isLoading,
    isError: result.isError,
    refetch: result.refetch,
    healthFactor,
    deposit,
    withdraw,
    walletBalance,
    isBalanceLoading: balanceResult.isLoading,
    mintDsc,
    remainingDscMintable,
    burnDsc,
    dscWalletBalance,
    isDscBalanceLoading: dscBalanceResult.isLoading,
    DSCAddress,
    effectiveDscAddress,
    dscAddressMismatch,
    totalDscNumber,
    totalCollateralValueInUsd,
    liquidate
  };
}
