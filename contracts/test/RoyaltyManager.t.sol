// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RoyaltyManager} from "../src/RoyaltyManager.sol";

contract RoyaltyManagerTest is Test {
    RoyaltyManager royaltyManager;

    address payable creator = payable(address(0x1234));

    address platform = address(0x5678);

    function setUp() public {
        royaltyManager = new RoyaltyManager(platform);
    }

    function testRoyaltyDistribution() public {
        uint256 creatorBalanceBefore = creator.balance;

        uint256 platformBalanceBefore = platform.balance;

        uint256 payment = 1 ether;

        vm.deal(address(this), payment);

        royaltyManager.distributeRoyalty{value: payment}(creator);

        uint256 creatorReceived = creator.balance - creatorBalanceBefore;

        uint256 platformReceived = platform.balance - platformBalanceBefore;

        assertEq(creatorReceived, 0.95 ether);

        assertEq(platformReceived, 0.05 ether);
    }

    function testCannotPayZero() public {
        vm.expectRevert("No payment");

        royaltyManager.distributeRoyalty(creator);
    }
}
