// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import {DecentralizedStableCoin} from "../src/DecentralizedStableCoin.sol";
import {DSCEngine} from "../src/DSCEngine.sol";
import {MockV3Aggregator} from "../test/mocks/MockV3Aggregator.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

contract HelperConfig is Script {
    struct NetworkConfig {
        address wethUsdtPriceFeed;
        address wbtcUsdtPriceFeed;
        address weth;
        address wbtc;
        address deployer;
    }

    uint8 public constant DECIMALS = 8;
    int256 public constant WETH_USD_PRICE = 2000e8;
    int256 public constant WBTC_USD_PRICE = 1000e8;
    uint256 public constant DEFAULT_ANVIL_PRIVATE_KEY =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    NetworkConfig public activeNetworkConfig;

    constructor() {
        if (block.chainid == 31337) {
            activeNetworkConfig = getOrCreateAnvilEthConfig();
        } else {
            activeNetworkConfig = getSepoliaEthConfig();
        }
    }

    function getSepoliaEthConfig() public returns (NetworkConfig memory) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployerAddress = vm.addr(privateKey); // 从私钥推导出地址

        return
            NetworkConfig({
                wethUsdtPriceFeed: 0x694AA1769357215DE4FAC081bf1f309aDC325306,
                wbtcUsdtPriceFeed: 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43,
                weth: 0xdd13E55209Fd76AfE204dBda4007C227904f0a81,
                wbtc: 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063,
                deployer: deployerAddress
            });
    }

    function getOrCreateAnvilEthConfig() public returns (NetworkConfig memory) {
        if (activeNetworkConfig.wethUsdtPriceFeed != address(0)) {
            return activeNetworkConfig;
        }
        vm.startBroadcast();

        // 部署 mock 合约
        MockV3Aggregator wethUsdPriceFeed = new MockV3Aggregator(
            DECIMALS,
            WETH_USD_PRICE
        );
        ERC20Mock wethMock = new ERC20Mock();

        MockV3Aggregator wbtcUsdPriceFeed = new MockV3Aggregator(
            DECIMALS,
            WBTC_USD_PRICE
        );
        ERC20Mock wbtcMock = new ERC20Mock();
        vm.stopBroadcast();
        // 从私钥推导地址（Anvil 默认第一个账户的地址）
        address anvilDeployer = vm.addr(DEFAULT_ANVIL_PRIVATE_KEY);

        activeNetworkConfig = NetworkConfig({
            wethUsdtPriceFeed: address(wethUsdPriceFeed),
            wbtcUsdtPriceFeed: address(wbtcUsdPriceFeed),
            weth: address(wethMock),
            wbtc: address(wbtcMock),
            deployer: anvilDeployer
        });
        return activeNetworkConfig;
    }
}
