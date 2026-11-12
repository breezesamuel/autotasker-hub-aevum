/**
 * @title EscrowPaymentRouter — Alternative: escrow-based payment model
 * @notice More robust for hackathon demo: funds held in escrow until both parties confirm
 */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITUSD8 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract EscrowPaymentRouter {
    ITUSD8 public immutable tUSD8;
    address public immutable owner;
    address public houseWallet;
    
    uint256 public constant HOTLIST_PRICE = 50_000;
    uint256 public constant SEARCH_PRICE = 50_000;
    uint256 public constant PRICE_INTEL_PRICE = 100_000;
    uint256 public constant FULL_EXPORT_PRICE = 500_000;
    
    struct Escrow {
        address payer;
        address provider;
        address referrer;
        uint256 amount;
        bool released;
        bool disputed;
        uint256 createdAt;
        bytes32 requestId;
    }
    
    mapping(bytes32 => Escrow) public escrows;
    uint256 public escrowCount;
    
    event EscrowCreated(bytes32 indexed requestId, address indexed payer, address indexed provider, uint256 amount, string toolName);
    event EscrowReleased(bytes32 indexed requestId, address indexed provider, uint256 providerAmount, uint256 houseAmount);
    event EscrowDisputed(bytes32 indexed requestId, address indexed requester);
    event HouseWithdrawn(uint256 amount);
    
    constructor(address _tUSD8, address _houseWallet) {
        tUSD8 = ITUSD8(_tUSD8);
        owner = msg.sender;
        houseWallet = _houseWallet;
    }
    
    function createEscrow(string calldata toolName, address provider, address referrer) external returns (bytes32 requestId) {
        uint256 amount = getPrice(toolName);
        require(amount > 0, "Unknown tool");
        require(provider != address(0), "Invalid provider");
        
        requestId = keccak256(abi.encodePacked(msg.sender, block.timestamp, escrowCount));
        
        escrows[requestId] = Escrow({
            payer: msg.sender,
            provider: provider,
            referrer: referrer,
            amount: amount,
            released: false,
            disputed: false,
            createdAt: block.timestamp,
            requestId: requestId
        });
        
        escrowCount++;
        
        bool success = tUSD8.transferFrom(msg.sender, address(this), amount);
        require(success, "Payment failed");
        
        emit EscrowCreated(requestId, msg.sender, provider, amount, toolName);
        return requestId;
    }
    
    function releaseEscrow(bytes32 requestId, address provider) external {
        Escrow storage esc = escrows[requestId];
        require(!esc.released, "Already released");
        require(!esc.disputed, "Disputed");
        require(msg.sender == esc.payer || msg.sender == owner, "Unauthorized");
        
        esc.released = true;
        
        // Split: 90% house, 10% provider/referrer
        uint256 houseCut = (esc.amount * 9000) / 10000;
        uint256 receiverCut = esc.amount - houseCut;
        
        // If referrer exists, they get the receiver cut
        if (esc.referrer != address(0)) {
            bool ok = tUSD8.transfer(esc.referrer, receiverCut);
            require(ok, "Referrer payout failed");
        } else {
            bool ok = tUSD8.transfer(provider, receiverCut);
            require(ok, "Provider payout failed");
        }
        
        bool houseOk = tUSD8.transfer(houseWallet, houseCut);
        require(houseOk, "House transfer failed");
        
        emit EscrowReleased(requestId, provider, receiverCut, houseCut);
    }
    
    function disputeEscrow(bytes32 requestId) external {
        Escrow storage esc = escrows[requestId];
        require(msg.sender == esc.payer, "Not payer");
        require(!esc.released, "Already released");
        esc.disputed = true;
        emit EscrowDisputed(requestId, msg.sender);
    }
    
    function withdrawHouse() external {
        require(msg.sender == owner, "Not owner");
        uint256 balance = tUSD8.balanceOf(address(this));
        require(balance > 0, "No funds");
        bool ok = tUSD8.transfer(houseWallet, balance);
        require(ok, "Withdrawal failed");
        emit HouseWithdrawn(balance);
    }
    
    function getPrice(string memory toolName) internal pure returns (uint256) {
        if (keccak256(abi.encodePacked(toolName)) == keccak256(abi.encodePacked("hotlist"))) return HOTLIST_PRICE;
        if (keccak256(abi.encodePacked(toolName)) == keccak256(abi.encodePacked("search"))) return SEARCH_PRICE;
        if (keccak256(abi.encodePacked(toolName)) == keccak256(abi.encodePacked("price"))) return PRICE_INTEL_PRICE;
        if (keccak256(abi.encodePacked(toolName)) == keccak256(abi.encodePacked("full"))) return FULL_EXPORT_PRICE;
        return 0;
    }
}
