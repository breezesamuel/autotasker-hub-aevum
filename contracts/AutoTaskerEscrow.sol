/**
 * AutoTasker Hub — Escrow Payment Router (Simplified Remix-compatible version)
 * 
 * This is a simpler contract designed for easy deployment via Remix IDE.
 * Key difference from V2: uses escrow model where funds are held until provider confirms delivery.
 */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract AutoTaskerEscrow {
    IERC20 public immutable token;
    address public immutable owner;
    address public houseWallet;
    
    // Pricing
    uint256 public constant PRICE_HOTLIST = 50_000;     // $0.05
    uint256 public constant PRICE_SEARCH = 50_000;      // $0.05
    uint256 public constant PRICE_PRICE = 100_000;      // $0.10
    uint256 public constant PRICE_FULL = 500_000;       // $0.50
    
    // Fee splits (basis points)
    uint256 public constant HOUSE_BPS = 9000;           // 90%
    uint256 public constant REFERRER_BPS = 1000;        // 10%
    uint256 public constant FEE_BPS = 50;               // 50bps facilitator fee
    
    struct Order {
        address buyer;
        address provider;
        address referrer;
        uint256 price;
        bool completed;
        uint256 timestamp;
        bytes32 orderId;
    }
    
    mapping(bytes32 => Order) public orders;
    uint256 public orderCount;
    
    // Accumulated house fees
    uint256 public houseAccumulated;
    
    event OrderCreated(bytes32 indexed orderId, address indexed buyer, string toolName, uint256 price);
    event OrderCompleted(bytes32 indexed orderId, address indexed provider, uint256 providerAmount, uint256 houseAmount);
    event HouseWithdrawn(uint256 amount);
    
    constructor(address _token, address _houseWallet) {
        require(_token != address(0));
        require(_houseWallet != address(0));
        token = IERC20(_token);
        owner = msg.sender;
        houseWallet = _houseWallet;
    }
    
    /**
     * @notice Place an order for data access
     * @param toolName Type of data being purchased
     * @param provider Address that will receive the payment
     * @param referrer Address of referring agent (zero if direct)
     * @return orderId Unique identifier
     */
    function placeOrder(string calldata toolName, address provider, address referrer) external returns (bytes32 orderId) {
        require(provider != address(0), "Invalid provider");
        
        uint256 price = getPrice(toolName);
        require(price > 0, "Unknown tool");
        
        orderId = keccak256(abi.encodePacked(msg.sender, block.timestamp, orderCount));
        
        orders[orderId] = Order({
            buyer: msg.sender,
            provider: provider,
            referrer: referrer,
            price: price,
            completed: false,
            timestamp: block.timestamp,
            orderId: orderId
        });
        
        orderCount++;
        
        // Lock funds
        bool ok = token.transferFrom(msg.sender, address(this), price);
        require(ok, "Transfer failed");
        
        emit OrderCreated(orderId, msg.sender, toolName, price);
        return orderId;
    }
    
    /**
     * @notice Complete order and release funds
     */
    function completeOrder(bytes32 orderId, address provider) external {
        Order storage order = orders[orderId];
        require(!order.completed, "Already completed");
        require(msg.sender == order.buyer || msg.sender == owner, "Unauthorized");
        
        order.completed = true;
        
        uint256 houseCut = (order.price * HOUSE_BPS) / 10000;
        uint256 receiverCut = order.price - houseCut;
        
        // Referrer gets the receiver cut, otherwise provider
        address receiver = (order.referrer != address(0)) ? order.referrer : provider;
        
        bool ok = token.transfer(receiver, receiverCut);
        require(ok, "Receiver payout failed");
        
        // House gets its share
        houseAccumulated += houseCut;
        
        emit OrderCompleted(orderId, provider, receiverCut, houseCut);
    }
    
    /**
     * @notice Withdraw accumulated house fees
     */
    function withdrawHouse() external {
        require(msg.sender == owner, "Not owner");
        require(houseAccumulated > 0, "No funds");
        
        uint256 amount = houseAccumulated;
        houseAccumulated = 0;
        
        bool ok = token.transfer(houseWallet, amount);
        require(ok, "Withdrawal failed");
        
        emit HouseWithdrawn(amount);
    }
    
    function getPrice(string memory toolName) internal pure returns (uint256) {
        if (keccak256(abi.encodePacked(toolName)) == keccak256(abi.encodePacked("hotlist"))) return PRICE_HOTLIST;
        if (keccak256(abi.encodePacked(toolName)) == keccak256(abi.encodePacked("search"))) return PRICE_SEARCH;
        if (keccak256(abi.encodePacked(toolName)) == keccak256(abi.encodePacked("price"))) return PRICE_PRICE;
        if (keccak256(abi.encodePacked(toolName)) == keccak256(abi.encodePacked("full"))) return PRICE_FULL;
        return 0;
    }
}
