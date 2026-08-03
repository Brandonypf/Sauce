// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {ContentRegistry} from "../src/ContentRegistry.sol";


contract ContentRegistryTest is Test {

    CreatorRegistry creatorRegistry;
    ContentRegistry contentRegistry;

    address creator = address(0x1234);
    address user = address(0x5678);


    function setUp() public {

        creatorRegistry = new CreatorRegistry();

        contentRegistry =
            new ContentRegistry(
                address(creatorRegistry)
            );


        vm.prank(creator);

        creatorRegistry.registerCreator(
            "Creator Test",
            "ipfs://profile"
        );
    }


    function testRegisteredCreatorCanCreateContent()
        public
    {

        vm.prank(creator);

        uint256 contentId =
            contentRegistry.registerContent(
                "Manga Capitulo 1",
                "ipfs://metadata",
                keccak256(
                    abi.encodePacked(
                        "chapter-file"
                    )
                ),
                0.001 ether
            );


        assertEq(
            contentId,
            1
        );


        ContentRegistry.Content memory content =
            contentRegistry.getContent(
                contentId
            );


        assertEq(
            content.creator,
            creator
        );


        assertEq(
            content.title,
            "Manga Capitulo 1"
        );


        assertEq(
            content.price,
            0.001 ether
        );
    }



    function testUnregisteredUserCannotCreateContent()
        public
    {

        vm.prank(user);


        vm.expectRevert(
            "Creator not registered"
        );


        contentRegistry.registerContent(
            "Contenido ilegal",
            "ipfs://fake",
            keccak256(
                abi.encodePacked(
                    "fake"
                )
            ),
            0.001 ether
        );
    }


    function testUpdateContent()
        public
    {

        vm.startPrank(creator);


        uint256 contentId =
            contentRegistry.registerContent(
                "Novela Capitulo 1",
                "ipfs://old",
                keccak256(
                    abi.encodePacked(
                        "novel"
                    )
                ),
                0.002 ether
            );


        contentRegistry.updateContent(
            contentId,
            "ipfs://new",
            0.003 ether
        );


        ContentRegistry.Content memory content =
            contentRegistry.getContent(
                contentId
            );


        assertEq(
            content.metadataURI,
            "ipfs://new"
        );


        assertEq(
            content.price,
            0.003 ether
        );


        vm.stopPrank();
    }
}