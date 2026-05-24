const ethers = require("ethers");

async function main() {
  // 1. 显式指定本地网络，禁用 ENS 检查
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545", {
    chainId: 31337,
    name: "anvil",
  });

  const wallet = new ethers.Wallet(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    provider,
  );

  // 2. 【关键】请确保这里的地址是你部署 MockV3Aggregator 后得到的真实地址
  const wethUsdAddress = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";
  const wbtcUsdAddress = "0x0165878A594ca255338adfa4d48449f69242Eb8F";

  const abi = [
    "function updateAnswer(int256 _answer) public",
    "function latestAnswer() public view returns (int256)",
  ];

  const wethContract = new ethers.Contract(wethUsdAddress, abi, wallet);
  const wbtcContract = new ethers.Contract(wbtcUsdAddress, abi, wallet);

  console.log("🚀 喂价机器人已启动...");
  console.log("WETH 监听地址:", wethUsdAddress);
  console.log("WBTC 监听地址:", wbtcUsdAddress);

  setInterval(async () => {
    try {
      // --- 1. 获取当前链上最新的 nonce ---
      let currentNonce = await provider.getTransactionCount(wallet.address);

      // --- 2. 更新 WETH ---
      const currentWethPrice = await wethContract.latestAnswer();
      const wethChange = BigInt(Math.floor(Math.random() * 200 - 100));
      const nextWethPrice =
        currentWethPrice + (currentWethPrice * wethChange) / 10000n;

      // 显式传入 nonce
      const txWeth = await wethContract.updateAnswer(nextWethPrice, {
        nonce: currentNonce,
      });
      await txWeth.wait();
      console.log(`📈 WETH 更新: ${ethers.formatUnits(nextWethPrice, 8)} USD`);

      // --- 3. 更新 WBTC ---
      // 序号加 1
      currentNonce++;

      const currentWbtcPrice = await wbtcContract.latestAnswer();
      const wbtcChange = BigInt(Math.floor(Math.random() * 200 - 100));
      const nextWbtcPrice =
        currentWbtcPrice + (currentWbtcPrice * wbtcChange) / 10000n;

      const txWbtc = await wbtcContract.updateAnswer(nextWbtcPrice, {
        nonce: currentNonce,
      });
      await txWbtc.wait();
      console.log(`📈 WBTC 更新: ${ethers.formatUnits(nextWbtcPrice, 8)} USD`);

      console.log(`✅ 这一轮价格同步完成 (Nonce: ${currentNonce})`);
      console.log(`------------------------------------`);
    } catch (error) {
      // 如果还是报错，打印详细信息，但不要让脚本停止
      console.error("❌ 这一轮更新出错:", error.message);
    }
  }, 12000);
}

main().catch(console.error);
