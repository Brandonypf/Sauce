// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {ContentRegistry} from "../src/ContentRegistry.sol";
import {RoyaltyManager} from "../src/RoyaltyManager.sol";
import {LicenseNFT} from "../src/LicenseNFT.sol";

contract Deploy is Script {
    function run()
        external
        returns (
            CreatorRegistry creatorRegistry,
            ContentRegistry contentRegistry,
            RoyaltyManager royaltyManager,
            LicenseNFT licenseNFT
        )
    {
        vm.startBroadcast();

        creatorRegistry = new CreatorRegistry();

        contentRegistry = new ContentRegistry(address(creatorRegistry));

        royaltyManager = new RoyaltyManager(msg.sender);

        licenseNFT = new LicenseNFT(address(contentRegistry), address(royaltyManager));

        vm.stopBroadcast();
    }
}
