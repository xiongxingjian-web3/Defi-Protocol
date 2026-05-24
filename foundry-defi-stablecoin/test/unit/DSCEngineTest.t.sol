// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {DSCEngine} from "../../src/DSCEngine.sol";
import {DecentralizedStableCoin} from "../../src/DecentralizedStableCoin.sol";
import {DeployDSC} from "../../script/DeployDSC.s.sol";
import {HelperConfig} from "../../script/HelperConfig.s.sol";
import {Test} from "forge-std/Test.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

contract DSCEngineTest is Test {
    DSCEngine public engine;
    DecentralizedStableCoin public dsc;
    DeployDSC public deployer;
    HelperConfig public config;
    address[] public tokenAddresses;
    address[] public priceFeedAddresses;
    address public user = makeAddr("user");
    uint256 public constant AMOUNT_COLLATERAL = 10 ether;
    uint256 public constant STARTING_ERC20_BALANCE = 10 ether;

    function setUp() public {
        deployer = new DeployDSC();
        (dsc, engine, config) = deployer.run();
        (address wethUsdPriceFeed, address wbtcUsdPriceFeed, address weth, address wbtc,) = config.activeNetworkConfig();
        tokenAddresses = [weth, wbtc];
        priceFeedAddresses = [wethUsdPriceFeed, wbtcUsdPriceFeed];
        ERC20Mock(tokenAddresses[0]).mint(user, STARTING_ERC20_BALANCE);
        ERC20Mock(tokenAddresses[1]).mint(user, STARTING_ERC20_BALANCE);
    }

    function testGetUsdValue() public {
        uint256 wethAmount = 15e18;
        uint256 expectedUsd = 30000e18;
        uint256 usdValue = engine.getUsdValue(tokenAddresses[0], wethAmount);
        assertEq(usdValue, expectedUsd);
    }

    function testRevertsIfCollateralZero() public {
        vm.prank(user);
        ERC20Mock(tokenAddresses[0]).approve(address(engine), AMOUNT_COLLATERAL);
        vm.expectRevert(DSCEngine.DSCEngine_NeedsMoreThanZeroAmount.selector);
        engine.depositCollateral(tokenAddresses[0], 0);
    }

    function testRevertsIfTokenLengthDoesntMatchPriceFeeds() public {
        address[] memory tokens = new address[](2);
        address[] memory priceFeeds = new address[](1);
        vm.expectRevert(DSCEngine.DSCEngine_TokenAddressesAndPriceFeedAddressesMustMatchSameLength.selector);
        new DSCEngine(tokens, priceFeeds, address(dsc));
    }

    function testGetTokenAmountFromUsd() public {
        uint256 debtToCover = 100e18;
        uint256 tokenAmount = engine.getTokenAmountFromUsd(tokenAddresses[0], debtToCover);
        assertEq(tokenAmount, 5e16);
    }

    function testRevertsWithUnapprovedCollateral() public {
        ERC20Mock ranToken = new ERC20Mock();
        ranToken.mint(user, AMOUNT_COLLATERAL);
        // ranToken.approve(address(engine), AMOUNT_COLLATERAL);
        vm.expectRevert(DSCEngine.DSCEngine_NotAllowedToken.selector);
        engine.depositCollateral(address(ranToken), AMOUNT_COLLATERAL);
    }

    modifier depositedCollateral() {
        vm.startPrank(user);
        ERC20Mock(tokenAddresses[0]).approve(address(engine), AMOUNT_COLLATERAL);
        engine.depositCollateral(tokenAddresses[0], AMOUNT_COLLATERAL);
        vm.stopPrank();
        _;
    }

    function testCanDepositCollateralAndGetAccountInfo() public depositedCollateral {
        (uint256 totalDscMinted, uint256 collateralValueInUsd) = engine.getAccountInformation(user);

        uint256 collateralValue = engine.getAccountCollateralValue(user);
        assertEq(totalDscMinted, 0);
        assertEq(collateralValueInUsd, collateralValue);
    }
}
