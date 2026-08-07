// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {ContentRegistry} from "../src/ContentRegistry.sol";

contract ContentRegistryTest is Test {
    CreatorRegistry internal creators;
    ContentRegistry internal contents;

    address internal admin = address(0xA11CE);
    address internal creator = address(0xBEEF);
    address internal stranger = address(0xDEAD);

    bytes32 internal constant HASH_A = keccak256("obra-a");

    function setUp() public {
        creators = new CreatorRegistry(admin);
        contents = new ContentRegistry(address(creators));

        vm.prank(creator);
        creators.registerCreator("Nekomori", "ipfs://profile", address(0));
    }

    function _publish() internal returns (uint256) {
        vm.prank(creator);
        return contents.registerContent("Hoshizora", "ipfs://meta", HASH_A, 10e6);
    }

    function testRegisterContent() public {
        uint256 id = _publish();

        ContentRegistry.Content memory content = contents.getContent(id);
        assertEq(content.creator, creator);
        assertEq(content.contentHash, HASH_A);
        assertTrue(content.active);
        assertEq(contents.contentIdByHash(HASH_A), id);
    }

    function testUnregisteredCreatorCannotPublish() public {
        vm.prank(stranger);
        vm.expectRevert(ContentRegistry.CreatorNotRegistered.selector);
        contents.registerContent("Robo", "ipfs://meta", keccak256("otra"), 1e6);
    }

    function testDuplicateHashRejected() public {
        uint256 id = _publish();

        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(ContentRegistry.DuplicateContentHash.selector, id));
        contents.registerContent("Copia", "ipfs://meta2", HASH_A, 1e6);
    }

    /// @dev El bug original: getContent revertia para contenido inactivo, asi que una
    ///      licencia historica no podia resolver su metadata tras un takedown.
    function testInactiveContentStillReadable() public {
        uint256 id = _publish();

        vm.prank(creator);
        contents.setContentActive(id, false);

        assertFalse(contents.isActive(id));
        assertTrue(contents.exists(id));
        assertEq(contents.getContent(id).creator, creator);
        assertEq(contents.metadataURIOf(id), "ipfs://meta");
    }

    function testOnlyOwnerCanUpdate() public {
        uint256 id = _publish();

        vm.prank(stranger);
        vm.expectRevert(ContentRegistry.NotContentOwner.selector);
        contents.updateContent(id, "ipfs://hack", 0);
    }
}
