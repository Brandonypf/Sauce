// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {ContentRegistry} from "../src/ContentRegistry.sol";
import {LicenseNFT} from "../src/LicenseNFT.sol";

contract LicenseNFTTest is Test {
    CreatorRegistry internal creators;
    ContentRegistry internal contents;
    LicenseNFT internal licenses;

    address internal admin = address(0xA11CE);
    address internal creator = address(0xBEEF);
    address internal buyer = address(0xB0B);
    address internal thief = address(0xBAD);

    uint256 internal issuerKey = 0xA11CE5;
    address internal issuer;

    uint64 internal constant WINDOW = 180 days;

    uint256 internal contentId;

    function setUp() public {
        issuer = vm.addr(issuerKey);

        creators = new CreatorRegistry(admin);
        contents = new ContentRegistry(address(creators));
        licenses = new LicenseNFT(address(contents), admin, WINDOW);

        vm.startPrank(admin);
        licenses.grantRole(licenses.ISSUER_ROLE(), issuer);
        licenses.grantRole(licenses.MINTER_ROLE(), admin);
        vm.stopPrank();

        vm.prank(creator);
        creators.registerCreator("Nekomori", "ipfs://profile", address(0));

        vm.prank(creator);
        contentId = contents.registerContent("Hoshizora", "ipfs://meta", keccak256("obra-a"), 10e6);
    }

    function _voucher(bytes32 orderId, address to) internal view returns (LicenseNFT.LicenseVoucher memory) {
        return LicenseNFT.LicenseVoucher({
            orderId: orderId, to: to, contentId: contentId, amount: 1, expiry: uint64(block.timestamp + 30 days)
        });
    }

    function _sign(LicenseNFT.LicenseVoucher memory voucher, uint256 key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, licenses.voucherDigest(voucher));
        return abi.encodePacked(r, s, v);
    }

    function testRedeemTargetedVoucher() public {
        LicenseNFT.LicenseVoucher memory voucher = _voucher(bytes32("orden-1"), buyer);
        bytes memory sig = _sign(voucher, issuerKey);

        vm.prank(buyer);
        licenses.redeem(voucher, sig);

        assertTrue(licenses.hasLicense(buyer, contentId));
        assertEq(licenses.uri(contentId), "ipfs://meta");
    }

    /// @dev La propiedad clave: un webhook duplicado de la pasarela no emite dos veces.
    function testOrderIdIsIdempotent() public {
        LicenseNFT.LicenseVoucher memory voucher = _voucher(bytes32("orden-1"), buyer);
        bytes memory sig = _sign(voucher, issuerKey);

        vm.startPrank(buyer);
        licenses.redeem(voucher, sig);

        vm.expectRevert(abi.encodeWithSelector(LicenseNFT.OrderAlreadyUsed.selector, bytes32("orden-1")));
        licenses.redeem(voucher, sig);
        vm.stopPrank();
    }

    function testTargetedVoucherCannotBeStolen() public {
        LicenseNFT.LicenseVoucher memory voucher = _voucher(bytes32("orden-1"), buyer);
        bytes memory sig = _sign(voucher, issuerKey);

        vm.prank(thief);
        vm.expectRevert(LicenseNFT.WrongRecipient.selector);
        licenses.redeem(voucher, sig);
    }

    function testBearerVoucherGoesToWhoeverRedeems() public {
        LicenseNFT.LicenseVoucher memory voucher = _voucher(bytes32("regalo-1"), address(0));
        bytes memory sig = _sign(voucher, issuerKey);

        vm.prank(thief);
        licenses.redeem(voucher, sig);

        assertTrue(licenses.hasLicense(thief, contentId));
    }

    function testForgedSignatureRejected() public {
        LicenseNFT.LicenseVoucher memory voucher = _voucher(bytes32("orden-1"), buyer);
        bytes memory sig = _sign(voucher, 0xDEADBEEF);

        vm.prank(buyer);
        vm.expectRevert(LicenseNFT.InvalidSignature.selector);
        licenses.redeem(voucher, sig);
    }

    function testTamperedVoucherRejected() public {
        LicenseNFT.LicenseVoucher memory voucher = _voucher(bytes32("orden-1"), buyer);
        bytes memory sig = _sign(voucher, issuerKey);

        voucher.amount = 100;

        vm.prank(buyer);
        vm.expectRevert(LicenseNFT.InvalidSignature.selector);
        licenses.redeem(voucher, sig);
    }

    function testExpiredVoucherRejected() public {
        LicenseNFT.LicenseVoucher memory voucher = _voucher(bytes32("orden-1"), buyer);
        bytes memory sig = _sign(voucher, issuerKey);

        vm.warp(block.timestamp + 31 days);

        vm.prank(buyer);
        vm.expectRevert(LicenseNFT.VoucherExpired.selector);
        licenses.redeem(voucher, sig);
    }

    function testRevokedIssuerCannotIssue() public {
        LicenseNFT.LicenseVoucher memory voucher = _voucher(bytes32("orden-1"), buyer);
        bytes memory sig = _sign(voucher, issuerKey);

        bytes32 issuerRole = licenses.ISSUER_ROLE();
        vm.prank(admin);
        licenses.revokeRole(issuerRole, issuer);

        vm.prank(buyer);
        vm.expectRevert(LicenseNFT.InvalidSignature.selector);
        licenses.redeem(voucher, sig);
    }

    function testMintToForEmbeddedWallet() public {
        vm.prank(admin);
        licenses.mintTo(bytes32("orden-2"), buyer, contentId, 1);

        assertTrue(licenses.hasLicense(buyer, contentId));
    }

    function testCancelVoucherBlocksRedemption() public {
        LicenseNFT.LicenseVoucher memory voucher = _voucher(bytes32("orden-1"), buyer);
        bytes memory sig = _sign(voucher, issuerKey);

        vm.prank(admin);
        licenses.cancelVoucher(bytes32("orden-1"));

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(LicenseNFT.OrderCancelled.selector, bytes32("orden-1")));
        licenses.redeem(voucher, sig);
    }

    function testRevokeWithinWindow() public {
        vm.prank(admin);
        licenses.mintTo(bytes32("orden-2"), buyer, contentId, 1);

        assertTrue(licenses.isRevocable(bytes32("orden-2")));

        vm.prank(admin);
        licenses.revoke(bytes32("orden-2"));

        assertFalse(licenses.hasLicense(buyer, contentId));
    }

    /// @dev Pasada la ventana la licencia es del usuario y nadie se la puede quemar.
    function testRevokeFailsAfterWindow() public {
        vm.prank(admin);
        licenses.mintTo(bytes32("orden-2"), buyer, contentId, 1);

        vm.warp(block.timestamp + WINDOW + 1);

        assertFalse(licenses.isRevocable(bytes32("orden-2")));

        vm.prank(admin);
        vm.expectRevert(LicenseNFT.RevocationWindowClosed.selector);
        licenses.revoke(bytes32("orden-2"));
    }

    /// @dev No se le quema la licencia a un tercero de buena fe.
    function testRevokeFailsIfHolderTransferred() public {
        vm.prank(admin);
        licenses.mintTo(bytes32("orden-2"), buyer, contentId, 1);

        vm.prank(buyer);
        licenses.safeTransferFrom(buyer, thief, contentId, 1, "");

        vm.prank(admin);
        vm.expectRevert(LicenseNFT.HolderMovedLicense.selector);
        licenses.revoke(bytes32("orden-2"));
    }

    function testUnknownContentRejected() public {
        vm.prank(admin);
        vm.expectRevert(LicenseNFT.UnknownContent.selector);
        licenses.mintTo(bytes32("orden-3"), buyer, 999, 1);
    }

    /// @dev Un takedown no invalida lo ya comprado.
    function testLicenseSurvivesContentTakedown() public {
        vm.prank(admin);
        licenses.mintTo(bytes32("orden-2"), buyer, contentId, 1);

        vm.prank(creator);
        contents.setContentActive(contentId, false);

        assertTrue(licenses.hasLicense(buyer, contentId));
    }
}
