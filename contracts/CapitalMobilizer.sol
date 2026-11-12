// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CapitalMobilizer — Multi-Source Dormant Capital Mobilization Engine
 * @notice Routes payments from 10+ capital mobilization channels
 *         with automatic commission splitting to house wallet + referrers
 */
contract CapitalMobilizer {
    // =========================================================
    // TOKENS SUPPORTED
    // =========================================================
    address public immutable tUSD8;       // QDay testnet
    address public immutable usdcBase;    // Base mainnet USDC
    
    // =========================================================
    // HOUSE WALLET CONFIG
    // =========================================================
    address public houseWallet;
    address public immutable owner;
    
    // =========================================================
    // COMMISSION RATES (basis points, 10000 = 100%)
    // =========================================================
    uint256 public constant FACILITATOR_FEE_BPS = 50;     // 0.5% facilitator
    uint256 public constant HOUSE_CUT_BPS = 9000;         // 90% house
    uint256 public constant REFERRER_CUT_BPS = 1000;      // 10% referrer pool
    
    // =========================================================
    // AUTO-WITHDRAW / AUTO-PAYOUT THRESHOLDS
    // =========================================================
    uint256 public constant HOUSE_WITHDRAW_THRESHOLD = 10_000_000;      // $10.00 (6 decimals)
    uint256 public constant REFERRER_MIN_PAYOUT = 500_000;              // $0.50 (6 decimals)
    
    // =========================================================
    // CAPITAL CHANNEL ENUM
    // Each channel has its own fee schedule
    // =========================================================
    enum Channel { DATA_API, UNCLAIMED_PROPERTY, ESCROW_RELEASE, SUBSCRIPTION_RECOVERY, LOYALTY_CONVERSION, INSURANCE_CLAIMS, REMITTANCE_CORRIDOR, TAX_OPTIMIZATION, CROWDFUNDING_WITHDRAW, CLASS_ACTION }
    
    struct ChannelConfig {
        string name;
        uint256 commissionBps;    // variable rate per channel
        bool active;
        uint256 totalCollected;
        uint256 totalProcessed;
    }
    
    // =========================================================
    // STATE
    // =========================================================
    mapping(bytes32 => PaymentRecord) public paymentRecords;
    mapping(address => uint256) public referrerBalances;
    mapping(Channel => ChannelConfig) public channelConfigs;
    
    struct PaymentRecord {
        Channel channel;
        address payer;
        address recipient;
        uint256 amountAtomic;
        uint256 commissionAtomic;
        address referrer;
        uint256 timestamp;
        bool settled;
        bool refunded;
    }
    
    // =========================================================
    // EVENTS
    // =========================================================
    event CapitalMobilized(
        bytes32 indexed txId,
        Channel indexed channel,
        address indexed source,
        uint256 amountAtomic,
        uint256 commissionAtomic,
        address referrer,
        uint256 timestamp
    );
    event HouseWithdrawn(address indexed to, uint256 amount);
    event ReferrerPaidOut(address indexed referrer, uint256 amount);
    event ChannelConfigUpdated(Channel indexed channel, uint256 commissionBps, bool active);
    event HouseWalletUpdated(address indexed oldWallet, address indexed newWallet);
    
    // =========================================================
    // CONSTRUCTOR
    // =========================================================
    constructor(
        address _tUSD8,
        address _usdcBase,
        address _houseWallet
    ) {
        require(_tUSD8 != address(0), "Invalid tUSD8");
        require(_usdcBase != address(0), "Invalid USDC");
        require(_houseWallet != address(0), "Invalid house wallet");
        
        tUSD8 = _tUSD8;
        usdcBase = _usdcBase;
        houseWallet = _houseWallet;
        owner = msg.sender;
        
        // Initialize all channels with default rates
        _initChannels();
    }
    
    // =========================================================
    // CORE: Submit capital for mobilization
    // =========================================================
    /**
     * @notice Submit funds from any capital channel for processing
     * @param channel Which mobilization channel
     * @param recipient Who receives the mobilized capital
     * @param amountAtomic Amount in atomic units (6 decimals for tUSD8/tUSDC)
     * @param referrer Address to credit with 10% commission (address(0) = no referrer)
     * @return txId Unique identifier for this transaction
     */
    function mobilizeCapital(
        Channel channel,
        address recipient,
        uint256 amountAtomic,
        address referrer
    ) external returns (bytes32 txId) {
        require(recipient != address(0), "Invalid recipient");
        require(amountAtomic > 0, "Amount must be positive");
        require(channelConfigs[channel].active, "Channel inactive");
        
        // Calculate commissions
        uint256 channelFee = (amountAtomic * channelConfigs[channel].commissionBps) / 10000;
        uint256 netAmount = amountAtomic - channelFee;
        uint256 facilitatorFee = (netAmount * FACILITATOR_FEE_BPS) / 10000;
        uint256 houseCut = (netAmount - facilitatorFee) * HOUSE_CUT_BPS / 10000;
        uint256 referrerCut = (netAmount - facilitatorFee) - houseCut;
        
        // Generate unique tx ID
        txId = keccak256(abi.encodePacked(msg.sender, channel, recipient, amountAtomic, block.timestamp));
        
        // Record payment
        paymentRecords[txId] = PaymentRecord({
            channel: channel,
            payer: msg.sender,
            recipient: recipient,
            amountAtomic: amountAtomic,
            commissionAtomic: channelFee + facilitatorFee,
            referrer: referrer,
            timestamp: block.timestamp,
            settled: false,
            refunded: false
        });
        
        // Transfer to contract (caller must have approved first)
        bool ok1 = IERC20(tUSD8).transferFrom(msg.sender, address(this), houseCut);
        bool ok2 = referrerCut > 0 && referrer != address(0) 
            ? IERC20(tUSD8).transferFrom(msg.sender, address(this), referrerCut) 
            : true;
        require(ok1 && ok2, "Transfer failed");
        
        // Update channel stats
        channelConfigs[channel].totalCollected += channelFee + facilitatorFee;
        channelConfigs[channel].totalProcessed++;
        
        // Track referrer balance
        if (referrerCut > 0 && referrer != address(0)) {
            referrerBalances[referrer] += referrerCut;
            // Auto-payout if threshold reached
            if (referrerBalances[referrer] >= REFERRER_MIN_PAYOUT) {
                _payoutReferrer(referrer);
            }
        }
        
        // Auto-withdraw house funds
        if (IERC20(tUSD8).balanceOf(address(this)) >= HOUSE_WITHDRAW_THRESHOLD) {
            _withdrawHouse();
        }
        
        emit CapitalMobilized(txId, channel, msg.sender, amountAtomic, channelFee, referrer, block.timestamp);
        return txId;
    }
    
    /**
     * @notice Settle/mobilize the capital (delivery phase)
     * @dev Call after payment is confirmed to release funds to recipient
     */
    function settleCapital(bytes32 txId, address recipient) external {
        PaymentRecord storage record = paymentRecords[txId];
        require(!record.settled, "Already settled");
        require(!record.refunded, "Already refunded");
        require(record.recipient == recipient || msg.sender == record.recipient, "Unauthorized");
        
        record.settled = true;
        
        // Transfer mobilized amount to recipient (minus our cut already taken)
        uint256 deliverable = record.amountAtomic - record.commissionAtomic;
        require(IERC20(tUSD8).transfer(recipient, deliverable), "Settlement transfer failed");
    }
    
    // =========================================================
    // INTERNAL HELPERS
    // =========================================================
    function _payoutReferrer(address referrer) internal {
        uint256 balance = referrerBalances[referrer];
        if (balance >= REFERRER_MIN_PAYOUT) {
            referrerBalances[referrer] = 0;
            require(IERC20(tUSD8).transfer(referrer, balance), "Referrer payout failed");
            emit ReferrerPaidOut(referrer, balance);
        }
    }
    
    function _withdrawHouse() internal {
        uint256 balance = IERC20(tUSD8).balanceOf(address(this));
        if (balance >= HOUSE_WITHDRAW_THRESHOLD) {
            require(IERC20(tUSD8).transfer(houseWallet, balance), "House withdraw failed");
            emit HouseWithdrawn(houseWallet, balance);
        }
    }
    
    function _initChannels() internal {
        // Default commission rates per channel (in bps)
        // Higher risk/effort channels get higher commissions for us
        channelConfigs[Channel.DATA_API] = ChannelConfig("Data API Subscriptions", 50, true, 0, 0);     // 0.5%
        channelConfigs[Channel.UNCLAIMED_PROPERTY] = ChannelConfig("Unclaimed Property Recovery", 2000, true, 0, 0);   // 20%
        channelConfigs[Channel.ESCROW_RELEASE] = ChannelConfig("Escrow Dispute Resolution", 100, true, 0, 0);        // 1%
        channelConfigs[Channel.SUBSCRIPTION_RECOVERY] = ChannelConfig("Zombie Subscription Recovery", 2000, true, 0, 0);   // 20%
        channelConfigs[Channel.LOYALTY_CONVERSION] = ChannelConfig("Loyalty Points Conversion", 1500, true, 0, 0);    // 15%
        channelConfigs[Channel.INSURANCE_CLAIMS] = ChannelConfig("Insurance Claims", 2500, true, 0, 0);            // 25%
        channelConfigs[Channel.REMITTANCE_CORRIDOR] = ChannelConfig("Cross-Border Remittance", 200, true, 0, 0);       // 2%
        channelConfigs[Channel.TAX_OPTIMIZATION] = ChannelConfig("Tax Refund Optimization", 500, true, 0, 0);          // 5%
        channelConfigs[Channel.CROWDFUNDING_WITHDRAW] = ChannelConfig("Crowdfunding Withdrawals", 500, true, 0, 0);     // 5%
        channelConfigs[Channel.CLASS_ACTION] = ChannelConfig("Class Action Settlements", 2000, true, 0, 0);          // 20%
    }
    
    // =========================================================
    // ADMIN FUNCTIONS
    // =========================================================
    function setHouseWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Invalid wallet");
        emit HouseWalletUpdated(houseWallet, newWallet);
        houseWallet = newWallet;
    }
    
    function updateChannelConfig(Channel channel, uint256 commissionBps, bool active) external onlyOwner {
        require(commissionBps <= 3000, "Max 30% commission");
        channelConfigs[channel].commissionBps = commissionBps;
        channelConfigs[channel].active = active;
        emit ChannelConfigUpdated(channel, commissionBps, active);
    }
    
    function emergencyDrain(address to) external onlyOwner {
        uint256 balance = IERC20(tUSD8).balanceOf(address(this));
        require(balance > 0, "Nothing to drain");
        require(IERC20(tUSD8).transfer(to, balance), "Drain failed");
    }
    
    function batchPayoutReferrers(address[] calldata referrers) external onlyOwner {
        for (uint256 i = 0; i < referrers.length; i++) {
            _payoutReferrer(referrers[i]);
        }
    }
    
    function getHouseBalance() external view returns (uint256) {
        return IERC20(tUSD8).balanceOf(houseWallet);
    }
    
    function getContractBalance() external view returns (uint256) {
        return IERC20(tUSD8).balanceOf(address(this));
    }
    
    function getChannelStats(Channel channel) external view returns (
        string memory name,
        uint256 commissionBps,
        bool active,
        uint256 totalCollected,
        uint256 totalProcessed
    ) {
        ChannelConfig memory cfg = channelConfigs[channel];
        return (cfg.name, cfg.commissionBps, cfg.active, cfg.totalCollected, cfg.totalProcessed);
    }
    
    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
}

// Minimal ERC20 interface
interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}
