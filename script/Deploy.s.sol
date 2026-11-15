// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {AutoTaskerPaymentRouter} from "../contracts/AutoTaskerPaymentRouter.sol";

/**
 * @notice Deploy script with testnet verification
 * Usage: forge script script/Deploy.s.sol --rpc-url qday-testnet --broadcast
 */
contract Deploy is Script {
    address constant TUSD8_ADDRESS = 0x456569838f1d43009A91ebA4263147Afd7233483;
    
    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        
        // Verify we're on the right chain
        (uint256 chainId,) = staticcall(address(0x446), "");
        require(chainId == 44005, "Must be on QDay Aevum testnet");
        
        vm.startBroadcast(deployerPk);
        
        AutoTaskerPaymentRouter router = new AutoTaskerPaymentRouter(TUSD8_ADDRESS);
        
        console.log("========================================");
        console.log("AutoTaskerPaymentRouter Deployed!");
        console.log("========================================");
        console.log("Address:", address(router));
        console.log("tUSD8:  ", TUSD8_ADDRESS);
        console.log("Chain:   QDay Aevum Testnet (44005)");
        console.log("Explorer:", "https://explorer-test.qday.info/address/" + address(router));
        console.log("========================================");
        
        vm.stopBroadcast();
    }
    
    // Helper: get chain ID via static call
    function staticcall(address target, bytes memory data) internal view returns (uint256, bytes memory) {
        (bool success, bytes memory result) = target.staticcall(data);
        require(success, "Static call failed");
        return (abi.decode(result, (uint256)), result);
    }
}
