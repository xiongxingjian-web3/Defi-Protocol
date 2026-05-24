// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test, console} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {DeployDSC} from "../../script/DeployDSC.s.sol";
import {DSCEngine} from "../../src/DSCEngine.sol";
import {DecentralizedStableCoin} from "../../src/DecentralizedStableCoin.sol";
import {HelperConfig} from "../../script/HelperConfig.s.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Handler} from "./Handler.t.sol";

contract InvariantsTest is Test {
    DeployDSC deployer;
    Handler handler;
    DSCEngine dsce;
    DecentralizedStableCoin dsc;
    HelperConfig config;
    address weth;
    address wbtc;

    function setUp() public {
        deployer = new DeployDSC();
        (dsc, dsce, config) = deployer.run();
        (,, weth, wbtc,) = config.activeNetworkConfig();
        handler = new Handler(dsce, dsc);
        targetContract(address(handler));
    }

    function invariant_protocolMustHaveMoreValueThanTotalSupply() public view {
        uint256 totalSupply = dsc.totalSupply();
        uint256 wethBalance = IERC20(weth).balanceOf(address(dsc));
        uint256 wbtcBalance = IERC20(wbtc).balanceOf(address(dsc));
        uint256 wethValue = dsce.getUsdValue(weth, wethBalance);
        uint256 wbtcValue = dsce.getUsdValue(wbtc, wbtcBalance);
        console.log("totalSupply", totalSupply);
        console.log("wethValue", wethValue);
        console.log("wbtcValue", wbtcValue);
        assert(totalSupply >= wethValue + wbtcValue);
    }
}
