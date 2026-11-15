// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {AutoTaskerPaymentRouterV2} from "../src/AutoTaskerPaymentRouterV2.sol";
import {MockTUSD8} from "./MockTUSD8.sol";

contract AutoTaskerPaymentRouterV2Test is Test {
    AutoTaskerPaymentRouterV2 public router;
    MockTUSD8 public tusd8;
    
    address public owner = address(0xDEAD);
    address public houseWallet = address(0xBEEF);
    address public agentA = address(0xA110C);
    address public agentB = address(0xA110D);
    address public provider = address(0xPRO);
    
    uint256 public constant BALANCE = 10_000_000 ether; // 10M USDC
    
    function setUp() public {
        vm.startPrank(owner);
        
        tusd8 = new MockTUSD8();
        router = new AutoTaskerPaymentRouterV2(address(tusd8), houseWallet);
        
        tusd8.mint(agentA, BALANCE);
        tusd8.mint(agentB, BALANCE);
        
        vm.stopPrank();
    }
    
    function testDeployment() public {
        assertEq(address(router.tUSD8()), address(tusd8));
        assertEq(router.owner(), owner);
        assertEq(router.houseWallet(), houseWallet);
        assertEq(router.HOTLIST_PRICE(), 50_000);
        assertEq(router.HOUSE_CUT_BPS(), 9000);
        assertEq(router.REFERREER_CUT_BPS(), 1000);
        assertEq(router.FACILITATOR_FEE_BPS(), 50);
    }
    
    function testHouseRevenueAccumulation() public {
        vm.startPrank(agentA);
        tusd8.approve(address(router), 50_000);
        
        bytes32 rid = router.submitPayment("hotlist", provider, 60, address(0));
        
        // Fulfill
        router.fulfillRequest(rid, provider);
        
        // House should receive 90% minus 50bps
        uint256 expectedHouse = (50_000 * 9000) / 10000 - ((50_000 * 9000) / 10000 * 50) / 10000;
        assertEq(tusd8.balanceOf(houseWallet), expectedHouse, "House wallet incorrect");
        assertEq(router.houseAccumulated(), expectedHouse, "House accumulated incorrect");
        
        vm.stopPrank();
    }
    
    function testReferrerCommission() public {
        vm.startPrank(agentB);
        tusd8.approve(address(router), 50_000);
        
        bytes32 rid = router.submitPayment("hotlist", provider, 60, agentA); // agentA is referrer
        
        router.fulfillRequest(rid, provider);
        
        // AgentA should have 10% pending
        (uint256 pending, uint256 total, uint256 count, bool paidOut) = router.getReferrerStats(agentA);
        assertEq(pending, 5_000, "Referrer pending incorrect");
        assertEq(total, 5_000, "Referrer total incorrect");
        assertEq(count, 1, "Referrer count incorrect");
        
        vm.stopPrank();
    }
    
    function testAutoPayoutWhenThresholdReached() public {
        vm.startPrank(agentB);
        tusd8.approve(address(router), 50_000);
        
        // Submit multiple payments to reach threshold
        for (uint i = 0; i < 5; i++) {
            bytes32 rid = router.submitPayment("hotlist", provider, 60, agentA);
            router.fulfillRequest(rid, provider);
        }
        
        // After 5 payments × $0.05 × 10% = $0.25, should auto-payout
        (, uint256 total, , bool paidOut) = router.getReferrerStats(agentA);
        assertTrue(paidOut, "Should have auto-paid out");
        assertEq(total, 25_000, "Total earned should be 25000");
        
        vm.stopPrank();
    }
    
    function testAutoWithdrawToHouse() public {
        vm.startPrank(agentA);
        tusd8.approve(address(router), 50_000);
        
        // 200 payments × $0.05 × 90% = $9.00 → exceeds $10 threshold? No, let's do more
        // Actually AUTO_WITHDRAW_THRESHOLD = 10_000_000 = $10
        // Each payment nets house ~$0.0448
        // Need ~224 payments to hit $10
        uint256 needed = (10_000_000 + 44_799) / 44_799; // ceiling division
        
        for (uint i = 0; i < needed; i++) {
            bytes32 rid = router.submitPayment("hotlist", provider, 60, address(0));
            router.fulfillRequest(rid, provider);
        }
        
        // House accumulated should have been auto-withdrawn
        assertEq(router.houseAccumulated(), 0, "Should be auto-withdrawn");
        assertEq(tusd8.balanceOf(houseWallet), 10_000_000, "House should have $10");
        
        vm.stopPrank();
    }
    
    function testDashboard() public {
        vm.startPrank(agentA);
        tusd8.approve(address(router), 50_000);
        
        bytes32 rid = router.submitPayment("hotlist", provider, 60, address(0));
        router.fulfillRequest(rid, provider);
        
        vm.stopPrank();
        
        (uint256 vol, uint256 houseRev, uint256 refPayouts, uint256 contractBal, uint256 houseAcc, uint256 reqCount) = router.getDashboard();
        
        assertEq(vol, 50_000, "Volume wrong");
        assertEq(houseRev, (50_000 * 9000) / 10000 - ((50_000 * 9000) / 10000 * 50) / 10000, "House rev wrong");
        assertEq(reqCount, 1, "Request count wrong");
    }
    
    function testWithdrawHouse() public {
        vm.startPrank(agentA);
        tusd8.approve(address(router), 50_000);
        bytes32 rid = router.submitPayment("hotlist", provider, 60, address(0));
        router.fulfillRequest(rid, provider);
        vm.stopPrank();
        
        uint256 before = tusd8.balanceOf(houseWallet);
        
        vm.startPrank(owner);
        router.withdrawHouse(router.houseAccumulated());
        vm.stopPrank();
        
        assertEq(tusd8.balanceOf(houseWallet), before + (50_000 * 9000) / 10000 - ((50_000 * 9000) / 10000 * 50) / 10000, "Withdraw failed");
        assertEq(router.houseAccumulated(), 0, "Should be zeroed");
    }
    
    function testUnauthorized() public {
        vm.startPrank(agentA);
        vm.expectRevert(AutoTaskerPaymentRouterV2.Unauthorized.selector);
        router.withdrawHouse(1_000_000);
        vm.stopPrank();
    }
}
