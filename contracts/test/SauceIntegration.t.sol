// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {ContentRegistry} from "../src/ContentRegistry.sol";
import {RoyaltyManager} from "../src/RoyaltyManager.sol";
import {LicenseNFT} from "../src/LicenseNFT.sol";


contract SauceIntegrationTest is Test {

    CreatorRegistry creatorRegistry;
    ContentRegistry contentRegistry;
    RoyaltyManager royaltyManager;
    LicenseNFT licenseNFT;


    address creator = address(0x1111);
    address buyer = address(0x2222);
    address platform = address(0x3333);


    function setUp() public {

        creatorRegistry = new CreatorRegistry();

        contentRegistry =
            new ContentRegistry(address(creatorRegistry));

        royaltyManager =
            new RoyaltyManager(platform);

        licenseNFT =
            new LicenseNFT(
                address(contentRegistry),
                address(royaltyManager)
            );


        vm.prank(creator);

        creatorRegistry.registerCreator(
            "Sauce Creator",
            "ipfs://creator"
        );


        vm.prank(creator);

        contentRegistry.registerContent(
            "Digital Artwork",
            "ipfs://content",
            keccak256(
                abi.encodePacked("content-file")
            ),
            0.01 ether
        );
    }


    function testCompleteSauceFlow() public {

        vm.deal(buyer, 1 ether);


        uint256 creatorBefore =
            creator.balance;

        uint256 platformBefore =
            platform.balance;


        vm.prank(buyer);

        licenseNFT.buyLicense{value:0.01 ether}(1);


        assertTrue(
            licenseNFT.hasLicense(
                buyer,
                1
            )
        );


        assertEq(
            licenseNFT.balanceOf(
                buyer,
                1
            ),
            1
        );


        uint256 creatorReceived =
            creator.balance - creatorBefore;


        uint256 platformReceived =
            platform.balance - platformBefore;


        assertEq(
            creatorReceived,
            0.0095 ether
        );


        assertEq(
            platformReceived,
            0.0005 ether
        );
    }
}
