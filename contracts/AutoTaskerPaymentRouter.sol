/**
 * @title AutoTaskerPaymentRouterV2
 * @notice Simplified version for Remix deployment (no external imports needed)
 * @dev Self-contained contract - paste directly into Remix
 */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITUSD8 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
}

contract AutoTaskerPaymentRouter {
    ITUSD8 public immutable tUSD8;
    address public immutable owner;
    
    // Prices in atomic units (tUSD8 has 6 decimals)
    uint256 public constant HOTLIST_PRICE = 50_000;       // $0.05
    uint256 public constant SEARCH_PRICE = 50_000;        // $0.05
    uint256 public constant PRICE_INTEL_PRICE = 100_000;  // $0.10
    uint256 public constant FULL_EXPORT_PRICE = 500_000;  // $0.50
    
    struct Request {
        address payer;
        uint256 pricePaid;
        string toolName;
        bool fulfilled;
        uint256 timestamp;
    }
    
    mapping(bytes32 => Request) public requests;
    uint256 public requestCount;
    
    event PaymentReceived(address indexed payer, address indexed provider, uint256 amount, bytes32 requestId, string toolName);
    event RequestCreated(bytes32 indexed requestId, address indexed payer, string toolName, uint256 price);
    event RequestFulfilled(bytes32 indexed requestId, address indexed provider, uint256 payout);
    event Withdrawal(address indexed owner, uint256 amount);
    
    constructor(address _tUSD8) {
        require(_tUSD8 != address(0), "Invalid tUSD8 address");
        tUSD8 = ITUSD8(_tUSD8);
        owner = msg.sender;
    }
    
    function submitPayment(string calldata toolName, address provider, uint256 maxTimeoutSeconds) external returns (bytes32 requestId) {
        require(provider != address(0), "Invalid provider");
        require(maxTimeoutSeconds <= 120, "Timeout too long");
        
        uint256 price = getPrice(toolName);
        require(price > 0, "Unknown tool");
        
        requestId = keccak256(abi.encodePacked(msg.sender, block.timestamp, requestCount++));
        
        requests[requestId] = Request({
            payer: msg.sender,
            pricePaid: price,
            toolName: toolName,
            fulfilled: false,
            timestamp: block.timestamp
        });
        
        bool success = tUSD8.transferFrom(msg.sender, address(this), price);
        require(success, "Payment failed");
        
        emit RequestCreated(requestId, msg.sender, toolName, price);
        emit PaymentReceived(msg.sender, provider, price, requestId, toolName);
        
        return requestId;
    }
    
    function fulfillRequest(bytes32 requestId, address provider) external {
        Request storage req = requests[requestId];
        require(!req.fulfilled, "Already fulfilled");
        require(req.payer == msg.sender || msg.sender == owner, "Not authorized");
        
        req.fulfilled = true;
        
        uint256 routerFee = (req.pricePaid * 50) / 10000; // 50bps
        uint256 providerPayout = req.pricePaid - routerFee;
        
        bool success = tUSD8.transfer(provider, providerPayout);
        require(success, "Provider payout failed");
        
        emit RequestFulfilled(requestId, provider, providerPayout);
    }
    
    function withdraw(uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        require(tUSD8.balanceOf(address(this)) >= amount, "Insufficient balance");
        
        bool success = tUSD8.transfer(msg.sender, amount);
        require(success, "Withdrawal failed");
        
        emit Withdrawal(msg.sender, amount);
    }
    
    function getBalance() external view returns (uint256) {
        return tUSD8.balanceOf(address(this));
    }
    
    function getRequest(bytes32 requestId) external view returns (
        address payer, uint256 pricePaid, string memory toolName, bool fulfilled, uint256 timestamp
    ) {
        Request memory req = requests[requestId];
        return (req.payer, req.pricePaid, req.toolName, req.fulfilled, req.timestamp);
    }
    
    function getPrice(string memory toolName) internal pure returns (uint256) {
        if (keccak256(abi.encodePacked(toolName)) == keccak256(abi.encodePacked("hotlist"))) return HOTLIST_PRICE;
        if (keccak256(abi.encodePacked(toolName)) == keccak256(abi.encodePacked("search"))) return SEARCH_PRICE;
        if (keccak256(abi.encodePacked(toolName)) == keccak256(abi.encodePacked("price"))) return PRICE_INTEL_PRICE;
        if (keccak256(abi.encodePacked(toolName)) == keccak256(abi.encodePacked("full"))) return FULL_EXPORT_PRICE;
        return 0;
    }
}
