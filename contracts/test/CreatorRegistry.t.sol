// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";

contract CreatorRegistryTest is Test {
    CreatorRegistry creatorRegistry;

    address creator = address(0xA11CE);
    address otherUser = address(0xB0B);

    function setUp() public {
        creatorRegistry = new CreatorRegistry();
    }

    function testRegisterCreator() public {
        vm.prank(creator);

        creatorRegistry.registerCreator("Brandon", "ipfs://creator-profile");

        bool isRegistered = creatorRegistry.isRegisteredCreator(creator);

        assertTrue(isRegistered);
    }

    function testRegisteredCreatorDataIsCorrect() public {
        vm.prank(creator);

        creatorRegistry.registerCreator("Brandon", "ipfs://creator-profile");

        (string memory name, string memory profileURI, uint256 registeredAt, bool active) =
            creatorRegistry.getCreator(creator);

        assertEq(name, "Brandon");

        assertEq(profileURI, "ipfs://creator-profile");

        assertGt(registeredAt, 0);

        assertTrue(active);
    }

    function testCannotRegisterTwice() public {
        vm.startPrank(creator);

        creatorRegistry.registerCreator("Brandon", "ipfs://creator-profile");

        vm.expectRevert("Creator already registered");

        creatorRegistry.registerCreator("Brandon 2", "ipfs://new-profile");

        vm.stopPrank();
    }

    function testCannotRegisterWithEmptyName() public {
        vm.prank(creator);

        vm.expectRevert("Name cannot be empty");

        creatorRegistry.registerCreator("", "ipfs://creator-profile");
    }

    function testRegisteredCreatorCanUpdateProfile() public {
        vm.startPrank(creator);

        creatorRegistry.registerCreator("Brandon", "ipfs://old-profile");

        creatorRegistry.updateProfile("Brandon Sauce", "ipfs://new-profile");

        vm.stopPrank();

        (string memory name, string memory profileURI,, bool active) = creatorRegistry.getCreator(creator);

        assertEq(name, "Brandon Sauce");

        assertEq(profileURI, "ipfs://new-profile");

        assertTrue(active);
    }

    function testUnregisteredUserCannotUpdateProfile() public {
        vm.prank(otherUser);

        vm.expectRevert("Creator not registered");

        creatorRegistry.updateProfile("Unauthorized", "ipfs://fake");
    }

    function testUnknownUserIsNotRegistered() public {
        bool isRegistered = creatorRegistry.isRegisteredCreator(otherUser);

        assertFalse(isRegistered);
    }
}
