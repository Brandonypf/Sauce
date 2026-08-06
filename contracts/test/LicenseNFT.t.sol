// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {ContentRegistry} from "../src/ContentRegistry.sol";
import {RoyaltyManager} from "../src/RoyaltyManager.sol";
import {LicenseNFT} from "../src/LicenseNFT.sol";

contract LicenseNFTTest is Test {
    CreatorRegistry creatorRegistry;
    ContentRegistry contentRegistry;
    RoyaltyManager royaltyManager;
    LicenseNFT licenseNFT;

    address creator = address(0x1234);
    address buyer = address(0x5678);
    address platform = address(0x9999);

    function setUp() public {
        creatorRegistry = new CreatorRegistry();

        contentRegistry = new ContentRegistry(address(creatorRegistry));

        royaltyManager = new RoyaltyManager(platform);

        licenseNFT = new LicenseNFT(
            address(contentRegistry),
            address(royaltyManager)
        );

        vm.prank(creator);

        creatorRegistry.registerCreator(
            "Manga Studio",
            "ipfs://creator"
        );

        vm.prank(creator);

        contentRegistry.registerContent(
            "Capitulo 1",
            "ipfs://chapter1",
            keccak256(abi.encodePacked("chapter-file")),
            0.01 ether
        );
    }


    function testBuyLicense() public {
        vm.deal(buyer, 1 ether);

        uint256 creatorBalanceBefore = creator.balance;

        vm.prank(buyer);

        licenseNFT.buyLicense{value:0.01 ether}(1);

        bool hasLicense = licenseNFT.hasLicense(buyer,1);

        assertTrue(hasLicense);

        assertEq(
            licenseNFT.balanceOf(buyer,1),
            1
        );

        uint256 creatorReceived =
            creator.balance - creatorBalanceBefore;

        assertEq(
            creatorReceived,
            0.0095 ether
        );
    }


    function testCannotBuyWithoutEnoughETH() public {
        vm.deal(buyer,1 ether);

        vm.prank(buyer);

        vm.expectRevert("Insufficient payment");

        licenseNFT.buyLicense{value:0.001 ether}(1);
    }


    function testTransferLicense() public {
        vm.deal(buyer,1 ether);

        address receiver = address(0x7777);

        vm.prank(buyer);

        licenseNFT.buyLicense{value:0.01 ether}(1);

        assertEq(
            licenseNFT.balanceOf(buyer,1),
            1
        );

        vm.prank(buyer);

        licenseNFT.safeTransferFrom(
            buyer,
            receiver,
            1,
            1,
            ""
        );

        assertEq(
            licenseNFT.balanceOf(buyer,1),
            0
        );

        assertEq(
            licenseNFT.balanceOf(receiver,1),
            1
        );
    }


    function testRoyaltyDistributionToPlatform() public {
        vm.deal(buyer,1 ether);

        uint256 platformBefore = platform.balance;

        vm.prank(buyer);

        licenseNFT.buyLicense{value:0.01 ether}(1);

        uint256 platformReceived =
            platform.balance - platformBefore;

        assertEq(
            platformReceived,
            0.0005 ether
        );
    }




    function testCannotBuyInactiveOrUnknownContent() public {
        vm.deal(buyer, 1 ether);

        vm.prank(buyer);

        vm.expectRevert("Content not active");

        licenseNFT.buyLicense{value:0.01 ether}(999);
    }


    function testLicensePurchasedEvent() public {
        vm.deal(buyer, 1 ether);

        vm.expectEmit(true, true, false, true);

        emit LicenseNFT.LicensePurchased(
            buyer,
            1,
            0.01 ether
        );

        vm.prank(buyer);

        licenseNFT.buyLicense{value:0.01 ether}(1);
    }


    function testRefundExcessPayment() public {
        vm.deal(buyer, 1 ether);

        uint256 buyerBefore = buyer.balance;

        vm.prank(buyer);

        licenseNFT.buyLicense{value:1 ether}(1);

        uint256 buyerAfter = buyer.balance;

        assertEq(
            buyerBefore - buyerAfter,
            0.01 ether
        );
    }


    function testCannotReenterDuringRefund() public {

        RefundAttacker attacker =
            new RefundAttacker(address(licenseNFT));

        vm.deal(address(attacker), 1 ether);

        vm.prank(address(attacker));

        licenseNFT.buyLicense{value:1 ether}(1);

        assertEq(
            licenseNFT.balanceOf(address(attacker),1),
            1
        );

        assertTrue(
            attacker.attacked()
        );
    }

}


contract RefundAttacker {

    LicenseNFT public licenseNFT;

    bool public attacked;

    constructor(address _licenseNFT) {
        licenseNFT = LicenseNFT(_licenseNFT);
    }


    receive() external payable {

        if (!attacked) {

            attacked = true;

            try licenseNFT.buyLicense{value:1 ether}(1) {

            } catch {

            }
        }
    }


    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {

        return 0xf23a6e61;
    }
}
