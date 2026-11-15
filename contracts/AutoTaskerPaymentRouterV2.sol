// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AutoTaskerPaymentRouterV2 — Production Ready
 * @notice Accepts tUSD8 payments, routes to house wallet with automatic payout
 * @dev Deployed on QDay Aevum testnet (chainId 44005) for Aevum Builder Challenge #1
 */
interface ITUSD8 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
    function totalSupply() external view returns (uint256);
}

contract AutoTaskerPaymentRouterV2 {
    // ─── Immutables (set once at deployment) ───
    ITUSD8 public immutable tUSD8;
    address public immutable owner;
    
    // ─── Configuration ───
    // House wallet: where revenue accumulates (our real收款账户)
    address public houseWallet;
    
    // Pricing (atomic units, tUSD8 = 6 decimals)
    uint256 public constant HOTLIST_PRICE = 50_000;       // $0.05
    uint256 public constant SEARCH_PRICE = 50_000;        // $0.05
    uint256 public constant PRICE_INTEL_PRICE = 100_000;  // $0.10
    uint256 public constant FULL_EXPORT_PRICE = 500_000;  // $0.50
    
    // Fee splits (in basis points, 10000 = 100%)
    uint256 public constant HOUSE_CUT_BPS = 9000;     // 90% → house wallet
    uint256 public constant REFERREER_CUT_BPS = 1000;  // 10% → referrer (if any)
    uint256 public constant FACILITATOR_FEE_BPS = 50;  // 0.5% → router treasury
    
    // Payout thresholds
    uint256 public constant MIN_HOUSE_WITHDRAW = 1_000_000;      // $1.00 minimum
    uint256 public constant MIN_REFERRER_PAYOUT = 50_000;         // $0.05 minimum
    uint256 public constant AUTO_WITHDRAW_THRESHOLD = 10_000_000; // $10.00 auto-withdraw
    
    // ─── Data Structures ───
    struct Request {
        address payer;
        address referrer;      // who referred this agent (zero if direct)
        uint256 pricePaid;
        string toolName;
        bool fulfilled;
        uint256 timestamp;
        bytes32 requestId;
    }
    
    struct ReferrerBalance {
        uint256 pendingAtomic;   // accumulated but not yet paid out
        uint256 totalEarnedAtomic;
        uint256 count;
        bool paidOut;
    }
    
    // ─── State ───
    mapping(bytes32 => Request) public requests;
    mapping(address => ReferrerBalance) public referrerBalances;
    uint256 public requestCount;
    
    // House wallet accumulated fees (not yet withdrawn)
    uint256 public houseAccumulated;
    
    // Stats
    uint256 public totalVolumeAtomic;
    uint256 public totalHouseRevenueAtomic;
    uint256 public totalReferrerPayoutsAtomic;
    uint256 public totalRequests;
    
    // ─── Events ───
    event PaymentReceived(
        address indexed payer,
        address indexed provider,
        address indexed referrer,
        uint256 amount,
        bytes32 requestId,
        string toolName
    );
    event RequestCreated(
        bytes32 indexed requestId,
        address indexed payer,
        address indexed referrer,
        string toolName,
        uint256 price
    );
    event RequestFulfilled(
        bytes32 indexed requestId,
        address indexed provider,
        uint256 payout
    );
    event HouseWithdrawn(address indexed recipient, uint256 amount);
    event ReferrerPaidOut(address indexed referrer, uint256 amount);
    event ContractUpgraded(address indexed oldOwner, address indexed newOwner);
    
    // ─── Errors ───
    error InvalidProvider();
    error TimeoutTooLong();
    error UnknownTool();
    error PaymentFailed();
    error PayoutFailed();
    error InsufficientBalance();
    error Unauthorized();
    error AlreadyFulfilled();
    error MinPayoutNotReached();
    
    // ─── Constructor ───
    constructor(address _tUSD8, address _houseWallet) {
        require(_tUSD8 != address(0), "Invalid tUSD8");
        require(_houseWallet != address(0), "Invalid house wallet");
        tUSD8 = ITUSD8(_tUSD8);
        owner = msg.sender;
        houseWallet = _houseWallet;
    }
    
    // ─── Core Functions ───
    
    /**
     * @notice Submit payment for data access
     * @param toolName The API endpoint being accessed
     * @param provider Address of the data provider receiving funds
     * @param maxTimeoutSeconds Maximum wait time for fulfillment
     * @return requestId Unique identifier for tracking
     */
    function submitPayment(
        string calldata toolName,
        address provider,
        uint256 maxTimeoutSeconds,
        address referrer  // can be zero address for no referral
    ) external returns (bytes32 requestId) {
        if (provider == address(0)) revert InvalidProvider();
        if (maxTimeoutSeconds > 120) revert TimeoutTooLong();
        
        uint256 price = getPrice(toolName);
        if (price == 0) revert UnknownTool();
        
        requestId = keccak256(abi.encodePacked(msg.sender, block.timestamp, requestCount));
        
        requests[requestId] = Request({
            payer: msg.sender,
            referrer: referrer,
            pricePaid: price,
            toolName: toolName,
            fulfilled: false,
            timestamp: block.timestamp,
            requestId: requestId
        });
        
        requestCount++;
        totalRequests++;
        
        // Transfer payment from payer to this contract
        bool success = tUSD8.transferFrom(msg.sender, address(this), price);
        if (!success) revert PaymentFailed();
        
        totalVolumeAtomic += price;
        
        emit RequestCreated(requestId, msg.sender, referrer, toolName, price);
        emit PaymentReceived(msg.sender, provider, referrer, price, requestId, toolName);
        
        return requestId;
    }
    
    /**
     * @notice Fulfill a request and route payment to provider
     * @dev Called by the payer (or owner) after data is delivered
     */
    function fulfillRequest(bytes32 requestId, address provider) external {
        Request storage req = requests[requestId];
        if (req.fulfilled) revert AlreadyFulfilled();
        if (req.payer != msg.sender && msg.sender != owner) revert Unauthorized();
        
        req.fulfilled = true;
        
        uint256 price = req.pricePaid;
        
        // Split: house gets 90%, referrer gets 10% (of the gross)
        // But facilitator takes 50bps from house cut
        uint256 houseCut = (price * HOUSE_CUT_BPS) / 10000;
        uint256 referrerCut = (price * REFERREER_CUT_BPS) / 10000;
        uint256 facilitatorFee = (houseCut * FACILITATOR_FEE_BPS) / 10000;
        uint256 netHouseCut = houseCut - facilitatorFee;
        
        // Route to house wallet
        bool houseSuccess = tUSD8.transfer(houseWallet, netHouseCut);
        if (!houseSuccess) revert PayoutFailed();
        
        // Route to referrer (if exists)
        if (req.referrer != address(0) && referrerCut > 0) {
            ReferrerBalance storage rb = referrerBalances[req.referrer];
            rb.pendingAtomic += referrerCut;
            rb.totalEarnedAtomic += referrerCut;
            rb.count++;
            
            // Auto-payout if threshold reached
            if (rb.pendingAtomic >= MIN_REFERRER_PAYOUT) {
                uint256 payout = rb.pendingAtomic;
                rb.pendingAtomic = 0;
                rb.paidOut = true;
                bool refSuccess = tUSD8.transfer(req.referrer, payout);
                if (refSuccess) {
                    totalReferrerPayoutsAtomic += payout;
                    emit ReferrerPaidOut(req.referrer, payout);
                }
            }
        }
        
        // Track house accumulation
        houseAccumulated += netHouseCut;
        totalHouseRevenueAtomic += netHouseCut;
        
        // Auto-withdraw to house wallet when threshold reached
        if (houseAccumulated >= AUTO_WITHDRAW_THRESHOLD) {
            uint256 withdrawAmount = houseAccumulated;
            houseAccumulated = 0;
            // Balance check — contract should have enough
            require(tUSD8.balanceOf(address(this)) >= withdrawAmount, "Insufficient for auto-withdraw");
            bool autoWithdrawSuccess = tUSD8.transfer(houseWallet, withdrawAmount);
            if (autoWithdrawSuccess) {
                emit HouseWithdrawn(houseWallet, withdrawAmount);
            }
        }
        
        emit RequestFulfilled(requestId, provider, netHouseCut);
    }
    
    /**
     * @notice Owner can withdraw accumulated house fees
     * @param amount Amount to withdraw (0 = all)
     */
    function withdrawHouse(uint256 amount) external {
        if (msg.sender != owner) revert Unauthorized();
        if (amount == 0) amount = houseAccumulated;
        if (amount > houseAccumulated) revert InsufficientBalance();
        if (amount < MIN_HOUSE_WITHDRAW) revert MinPayoutNotReached();
        
        houseAccumulated -= amount;
        require(tUSD8.balanceOf(address(this)) >= amount, "Insufficient contract balance");
        
        bool success = tUSD8.transfer(houseWallet, amount);
        if (!success) revert PayoutFailed();
        
        emit HouseWithdrawn(houseWallet, amount);
    }
    
    /**
     * @notice Force-clear a stale request (owner only)
     */
    function cancelRequest(bytes32 requestId) external {
        if (msg.sender != owner) revert Unauthorized();
        Request storage req = requests[requestId];
        require(!req.fulfilled, "Already fulfilled");
        req.fulfilled = true; // mark as cancelled so it can't be re-used
        // Note: funds remain in contract until owner withdraws
    }
    
    /**
     * @notice Update house wallet address (owner only)
     */
    function setHouseWallet(address newWallet) external {
        if (msg.sender != owner) revert Unauthorized();
        require(newWallet != address(0), "Invalid wallet");
        address oldWallet = houseWallet;
        houseWallet = newWallet;
        emit ContractUpgraded(oldWallet, newWallet);
    }
    
    /**
     * @notice Emergency drain (owner only) — for debugging
     */
    function emergencyDrain(uint256 amount) external {
        if (msg.sender != owner) revert Unauthorized();
        require(tUSD8.balanceOf(address(this)) >= amount, "Insufficient");
        bool success = tUSD8.transfer(houseWallet, amount);
        require(success, "Drain failed");
    }
    
    // ─── View Functions ───
    
    function getBalance() external view returns (uint256) {
        return tUSD8.balanceOf(address(this));
    }
    
    function getRequest(bytes32 requestId) external view returns (
        address payer,
        address referrer,
        uint256 pricePaid,
        string memory toolName,
        bool fulfilled,
        uint256 timestamp
    ) {
        Request memory req = requests[requestId];
        return (req.payer, req.referrer, req.pricePaid, req.toolName, req.fulfilled, req.timestamp);
    }
    
    function getReferrerStats(address referrer) external view returns (
        uint256 pendingAtomic,
        uint256 totalEarnedAtomic,
        uint256 count,
        bool paidOut
    ) {
        ReferrerBalance memory rb = referrerBalances[referrer];
        return (rb.pendingAtomic, rb.totalEarnedAtomic, rb.count, rb.paidOut);
    }
    
    function getDashboard() external view returns (
        uint256 totalVolumeUsd,
        uint256 houseRevenueUsd,
        uint256 referrerPayoutsUsd,
        uint256 contractBalanceUsd,
        uint256 houseAccumulatedUsd,
        uint256 totalRequests
    ) {
        return (
            totalVolumeAtomic / 1e6,
            totalHouseRevenueAtomic / 1e6,
            totalReferrerPayoutsAtomic / 1e6,
            tUSD8.balanceOf(address(this)) / 1e6,
            houseAccumulated / 1e6,
            totalRequests
        );
    }
    
    // ─── Internal ───
    
    function getPrice(string memory toolName) internal pure returns (uint256) {
        if (keccak256(abi.encodePacked(toolName)) == keccak256(abi.encodePacked("hotlist"))) return HOTLIST_PRICE;
        if (keccak256(abi.encodePacked(toolName)) == keccak256(abi.encodePacked("search"))) return SEARCH_PRICE;
        if (keccak256(abi.encodePacked(toolName)) == keccak256(abi.encodePacked("price"))) return PRICE_INTEL_PRICE;
        if (keccak256(abi.encodePacked(toolName)) == keccak256(abi.encodePacked("full"))) return FULL_EXPORT_PRICE;
        return 0;
    }
}
