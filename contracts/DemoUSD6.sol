// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * DemoUSD6 — 6-decimal ERC-20 used ONLY as a test harness for
 * CapitalMobilizerV2 on QDay Aevum testnet.
 *
 * Purpose: prove the 10000/50/9000/1000 bps split arithmetic executes
 * end-to-end with real token movements while the official tUSD8 faucet
 * claim is pending email authorization.
 *
 * This is NOT money. It has no value and is not meant to imitate tUSD8.
 */
contract DemoUSD6 {
    string  public name     = "AutoTasker Demo USD (6dp)";
    string  public symbol   = "dUSD6";
    uint8   public constant decimals = 6;

    uint256 public totalSupply;
    address public immutable owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(uint256 initialSupply) {
        require(initialSupply > 0, "supply=0");
        owner = msg.sender;
        _mint(msg.sender, initialSupply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= value, "allowance");
        if (a != type(uint256).max) {
            allowance[from][msg.sender] = a - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function mint(address to, uint256 value) external {
        require(msg.sender == owner, "not owner");
        _mint(to, value);
    }

    function _mint(address to, uint256 value) internal {
        totalSupply      += value;
        balanceOf[to]    += value;
        emit Transfer(address(0), to, value);
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "to=0");
        require(balanceOf[from] >= value, "balance");
        balanceOf[from] -= value;
        balanceOf[to]   += value;
        emit Transfer(from, to, value);
    }
}
