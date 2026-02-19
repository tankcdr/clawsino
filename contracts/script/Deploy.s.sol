// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ClawsinoPayout} from "../src/ClawsinoPayout.sol";
import {FairnessVerifier} from "../src/FairnessVerifier.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address gameServer = vm.envAddress("GAME_SERVER_ADDRESS");
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));

        vm.startBroadcast(deployerKey);

        // Deploy MockUSDC if no address provided (local dev)
        if (usdcAddress == address(0)) {
            MockUSDC mockUsdc = new MockUSDC();
            usdcAddress = address(mockUsdc);
            console.log("MockUSDC deployed:", usdcAddress);

            // Mint initial supply to deployer
            mockUsdc.mint(vm.addr(deployerKey), 1_000_000e6);
            console.log("Minted 1M USDC to deployer");
        }

        ClawsinoPayout payout = new ClawsinoPayout(usdcAddress, gameServer);
        console.log("ClawsinoPayout deployed:", address(payout));

        FairnessVerifier verifier = new FairnessVerifier();
        console.log("FairnessVerifier deployed:", address(verifier));

        vm.stopBroadcast();
    }
}
