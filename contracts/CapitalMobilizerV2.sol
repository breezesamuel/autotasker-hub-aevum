// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * CapitalMobilizerV2
 * ------------------
 * Commission router for AutoTasker Hub. One contract, ten funding channels,
 * provable 90/10 commission split with a 0.5% rail fee.
 *
 * DESIGN NOTES
 * ------------
 * V1 (never deployed) was insolvent: it pulled only house+referrer cuts but
 * promised the payee the gross minus fees, and its house sweep drained funds
 * earmarked for payees. Do not resurrect it.
 *
 * This version is built for micropayments:
 *   - No per-payment struct in storage. The Charged event IS the receipt.
 *   - Counters are bit-packed so one settlement touches few storage slots.
 *   - chargeBatch() pulls the payer once for N charges and warms storage,
 *     which is what makes sub-cent pricing viable.
 *
 * Money flow for one charge of `gross`:
 *
 *   gross ──┬─ commission = gross * channelBps / 10000
 *           └─ payee      = gross - commission        -> paid instantly
 *
 *   commission ─┬─ facilitator = commission * 50bps   -> treasury ledger
 *               └─ rest
 *                     ├─ house    = 90%               -> house wallet ledger
 *                     └─ referrer = 10%               -> referrer ledger
 *
 * Invariant: token.balanceOf(this) == houseAccrued + facilitatorAccrued
 *            + totalReferrerAccrued, always, between transactions.
 */
interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract CapitalMobilizerV2 {
    // ---------------------------------------------------------------
    // Wiring
    // ---------------------------------------------------------------
    IERC20  public immutable token;
    address public immutable owner;
    address public houseWallet;
    address public treasury;

    // ---------------------------------------------------------------
    // Economics (basis points of 10_000)
    // ---------------------------------------------------------------
    uint16 public constant FACILITATOR_BPS    = 50;    // 0.50% rail fee
    uint16 public constant HOUSE_SHARE_BPS    = 9000;  // 90% of distributable
    uint16 public constant MAX_COMMISSION_BPS = 10000; // 100% max channel take

    uint256 public constant HOUSE_WITHDRAW_MIN  = 10_000_000; // $10.000000 @ 6dp
    uint256 public constant REFERRER_PAYOUT_MIN =    500_000; // $0.500000  @ 6dp

    // ---------------------------------------------------------------
    // Channels
    // ---------------------------------------------------------------
    enum Channel {
        DATA_API,              // 0  x402 data marketplace (keeps 100%)
        UNCLAIMED_PROPERTY,    // 1  escheat / unclaimed asset recovery
        ESCROW_RELEASE,        // 2  stalled escrow + retainage release
        SUBSCRIPTION_RECOVERY, // 3  zombie subscription cancellation
        LOYALTY_CONVERSION,    // 4  expiring miles / points liquidation
        INSURANCE_CLAIMS,      // 5  unclaimed policy proceeds
        REMITTANCE_CORRIDOR,   // 6  cross-border fee compression
        TAX_OPTIMIZATION,      // 7  refund acceleration
        CROWDFUNDING_WITHDRAW, // 8  dormanted platform balances
        CLASS_ACTION           // 9  unclaimed settlement funds
    }
    uint8 public constant CHANNEL_COUNT = 10;

    // ---------------------------------------------------------------
    // State — packed on purpose
    // ---------------------------------------------------------------
    // channel config packed: bits 0..15 = commissionBps, bit 16 = active
    mapping(uint8 => uint256) private _chan;

    struct Stats { uint96 gross; uint96 commission; uint64 ops; }
    mapping(uint8 => Stats) public channelStats;
    Stats public globalStats;

    // Segregated ledgers. Nothing here is ever shared.
    uint256 public houseAccrued;
    uint256 public facilitatorAccrued;
    uint256 public totalReferrerAccrued;
    mapping(address => uint256) public referrerAccrued;
    mapping(address => uint256) public referrerPaid;

    bool private _locked;

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------
    event Charged(
        bytes32 indexed paymentId,
        uint8   indexed channel,
        address indexed payer,
        address payee,
        address referrer,
        uint256 gross,
        uint256 commission,
        uint256 payeeAmount,
        uint256 houseAmount,
        uint256 referrerAmount,
        uint256 facilitatorAmount
    );
    event HouseWithdrawn(address indexed to, uint256 amount);
    event FacilitatorWithdrawn(address indexed to, uint256 amount);
    event ReferrerPaid(address indexed referrer, uint256 amount);
    event HouseWalletChanged(address indexed previous, address indexed next);
    event TreasuryChanged(address indexed previous, address indexed next);
    event ChannelChanged(uint8 indexed channel, uint16 commissionBps, bool active);
    event SurplusRescued(address indexed to, uint256 amount);

    struct ChargeInput {
        uint8   channel;
        address payee;
        uint256 gross;
        address referrer;
    }

    // ---------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------
    constructor(address token_, address houseWallet_, address treasury_) {
        require(token_       != address(0), "token=0");
        require(houseWallet_ != address(0), "house=0");
        require(treasury_    != address(0), "treasury=0");
        token       = IERC20(token_);
        houseWallet = houseWallet_;
        treasury    = treasury_;
        owner       = msg.sender;
        _initChannels();
    }

    function _initChannels() internal {
        _set(Channel.DATA_API,              10000, true);
        _set(Channel.UNCLAIMED_PROPERTY,     2000, true);
        _set(Channel.ESCROW_RELEASE,          100, true);
        _set(Channel.SUBSCRIPTION_RECOVERY,  2000, true);
        _set(Channel.LOYALTY_CONVERSION,     1500, true);
        _set(Channel.INSURANCE_CLAIMS,       2500, true);
        _set(Channel.REMITTANCE_CORRIDOR,     200, true);
        _set(Channel.TAX_OPTIMIZATION,        500, true);
        _set(Channel.CROWDFUNDING_WITHDRAW,   500, true);
        _set(Channel.CLASS_ACTION,           2000, true);
    }

    function _set(Channel ch, uint16 bps, bool active) internal {
        require(bps <= MAX_COMMISSION_BPS, "bps too high");
        _chan[uint8(ch)] = uint256(bps) | (active ? (1 << 16) : 0);
        emit ChannelChanged(uint8(ch), bps, active);
    }

    // ---------------------------------------------------------------
    // CORE
    // ---------------------------------------------------------------
    /// @notice Pull `gross` and settle atomically. Caller must approve first.
    function charge(
        Channel ch,
        address payee,
        uint256 gross,
        address referrer
    ) external nonReentrant returns (bytes32 paymentId) {
        _checkChannel(uint8(ch), payee, gross);
        _safeTransferFrom(msg.sender, address(this), gross);

        Split memory s = _split(uint8(ch), gross, referrer);

        if (s.payeeAmount > 0) _safeTransfer(payee, s.payeeAmount);
        _accrue(uint8(ch), referrer, gross, s);

        paymentId = keccak256(abi.encodePacked(msg.sender, payee, gross, globalStats.ops, block.timestamp));
        emit Charged(
            paymentId, uint8(ch), msg.sender, payee, referrer,
            gross, s.commission, s.payeeAmount, s.houseAmount, s.referrerAmount, s.facilitatorAmount
        );

        _autoSettle(referrer, s.referrerAmount);
    }

    /// @notice Settle N charges in one transaction. One pull, warmed storage.
    /// @dev This is the path that makes sub-cent pricing economic.
    function chargeBatch(ChargeInput[] calldata items) external nonReentrant returns (bytes32[] memory ids) {
        uint256 n = items.length;
        require(n > 0 && n <= 100, "batch size");
        ids = new bytes32[](n);

        uint256 totalGross;
        for (uint256 i = 0; i < n; i++) {
            _checkChannel(items[i].channel, items[i].payee, items[i].gross);
            totalGross += items[i].gross;
        }
        _safeTransferFrom(msg.sender, address(this), totalGross);

        for (uint256 i = 0; i < n; i++) {
            ChargeInput calldata it = items[i];
            Split memory s = _split(it.channel, it.gross, it.referrer);

            if (s.payeeAmount > 0) _safeTransfer(it.payee, s.payeeAmount);
            _accrue(it.channel, it.referrer, it.gross, s);

            ids[i] = keccak256(abi.encodePacked(msg.sender, it.payee, it.gross, globalStats.ops, i));
            emit Charged(
                ids[i], it.channel, msg.sender, it.payee, it.referrer,
                it.gross, s.commission, s.payeeAmount, s.houseAmount, s.referrerAmount, s.facilitatorAmount
            );
        }

        if (houseAccrued >= HOUSE_WITHDRAW_MIN) _withdrawHouse();
    }

    struct Split {
        uint256 commission;
        uint256 payeeAmount;
        uint256 houseAmount;
        uint256 referrerAmount;
        uint256 facilitatorAmount;
    }

    function _split(uint8 ch, uint256 gross, address referrer) internal view returns (Split memory s) {
        s.commission       = (gross * (_chan[ch] & 0xFFFF)) / 10000;
        s.payeeAmount      = gross - s.commission;
        s.facilitatorAmount = (s.commission * FACILITATOR_BPS) / 10000;
        uint256 distributable = s.commission - s.facilitatorAmount;

        if (referrer == address(0)) {
            s.houseAmount    = distributable;
            s.referrerAmount = 0;
        } else {
            s.houseAmount    = (distributable * HOUSE_SHARE_BPS) / 10000;
            s.referrerAmount = distributable - s.houseAmount;
        }
    }

    function _accrue(uint8 ch, address referrer, uint256 gross, Split memory s) internal {
        if (s.houseAmount > 0)       houseAccrued       += s.houseAmount;
        if (s.facilitatorAmount > 0) facilitatorAccrued += s.facilitatorAmount;
        if (s.referrerAmount > 0 && referrer != address(0)) {
            referrerAccrued[referrer] += s.referrerAmount;
            totalReferrerAccrued      += s.referrerAmount;
        }

        Stats storage cs = channelStats[ch];
        cs.gross      += uint96(gross);
        cs.commission += uint96(s.commission);
        cs.ops        += 1;

        Stats storage gs = globalStats;
        gs.gross      += uint96(gross);
        gs.commission += uint96(s.commission);
        gs.ops        += 1;
    }

    function _autoSettle(address referrer, uint256 referrerAmount) internal {
        if (houseAccrued >= HOUSE_WITHDRAW_MIN) _withdrawHouse();
        if (referrerAmount > 0 && referrer != address(0) && referrerAccrued[referrer] >= REFERRER_PAYOUT_MIN) {
            _payReferrer(referrer);
        }
    }

    function _checkChannel(uint8 ch, address payee, uint256 gross) internal view {
        uint256 cfg = _chan[ch];
        require(cfg & (1 << 16) != 0, "channel inactive");
        require(gross > 0, "gross=0");
        require(payee != address(0) && payee != address(this), "bad payee");
    }

    // ---------------------------------------------------------------
    // Payouts — each touches only its own ledger
    // ---------------------------------------------------------------
    function withdrawHouse() external nonReentrant returns (uint256) { return _withdrawHouse(); }

    function _withdrawHouse() internal returns (uint256 amount) {
        amount = houseAccrued;
        require(amount > 0, "house=0");
        houseAccrued = 0;
        _safeTransfer(houseWallet, amount);
        emit HouseWithdrawn(houseWallet, amount);
    }

    function withdrawFacilitator() external nonReentrant returns (uint256 amount) {
        amount = facilitatorAccrued;
        require(amount > 0, "facilitator=0");
        facilitatorAccrued = 0;
        _safeTransfer(treasury, amount);
        emit FacilitatorWithdrawn(treasury, amount);
    }

    function payReferrer(address referrer) external nonReentrant returns (uint256) {
        return _payReferrer(referrer);
    }

    function _payReferrer(address referrer) internal returns (uint256 amount) {
        amount = referrerAccrued[referrer];
        require(amount > 0, "referrer=0");
        referrerAccrued[referrer] = 0;
        totalReferrerAccrued     -= amount;
        referrerPaid[referrer]   += amount;
        _safeTransfer(referrer, amount);
        emit ReferrerPaid(referrer, amount);
    }

    function batchPayReferrers(address[] calldata referrers) external nonReentrant {
        for (uint256 i = 0; i < referrers.length; i++) {
            if (referrerAccrued[referrers[i]] > 0) _payReferrer(referrers[i]);
        }
    }

    // ---------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------
    function setHouseWallet(address next) external onlyOwner {
        require(next != address(0), "house=0");
        emit HouseWalletChanged(houseWallet, next);
        houseWallet = next;
    }

    function setTreasury(address next) external onlyOwner {
        require(next != address(0), "treasury=0");
        emit TreasuryChanged(treasury, next);
        treasury = next;
    }

    function setChannel(Channel ch, uint16 commissionBps, bool active) external onlyOwner {
        _set(ch, commissionBps, active);
    }

    /// @notice Rescue only tokens beyond every ledger. Cannot touch owed funds.
    function rescueSurplus(address to) external onlyOwner nonReentrant {
        require(to != address(0), "to=0");
        uint256 accounted = houseAccrued + facilitatorAccrued + totalReferrerAccrued;
        uint256 bal = token.balanceOf(address(this));
        require(bal > accounted, "no surplus");
        uint256 surplus = bal - accounted;
        _safeTransfer(to, surplus);
        emit SurplusRescued(to, surplus);
    }

    // ---------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------
    function accountedBalance() external view returns (uint256) {
        return houseAccrued + facilitatorAccrued + totalReferrerAccrued;
    }

    function contractBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function getChannel(uint8 ch) external view returns (uint16 commissionBps, bool active) {
        uint256 cfg = _chan[ch];
        return (uint16(cfg & 0xFFFF), cfg & (1 << 16) != 0);
    }

    function channelName(uint8 ch) public pure returns (string memory) {
        if (ch == 0) return "x402 Data Marketplace";
        if (ch == 1) return "Unclaimed Property";
        if (ch == 2) return "Escrow Release";
        if (ch == 3) return "Subscription Recovery";
        if (ch == 4) return "Loyalty Conversion";
        if (ch == 5) return "Insurance Claims";
        if (ch == 6) return "Remittance Corridor";
        if (ch == 7) return "Tax Refund";
        if (ch == 8) return "Crowdfunding Withdraw";
        if (ch == 9) return "Class Action";
        return "Unknown";
    }

    function previewCharge(Channel ch, uint256 gross, bool hasReferrer)
        external view
        returns (uint256 payeeAmount, uint256 houseAmount, uint256 referrerAmount, uint256 facilitatorAmount)
    {
        Split memory s = _split(uint8(ch), gross, hasReferrer ? address(1) : address(0));
        return (s.payeeAmount, s.houseAmount, s.referrerAmount, s.facilitatorAmount);
    }

    // ---------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------
    function _safeTransfer(address to, uint256 amount) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
    }

    function _safeTransferFrom(address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transferFrom failed");
    }

    modifier nonReentrant() {
        require(!_locked, "reentrant");
        _locked = true;
        _;
        _locked = false;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }
}
