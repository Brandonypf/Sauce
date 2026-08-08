// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {ContentRegistry} from "../src/ContentRegistry.sol";
import {LicenseNFT} from "../src/LicenseNFT.sol";
import {SettlementVault} from "../src/SettlementVault.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/**
 * @title SauceIntegrationTest
 * @notice Recorre el camino completo del diagrama de pago y licencia, desde que el
 *         creador publica hasta que cobra en USDC.
 *
 * @dev Portado de la version anterior, que probaba `buyLicense{value: ...}` contra
 *      RoyaltyManager. Ese flujo ya no existe: el comprador paga en fiat fuera de la
 *      cadena y nunca envia ETH. Lo que se prueba ahora es la costura real entre el
 *      backend y los contratos:
 *
 *        publicar -> pagar (off-chain) -> firmar voucher -> canjear -> liquidar -> cobrar
 *
 *      El caso interesante no es el feliz sino los bordes: webhook duplicado,
 *      contracargo antes y despues del canje, y lote de liquidacion reintentado.
 */
contract SauceIntegrationTest is Test {
    CreatorRegistry internal creators;
    ContentRegistry internal contents;
    LicenseNFT internal licenses;
    SettlementVault internal vault;
    MockUSDC internal usdc;

    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal settler = makeAddr("settler");
    address internal creator = makeAddr("creator");
    address internal buyer = makeAddr("buyer");

    /// @dev La llave que firma vouchers. En produccion vive en el backend, caliente
    ///      y rotable: por eso es un ROLE y no una direccion fija en el constructor.
    uint256 internal issuerKey = 0xA11CE;
    address internal issuer;

    uint64 internal constant REVOCATION_WINDOW = 180 days;
    uint16 internal constant PLATFORM_FEE_BPS = 500; // 5%

    /// @dev Precio de catalogo: S/ 38.00 convertidos a 10 USDC (6 decimales).
    uint256 internal constant SALE_AMOUNT = 10_000_000;

    uint256 internal contentId;

    function setUp() public {
        issuer = vm.addr(issuerKey);

        usdc = new MockUSDC();

        creators = new CreatorRegistry(admin);
        contents = new ContentRegistry(address(creators));
        licenses = new LicenseNFT(address(contents), admin, REVOCATION_WINDOW);
        vault = new SettlementVault(address(usdc), treasury, admin, PLATFORM_FEE_BPS);

        vm.startPrank(admin);
        licenses.grantRole(licenses.ISSUER_ROLE(), issuer);
        licenses.grantRole(licenses.MINTER_ROLE(), settler);
        vault.grantRole(vault.SETTLER_ROLE(), settler);
        vm.stopPrank();

        vm.prank(creator);
        creators.registerCreator("Sauce Creator", "ipfs://creator", address(0));

        vm.prank(creator);
        contentId = contents.registerContent(
            "Hoshizora no Kanata", "ipfs://content", keccak256("content-file-v1"), SALE_AMOUNT
        );

        // La pasarela liquida en la cuenta operativa, que es la que financia la boveda.
        usdc.mint(settler, 1_000_000_000);
        vm.prank(settler);
        usdc.approve(address(vault), type(uint256).max);
    }

    // ------------------------------------------------------------ camino feliz

    function testFullFiatPurchaseFlow() public {
        bytes32 orderId = keccak256("order-0001");

        // 1. El webhook de la pasarela confirma el pago. El backend firma el voucher.
        (LicenseNFT.LicenseVoucher memory voucher, bytes memory signature) = _signVoucher(orderId, buyer, contentId, 1);

        // 2. El usuario lo canjea desde su propia wallet, cuando quiera.
        vm.prank(buyer);
        licenses.redeem(voucher, signature);

        assertTrue(licenses.hasLicense(buyer, contentId), "buyer should hold the license");
        assertEq(licenses.balanceOf(buyer, contentId), 1);
        assertEq(licenses.uri(contentId), "ipfs://content", "uri resolves from ContentRegistry");

        // 3. Cierra la epoca y se liquida el lote.
        address[] memory payees = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        payees[0] = creators.payoutOf(creator);
        amounts[0] = SALE_AMOUNT;

        vm.prank(settler);
        vault.settleBatch(keccak256("epoch-2026-08-05"), payees, amounts);

        uint256 expectedFee = (SALE_AMOUNT * PLATFORM_FEE_BPS) / 10_000;
        uint256 expectedNet = SALE_AMOUNT - expectedFee;

        assertEq(vault.accrued(creator), expectedNet, "creator accrual net of fee");
        assertEq(vault.accrued(treasury), expectedFee, "treasury accrual");

        // 4. El creador cobra. Nadie le envia nada: el retira.
        vm.prank(creator);
        vault.withdraw();

        assertEq(usdc.balanceOf(creator), expectedNet);
        assertEq(vault.accrued(creator), 0);
    }

    // ------------------------------------------------------------------ bordes

    /// @notice Un webhook duplicado de la pasarela no puede emitir dos licencias.
    function testDuplicateWebhookCannotIssueTwice() public {
        bytes32 orderId = keccak256("order-0002");

        (LicenseNFT.LicenseVoucher memory voucher, bytes memory signature) = _signVoucher(orderId, buyer, contentId, 1);

        vm.prank(buyer);
        licenses.redeem(voucher, signature);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(LicenseNFT.OrderAlreadyUsed.selector, orderId));
        licenses.redeem(voucher, signature);

        assertEq(licenses.balanceOf(buyer, contentId), 1, "still exactly one license");
    }

    /// @notice Un voucher firmado por una llave sin ISSUER_ROLE no vale nada.
    function testForgedVoucherIsRejected() public {
        uint256 attackerKey = 0xBAD;
        bytes32 orderId = keccak256("order-0003");

        LicenseNFT.LicenseVoucher memory voucher = LicenseNFT.LicenseVoucher({
            orderId: orderId, to: buyer, contentId: contentId, amount: 1, expiry: uint64(block.timestamp + 1 days)
        });

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attackerKey, licenses.voucherDigest(voucher));

        vm.prank(buyer);
        vm.expectRevert(LicenseNFT.InvalidSignature.selector);
        licenses.redeem(voucher, abi.encodePacked(r, s, v));
    }

    /// @notice Contracargo antes del canje: se anula el voucher, no llega a mintear.
    function testChargebackBeforeRedemption() public {
        bytes32 orderId = keccak256("order-0004");

        (LicenseNFT.LicenseVoucher memory voucher, bytes memory signature) = _signVoucher(orderId, buyer, contentId, 1);

        vm.prank(admin);
        licenses.cancelVoucher(orderId);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(LicenseNFT.OrderCancelled.selector, orderId));
        licenses.redeem(voucher, signature);

        assertFalse(licenses.hasLicense(buyer, contentId));
    }

    /// @notice Contracargo despues del canje, dentro de la ventana: se quema.
    function testChargebackAfterRedemption() public {
        bytes32 orderId = keccak256("order-0005");

        (LicenseNFT.LicenseVoucher memory voucher, bytes memory signature) = _signVoucher(orderId, buyer, contentId, 1);

        vm.prank(buyer);
        licenses.redeem(voucher, signature);

        vm.warp(block.timestamp + 90 days);

        assertTrue(licenses.isRevocable(orderId));

        vm.prank(admin);
        licenses.revoke(orderId);

        assertFalse(licenses.hasLicense(buyer, contentId));
    }

    /// @notice Pasada la ventana, la licencia es definitivamente del usuario.
    function testLicenseIsPermanentAfterRevocationWindow() public {
        bytes32 orderId = keccak256("order-0006");

        (LicenseNFT.LicenseVoucher memory voucher, bytes memory signature) = _signVoucher(orderId, buyer, contentId, 1);

        vm.prank(buyer);
        licenses.redeem(voucher, signature);

        vm.warp(block.timestamp + REVOCATION_WINDOW + 1);

        assertFalse(licenses.isRevocable(orderId));

        vm.prank(admin);
        vm.expectRevert(LicenseNFT.RevocationWindowClosed.selector);
        licenses.revoke(orderId);

        assertTrue(licenses.hasLicense(buyer, contentId), "license survives; this is the point");
    }

    /// @notice Retirar la obra del catalogo no toca las licencias ya emitidas.
    function testTakedownDoesNotConfiscateIssuedLicenses() public {
        bytes32 orderId = keccak256("order-0007");

        (LicenseNFT.LicenseVoucher memory voucher, bytes memory signature) = _signVoucher(orderId, buyer, contentId, 1);

        vm.prank(buyer);
        licenses.redeem(voucher, signature);

        vm.prank(creator);
        contents.setContentActive(contentId, false);

        assertFalse(contents.isActive(contentId), "no longer for sale");
        assertTrue(licenses.hasLicense(buyer, contentId), "already-issued license stands");

        // Y la metadata sigue resolviendo: en la version anterior esto revertia.
        assertEq(licenses.uri(contentId), "ipfs://content");
    }

    /// @notice Reintentar un lote de liquidacion no paga dos veces.
    function testSettlementBatchIsIdempotent() public {
        address[] memory payees = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        payees[0] = creator;
        amounts[0] = SALE_AMOUNT;

        bytes32 batchId = keccak256("epoch-retry");

        vm.prank(settler);
        vault.settleBatch(batchId, payees, amounts);

        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(SettlementVault.BatchAlreadySettled.selector, batchId));
        vault.settleBatch(batchId, payees, amounts);
    }

    /// @notice El creador cobra en la direccion que eligio, no en su identidad.
    function testPayoutAddressIsHonoured() public {
        address coldWallet = makeAddr("coldWallet");

        vm.prank(creator);
        creators.updatePayout(coldWallet);

        address[] memory payees = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        payees[0] = creators.payoutOf(creator);
        amounts[0] = SALE_AMOUNT;

        vm.prank(settler);
        vault.settleBatch(keccak256("epoch-payout"), payees, amounts);

        vm.prank(coldWallet);
        vault.withdraw();

        assertGt(usdc.balanceOf(coldWallet), 0);
        assertEq(usdc.balanceOf(creator), 0, "identity wallet stays empty");
    }

    // ------------------------------------------------------------------ helpers

    function _signVoucher(bytes32 orderId, address to, uint256 contentId_, uint256 amount)
        internal
        view
        returns (LicenseNFT.LicenseVoucher memory voucher, bytes memory signature)
    {
        voucher = LicenseNFT.LicenseVoucher({
            orderId: orderId, to: to, contentId: contentId_, amount: amount, expiry: uint64(block.timestamp + 7 days)
        });

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerKey, licenses.voucherDigest(voucher));

        signature = abi.encodePacked(r, s, v);
    }
}
