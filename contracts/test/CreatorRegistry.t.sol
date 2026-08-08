// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";

contract CreatorRegistryTest is Test {
    CreatorRegistry internal registry;

    address internal admin = address(0xA11CE);
    address internal creator = address(0xBEEF);
    address internal coldWallet = address(0xC01D);

    function setUp() public {
        registry = new CreatorRegistry(admin);
    }

    function testRegisterDefaultsPayoutToSender() public {
        vm.prank(creator);
        registry.registerCreator("Nekomori", "ipfs://profile", address(0));

        assertTrue(registry.isRegisteredCreator(creator));
        assertEq(registry.payoutOf(creator), creator);
    }

    function testRegisterWithSeparatePayout() public {
        vm.prank(creator);
        registry.registerCreator("Nekomori", "ipfs://profile", coldWallet);

        assertEq(registry.payoutOf(creator), coldWallet);
    }

    function testCannotRegisterTwice() public {
        vm.startPrank(creator);
        registry.registerCreator("Nekomori", "ipfs://profile", address(0));

        vm.expectRevert(CreatorRegistry.AlreadyRegistered.selector);
        registry.registerCreator("Nekomori 2", "ipfs://profile2", address(0));
        vm.stopPrank();
    }

    function testUpdatePayoutKeepsIdentity() public {
        vm.startPrank(creator);
        registry.registerCreator("Nekomori", "ipfs://profile", address(0));
        registry.updatePayout(coldWallet);
        vm.stopPrank();

        assertEq(registry.payoutOf(creator), coldWallet);
        assertTrue(registry.isRegisteredCreator(creator));
    }

    /// @dev El bug original: CreatorStatusChanged existia pero nada podia emitirlo.
    function testCuratorCanSuspendAndReactivate() public {
        vm.prank(creator);
        registry.registerCreator("Nekomori", "ipfs://profile", address(0));

        vm.prank(admin);
        registry.setCreatorActive(creator, false);
        assertFalse(registry.isRegisteredCreator(creator));

        vm.prank(admin);
        registry.setCreatorActive(creator, true);
        assertTrue(registry.isRegisteredCreator(creator));
    }

    function testSuspendedCreatorCannotReRegister() public {
        vm.prank(creator);
        registry.registerCreator("Nekomori", "ipfs://profile", address(0));

        vm.prank(admin);
        registry.setCreatorActive(creator, false);

        vm.prank(creator);
        vm.expectRevert(CreatorRegistry.AlreadyRegistered.selector);
        registry.registerCreator("Nekomori", "ipfs://profile", address(0));
    }

    function testNonCuratorCannotSuspend() public {
        vm.prank(creator);
        registry.registerCreator("Nekomori", "ipfs://profile", address(0));

        vm.prank(address(0xDEAD));
        vm.expectRevert();
        registry.setCreatorActive(creator, false);
    }
}
