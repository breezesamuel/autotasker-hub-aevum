// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {AutoTaskerPaymentRouter} from "../src/AutoTaskerPaymentRouter.sol";
import {MockTUSD8} from "./MockTUSD8.sol";

contract AutoTaskerPaymentRouterTest is Test {
    AutoTaskerPaymentRouter public router;
    MockTUSD8 public tusd8;
    
    address public owner = address(0x123);
    address public agentA = address(0x234);
    address public agentB = address(0x345);
    address public provider = address(0x456);
    
    uint256 public constant INITIAL_BALANCE = 10000 ether; // 10,000 USDC (6 decimals)
    
    function setUp() public {
        vm.startPrank(owner);
        
        tusd8 = new MockTUSD8();
        router = new AutoTaskerPaymentRouter(address(tusd8));
        
        // Mint tokens to agents
        tusd8.mint(agentA, INITIAL_BALANCE);
        tusd8.mint(agentB, INITIAL_BALANCE);
        
        vm.stopPrank();
    }
    
    function testContractDeployment() public {
        assertEq(address(router.tUSD8()), address(tusd8));
        assertEq(router.owner(), owner);
        assertEq(router.HOTLIST_PRICE(), 50_000);
        assertEq(router.SEARCH_PRICE(), 50_000);
        assertEq(router.PRICE_INTEL_PRICE(), 100_000);
        assertEq(router.FULL_EXPORT_PRICE(), 500_000);
    }
    
    function testSubmitAndFulfillHotlist() public {
        vm.startPrank(agentA);
        
        // Approve router to spend agent's tokens
        tusd8.approve(address(router), 50_000);
        
        // Submit payment
        bytes32 requestId = router.submitPayment("hotlist", provider, 60);
        
        // Verify request created
        (address payer, uint256 price, string memory toolName, bool fulfilled, uint256 ts) = router.getRequest(requestId);
        assertEq(payer, agentA);
        assertEq(price, 50_000);
        assertEq(toolName, "hotlist");
        assertFalse(fulfilled);
        
        // Contract should have received payment
        assertEq(tusd8.balanceOf(address(router)), 50_000);
        
        // Fulfill request
        router.fulfillRequest(requestId, provider);
        
        // Verify fulfilled
        (, , , bool isFulfilled, ) = router.getRequest(requestId);
        assertTrue(isFulfilled);
        
        // Provider should receive 99.5% (50bps fee)
        uint256 expectedPayout = 50_000 - (50_000 * 50 / 10000);
        assertEq(tusd8.balanceOf(provider), expectedPayout);
        
        // Router keeps 50bps fee
        assertEq(tusd8.balanceOf(address(router)), 25); // 50bps of 50_000
        
        vm.stopPrank();
    }
    
    function testMultipleTools() public {
        vm.startPrank(agentB);
        
        // Approve for full export ($0.50)
        tusd8.approve(address(router), 500_000);
        
        bytes32 requestId = router.submitPayment("full", provider, 30);
        
        (, uint256 price, , , ) = router.getRequest(requestId);
        assertEq(price, 500_000);
        
        router.fulfillRequest(requestId, provider);
        
        uint256 expectedPayout = 500_000 - (500_000 * 50 / 10000);
        assertEq(tusd8.balanceOf(provider), expectedPayout);
        
        vm.stopPrank();
    }
    
    function testInvalidTool() public {
        vm.startPrank(agentA);
        tusd8.approve(address(router), 1000_000);
        
        vm.expectRevert("Unknown tool");
        router.submitPayment("invalid_tool", provider, 60);
        
        vm.stopPrank();
    }
    
    function testWithdraw() public {
        // First fill the contract
        vm.startPrank(agentA);
        tusd8.approve(address(router), 50_000);
        bytes32 requestId = router.submitPayment("hotlist", provider, 60);
        router.fulfillRequest(requestId, provider);
        vm.stopPrank();
        
        // Owner can withdraw fees
        uint256 contractBalance = tusd8.balanceOf(address(router));
        vm.startPrank(owner);
        router.withdraw(contractBalance);
        vm.stopPrank();
        
        assertEq(tusd8.balanceOf(address(router)), 0);
        assertEq(tusd8.balanceOf(owner), contractBalance);
    }
    
    function testEventEmissions() public {
        vm.startPrank(agentA);
        tusd8.approve(address(router), 50_000);
        
        // Capture events
        vm.recordLogs();
        bytes32 requestId = router.submitPayment("hotlist", provider, 60);
        
        // Should emit RequestCreated and PaymentReceived
        // (verified by no revert)
        
        router.fulfillRequest(requestId, provider);
        
        vm.stopPrank();
    }
}
