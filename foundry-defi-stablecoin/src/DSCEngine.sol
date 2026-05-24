// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {DecentralizedStableCoin} from "./DecentralizedStableCoin.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {OracleLib} from "./libraries/OracleLib.sol";
/**
 * @title
 * @author
 * @notice
 * @dev
 */

contract DSCEngine is ReentrancyGuard {
    /* 错误类型定义：当操作不符合规则时抛出，前端可以捕获这些错误名来给用户提示 */
    error DSCEngine_NeedsMoreThanZeroAmount();
    error DSCEngine_TokenAddressesAndPriceFeedAddressesMustMatchSameLength();
    error DSCEngine_NotAllowedToken();
    error DSCEngine_TransferFromFailed();
    error DSCEngine_BreakHealthFactor(uint256 healthFactor);
    error DSCEngine_MintFailed();
    error DSCEngine_HealthFactorOk();

    using OracleLib for AggregatorV3Interface;

    /* 常量定义：这些是协议的数学基础，通常用于处理以太坊中的高精度小数（18位） */
    uint256 private constant ADDITIONAL_FEEDCISION = 1e10;
    uint256 private constant PRECISION = 1e18;
    uint256 private constant LIQUIDATION_THRESHOLD = 50; // 50% 的抵押率阈值
    uint256 private constant LIQUIDATION_PRECISION = 100;
    uint256 private constant LIQUIDATION_BONUS = 10; // 10% 的清算奖励
    uint256 private constant MIN_HEALTH_FACTOR = 1e18;
    uint256 public totalCollateralValue;
    /* 状态变量：这些数据永久存储在区块链上，相当于数据库 */
    // 存储代币地址对应的价格喂价地址（Chainlink Oracle）
    mapping(address token => address priceFeed) public s_priceFeeds;
    // 记录每个用户存入每种抵押品的数量：s_collateralDepositsed[用户地址][代币地址] = 数量
    mapping(address user => mapping(address token => uint256 amount))
        public s_collateralDepositsed;
    // 记录每个用户已经铸造（借出）的稳定币数量
    mapping(address user => uint256 amountDscMinted) public s_DSCMinted;
    // 允许作为抵押品的代币列表
    address[] public s_collateralTokens;
    // 稳定币合约的实例，用于调用它的 mint 和 burn 方法
    DecentralizedStableCoin public immutable i_dsc;

    /* 事件：前端非常重要！通过监听这些事件，前端可以实时更新 UI（如：弹窗提示“存入成功”） */
    event CollateralDeposited(
        address indexed user,
        address indexed token,
        uint256 amount
    );
    event CollateralRedeemed(
        address indexed user,
        address indexed token,
        uint256 amount
    );
    event DscMinted(address indexed user, uint256 amount);
    event DscBurned(address indexed user, uint256 amount);
    event Liquidated(
        address indexed user,
        address indexed repayer,
        uint256 amount
    );
    /* 修饰符：类似于前端的中间件，在执行函数体之前先运行这些检查逻辑 */
    modifier moreThanZero(uint256 amount) {
        require(amount > 0, DSCEngine_NeedsMoreThanZeroAmount());
        _;
    }

    modifier isAllowedToken(address token) {
        require(s_priceFeeds[token] != address(0), DSCEngine_NotAllowedToken());
        _;
    }

    /* 构造函数：合约部署时运行一次，初始化支持的代币和价格源 */
    constructor(
        address[] memory tokenAddresses,
        address[] memory priceFeedAddresses,
        address dscAddress
    ) {
        require(
            tokenAddresses.length == priceFeedAddresses.length,
            DSCEngine_TokenAddressesAndPriceFeedAddressesMustMatchSameLength()
        );
        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            s_priceFeeds[tokenAddresses[i]] = priceFeedAddresses[i];
            s_collateralTokens.push(tokenAddresses[i]);
        }
        i_dsc = DecentralizedStableCoin(dscAddress);
    }

    /* 外部交互函数：这些是前端会调用的主要功能 */

    /**
     * @notice 存入抵押品并铸造稳定币（一步到位）
     * 前端调用：用户输入抵押金额和想要借出的 DSC 金额
     */
    function depostitCollateralAndMintDsc(
        address tokenCollateralAddress,
        uint256 amountCollateral,
        uint256 amountDscToMint
    ) public {
        depositCollateral(tokenCollateralAddress, amountCollateral);
        mintDsc(amountDscToMint);
    }

    /**
     * @notice 单独存入抵押品
     * 注意：前端在调用此函数前，需要先在 ERC20 代币合约上调用 approve 授权此合约扣款
     */
    function depositCollateral(
        address tokenCollateralAddress,
        uint256 amountCollateral
    )
        public
        isAllowedToken(tokenCollateralAddress)
        moreThanZero(amountCollateral)
        nonReentrant
    {
        // 1. 更新数据库中的余额
        s_collateralDepositsed[msg.sender][
            tokenCollateralAddress
        ] += amountCollateral;
        // 2. 触发事件，方便前端监听
        emit CollateralDeposited(
            msg.sender,
            tokenCollateralAddress,
            amountCollateral
        );
        // 3. 实际转账：将代币从用户钱包转移到此合约
        bool success = IERC20(tokenCollateralAddress).transferFrom(
            msg.sender,
            address(this),
            amountCollateral
        );
        uint256 addedValue = getUsdValue(
            tokenCollateralAddress,
            amountCollateral
        );
        totalCollateralValue += addedValue;
        require(success, DSCEngine_TransferFromFailed());
    }

    /**
     * @notice 销毁稳定币并取回抵押品
     */
    function redeemCollateralForDsc(
        address tokenCollateralAddress,
        uint256 amountCollateral,
        uint256 amountDscToBurn
    )
        public
        moreThanZero(amountCollateral)
        moreThanZero(amountDscToBurn)
        nonReentrant
    {
        burnDsc(amountDscToBurn);
        redeemCollateral(tokenCollateralAddress, amountCollateral);
    }

    /**
     * @notice 取回抵押品逻辑
     */
    function redeemCollateral(
        address tokenCollateralAddress,
        uint256 amountCollateral
    ) public moreThanZero(amountCollateral) nonReentrant {
        _redeemCollateral(
            tokenCollateralAddress,
            amountCollateral,
            msg.sender,
            msg.sender
        );
        uint256 removedValue = getUsdValue(
            tokenCollateralAddress,
            amountCollateral
        );
        totalCollateralValue -= removedValue;
    }

    /**
     * @notice 铸造稳定币（借钱）
     * 核心：系统会检查你的抵押品价值是否足够，不够会直接报错（Revert）
     */
    function mintDsc(
        uint256 amountDscToMint
    ) public moreThanZero(amountDscToMint) nonReentrant {
        // 1. 记录借款金额
        s_DSCMinted[msg.sender] += amountDscToMint;
        // 2. 核心检查：如果借完钱后你的“健康因子”太低，直接交易失败
        _revertIfHealthFactorIsBroken(msg.sender);
        // 3. 实际生成代币到用户钱包
        bool minted = i_dsc.mint(msg.sender, amountDscToMint);
        require(minted, DSCEngine_MintFailed());
        emit DscMinted(msg.sender, amountDscToMint);
    }

    /**
     * @notice 销毁稳定币（还钱）
     */
    function burnDsc(uint256 amount) public moreThanZero(amount) nonReentrant {
        _burnDsc(amount, msg.sender, msg.sender);
        _revertIfHealthFactorIsBroken(msg.sender);
    }

    /* 内部逻辑函数：这些函数前端通常调不到，是合约内部使用的工具 */

    function _burnDsc(
        uint256 amount,
        address onBehalfOf,
        address dscFrom
    ) public moreThanZero(amount) {
        s_DSCMinted[onBehalfOf] -= amount;
        bool success = i_dsc.transferFrom(dscFrom, address(this), amount);
        require(success, DSCEngine_TransferFromFailed());
        i_dsc.burn(amount);
        emit DscBurned(onBehalfOf, amount);
    }

    /**
     * @notice 清算逻辑
     * 如果一个用户的健康因子跌破 1，任何人都可以帮他还债，并拿走他的抵押品（外加 10% 奖金）
     */
    function liquidate(
        address tokenCollateralAddress,
        address user,
        uint256 debtToCover
    ) public {
        require(_healthFactor(user) < PRECISION, DSCEngine_HealthFactorOk());
        uint256 tokenAmountFromDebtCovered = getTokenAmountFromUsd(
            tokenCollateralAddress,
            debtToCover
        );
        uint256 bonusCollateral = (tokenAmountFromDebtCovered *
            LIQUIDATION_BONUS) / LIQUIDATION_PRECISION;
        uint256 totalCollateralToRedeem = tokenAmountFromDebtCovered +
            bonusCollateral;
        _redeemCollateral(
            tokenCollateralAddress,
            totalCollateralToRedeem,
            user,
            msg.sender
        );
        _burnDsc(debtToCover, user, msg.sender);
        _revertIfHealthFactorIsBroken(user);
        emit Liquidated(user, msg.sender, debtToCover);
    }

    /* 只读函数（View Functions）：前端可以免费调用这些函数来展示数据，不消耗 Gas */

    /**
     * @notice 计算健康因子：数值越大越安全，低于 1 就会被清算
     */
    function _healthFactor(address user) public view returns (uint256) {
        (
            uint256 totalDscMinted,
            uint256 collateralValueInUsd
        ) = _getAccountInformation(user);
        return _calculateHealthFactor(totalDscMinted, collateralValueInUsd);
    }

    /**
     * @notice 获取用户账户信息
     * 前端常用：展示用户借了多少钱，抵押了多少钱
     */
    function _getAccountInformation(
        address user
    )
        public
        view
        returns (uint256 totalDscMinted, uint256 collateralValueInUsd)
    {
        totalDscMinted = s_DSCMinted[user];
        collateralValueInUsd = getAccountCollateralValue(user);
        return (totalDscMinted, collateralValueInUsd);
    }

    /**
     * @notice 计算用户所有抵押品的总价值（折算为 USD）
     */
    function getAccountCollateralValue(
        address user
    ) public view returns (uint256 totalCollateralValueInUsd) {
        for (uint256 i = 0; i < s_collateralTokens.length; i++) {
            address token = s_collateralTokens[i];
            uint256 amount = s_collateralDepositsed[user][token];
            totalCollateralValueInUsd += getUsdValue(token, amount);
        }
        return totalCollateralValueInUsd;
    }

    /**
     * @notice 将 USD 金额转换为对应的代币数量（如：100 美元等于多少个以太坊）
     */
    function getTokenAmountFromUsd(
        address tokenCollateralAddress,
        uint256 debtToCover
    ) public view returns (uint256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(
            s_priceFeeds[tokenCollateralAddress]
        );
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price > 0, "Invalid price");
        return
            (debtToCover * PRECISION) /
            (uint256(price) * ADDITIONAL_FEEDCISION);
    }

    /**
     * @notice 获取特定代币金额的 USD 价值
     */
    function getUsdValue(
        address token,
        uint256 amount
    ) public view returns (uint256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(
            s_priceFeeds[token]
        );
        (, int256 price, , , ) = priceFeed.staleCheckLatestRoundData();
        require(price > 0, "Invalid price");
        return ((uint256(price) * ADDITIONAL_FEEDCISION) * amount) / PRECISION;
    }
    // 检查用户抵押健康度是否低于阈值

    function _revertIfHealthFactorIsBroken(address user) public {
        uint256 userHealthFactor = _healthFactor(user);
        require(
            userHealthFactor >= PRECISION,
            DSCEngine_BreakHealthFactor(userHealthFactor)
        );
    }

    function _redeemCollateral(
        address tokenCollateralAddress,
        uint256 amountCollateral,
        address from,
        address to
    ) public moreThanZero(amountCollateral) {
        s_collateralDepositsed[from][
            tokenCollateralAddress
        ] -= amountCollateral;
        emit CollateralRedeemed(from, tokenCollateralAddress, amountCollateral);
        // 赎回用户抵押品
        bool success = IERC20(tokenCollateralAddress).transfer(
            to,
            amountCollateral
        );
        require(success, DSCEngine_TransferFromFailed());
        _revertIfHealthFactorIsBroken(from);
    }

    function getAccountInformation(
        address user
    )
        public
        view
        returns (uint256 totalDscMinted, uint256 collateralValueInUsd)
    {
        (totalDscMinted, collateralValueInUsd) = _getAccountInformation(user);
    }

    function _calculateHealthFactor(
        uint256 totalDscMinted,
        uint256 collateralValueInUsd
    ) public view returns (uint256) {
        if (totalDscMinted == 0) return type(uint256).max;
        uint256 collateralAdjustedForThreshold = (collateralValueInUsd *
            LIQUIDATION_THRESHOLD) / LIQUIDATION_PRECISION;
        return (collateralAdjustedForThreshold * PRECISION) / totalDscMinted;
    }

    function calculateHealthFactor(
        uint256 totallDscMinted,
        uint256 collateralValueInUsd
    ) public view returns (uint256) {
        return _calculateHealthFactor(totallDscMinted, collateralValueInUsd);
    }

    function getHealthFactor(address user) public view returns (uint256) {
        return _healthFactor(user);
    }

    function getLiquidationBonus() public view returns (uint256) {
        return LIQUIDATION_BONUS;
    }

    function getCollateralTokenPriceFeed(
        address token
    ) public view returns (address) {
        return s_priceFeeds[token];
    }

    function getCollateralTokens() public view returns (address[] memory) {
        return s_collateralTokens;
    }

    function getMinHealthFactor() public view returns (uint256) {
        return MIN_HEALTH_FACTOR;
    }

    function getLiquidationThreshold() public view returns (uint256) {
        return LIQUIDATION_THRESHOLD;
    }

    function getCollateralBalanceOfUser(
        address user,
        address token
    ) public view returns (uint256) {
        return s_collateralDepositsed[user][token];
    }

    function getDsc() external view returns (address) {
        return address(i_dsc);
    }
}
