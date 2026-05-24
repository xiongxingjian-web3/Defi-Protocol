// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {
    ERC20Burnable,
    ERC20
} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract DecentralizedStableCoin is ERC20Burnable, Ownable {
    error DecentralizedStableCoin_BurnInsufficientBalance();
    error DecentralizedStableCoin_NotZeroAddress();
    error DecentralizedStableCoin_MustBeMoreThanZero();

    constructor() ERC20("DecentralizedStableCoin", "DSC") Ownable(msg.sender) {}

    function burn(uint256 _amount) public override onlyOwner {
        uint256 balance = balanceOf(msg.sender);
        require(
            balance >= _amount,
            DecentralizedStableCoin_BurnInsufficientBalance()
        );
        super._burn(msg.sender, _amount);
    }

    function mint(
        address _to,
        uint256 _amount
    ) public onlyOwner returns (bool) {
        require(_to != address(0), DecentralizedStableCoin_NotZeroAddress());
        require(_amount > 0, DecentralizedStableCoin_MustBeMoreThanZero());
        _mint(_to, _amount);
        return true;
    }
}
