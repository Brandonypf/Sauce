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


    address creator =
        address(0x1234);


    address buyer =
        address(0x5678);


    address platform =
        address(0x9999);



    function setUp() public {


        creatorRegistry =
            new CreatorRegistry();



        contentRegistry =
            new ContentRegistry(
                address(creatorRegistry)
            );



        royaltyManager =
            new RoyaltyManager(
                platform
            );



        licenseNFT =
            new LicenseNFT(
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
            keccak256(
                abi.encodePacked(
                    "chapter-file"
                )
            ),
            0.01 ether
        );
    }



    function testBuyLicense()
        public
    {


        vm.deal(
            buyer,
            1 ether
        );


        uint256 creatorBalanceBefore =
            creator.balance;



        vm.prank(buyer);


        licenseNFT.buyLicense{
            value: 0.01 ether
        }(
            1
        );



        bool hasLicense =
            licenseNFT.hasLicense(
                buyer,
                1
            );


        assertTrue(
            hasLicense
        );



        assertEq(
            licenseNFT.balanceOf(
                buyer,
                1
            ),
            1
        );



        uint256 creatorReceived =
            creator.balance -
            creatorBalanceBefore;



        assertEq(
            creatorReceived,
            0.0095 ether
        );
    }




    function testCannotBuyWithoutEnoughETH()
        public
    {


        vm.deal(
            buyer,
            1 ether
        );



        vm.prank(buyer);



        vm.expectRevert(
            "Insufficient payment"
        );



        licenseNFT.buyLicense{
            value: 0.001 ether
        }(
            1
        );
    }

}