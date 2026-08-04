// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";

contract CreatorRegistryTest is Test {
    CreatorRegistry creatorRegistry;

    address creator = address(0xA11CE);

    function setUp() public {
        creatorRegistry = new CreatorRegistry();
    }

    function testRegisterCreator() public {
        vm.prank(creator);

        creatorRegistry.registerCreator("Brandon", "ipfs://creator-profile");

        bool isRegistered = creatorRegistry.isRegisteredCreator(creator);

        assertTrue(isRegistered);
    }
}
