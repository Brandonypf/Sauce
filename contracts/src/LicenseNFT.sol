// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IContentRegistryView {
    function exists(uint256 contentId) external view returns (bool);
    function metadataURIOf(uint256 contentId) external view returns (string memory);
}

/**
 * @title LicenseNFT
 * @notice Licencias de contenido como ERC-1155, emitidas por una compra que ya se
 *         liquido fuera de la cadena (tarjeta, Yape, Mercado Pago, etc.).
 *
 * @dev Este contrato NO cobra. Reemplaza el `buyLicense() payable` anterior, que solo
 *      servia al camino cripto nativo, por dos vias de emision:
 *
 *      1. `redeem()` — el backend firma un voucher EIP-712 despues de confirmar el
 *         pago por webhook. El usuario lo canjea cuando quiere, desde su propia
 *         wallet. Esta es la version correcta del "codigo de licencia" del diagrama:
 *         no es un secreto guardado en la base de datos, es una autorizacion
 *         verificable en cadena que no se puede falsificar ni reusar.
 *
 *      2. `mintTo()` — el backend mintea directo a la wallet embebida del usuario
 *         para quien nunca quiere ver una semilla ni firmar nada.
 *
 *      `orderId` es la clave de idempotencia compartida con el backend: un webhook
 *      duplicado del proveedor de pagos no puede emitir dos licencias.
 */
contract LicenseNFT is ERC1155, AccessControl, EIP712 {
    /// @notice Firma vouchers de licencia. Debe ser una llave caliente rotable.
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    /// @notice Emite directo a wallets embebidas, sin voucher.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    /// @notice Revoca por contracargo o fraude, dentro de la ventana.
    bytes32 public constant REVOKER_ROLE = keccak256("REVOKER_ROLE");

    bytes32 private constant VOUCHER_TYPEHASH =
        keccak256("LicenseVoucher(bytes32 orderId,address to,uint256 contentId,uint256 amount,uint64 expiry)");

    struct LicenseVoucher {
        bytes32 orderId;
        address to; // 0 = al portador; cualquiera que tenga la firma puede canjearlo
        uint256 contentId;
        uint256 amount;
        uint64 expiry;
    }

    struct Issuance {
        address holder;
        uint256 contentId;
        uint256 amount;
        uint64 issuedAt;
        bool revoked;
    }

    IContentRegistryView public immutable contentRegistry;

    string public constant name = "Sauce Content License";
    string public constant symbol = "SAUCE-LICENSE";

    /// @notice orderId => emision. `issuedAt != 0` significa que ya se emitio.
    mapping(bytes32 => Issuance) public issuanceOf;

    /// @notice Vouchers anulados antes de canjearse (contracargo temprano).
    mapping(bytes32 => bool) public cancelledOrder;

    /**
     * @notice Plazo tras la emision durante el cual la plataforma puede revocar.
     * @dev Pasado este plazo la licencia es definitivamente del usuario y nadie
     *      puede quemarla. Sin este limite, "tu licencia vive en la blockchain" seria
     *      publicidad enganosa: seria una fila en una base de datos con pasos extra.
     *      Debe cubrir el plazo de contracargo del proveedor de pagos (Visa/Mastercard
     *      suelen ser 120 dias; 180 da margen).
     */
    uint64 public revocationWindow;

    event LicenseIssued(
        bytes32 indexed orderId, address indexed holder, uint256 indexed contentId, uint256 amount, bool viaVoucher
    );
    event LicenseRevoked(bytes32 indexed orderId, address indexed holder, uint256 indexed contentId, uint256 amount);
    event VoucherCancelled(bytes32 indexed orderId);
    event RevocationWindowUpdated(uint64 previousWindow, uint64 newWindow);

    error ZeroAddress();
    error UnknownContent();
    error OrderAlreadyUsed(bytes32 orderId);
    error OrderCancelled(bytes32 orderId);
    error VoucherExpired();
    error InvalidSignature();
    error WrongRecipient();
    error ZeroAmount();
    error NotIssued();
    error AlreadyRevoked();
    error RevocationWindowClosed();
    error HolderMovedLicense();

    constructor(address contentRegistry_, address admin, uint64 revocationWindow_)
        ERC1155("")
        EIP712("SauceLicense", "1")
    {
        if (contentRegistry_ == address(0) || admin == address(0)) revert ZeroAddress();

        contentRegistry = IContentRegistryView(contentRegistry_);
        revocationWindow = revocationWindow_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REVOKER_ROLE, admin);

        emit RevocationWindowUpdated(0, revocationWindow_);
    }

    // ---------------------------------------------------------------- emision

    /**
     * @notice Canjea un voucher firmado por el backend.
     * @param voucher Datos de la licencia.
     * @param signature Firma EIP-712 de una cuenta con ISSUER_ROLE.
     *
     * @dev Si `voucher.to` es distinto de cero, solo esa direccion puede canjear.
     *      Si es cero el voucher es al portador (regalos, codigos de reventa) y lo
     *      canjea quien envie la transaccion. Un voucher al portador visible en el
     *      mempool puede ser interceptado: entregalo por un canal privado y relayealo
     *      desde el backend, o emite vouchers dirigidos siempre que conozcas la wallet.
     */
    function redeem(LicenseVoucher calldata voucher, bytes calldata signature) external returns (address holder) {
        if (voucher.amount == 0) revert ZeroAmount();
        if (block.timestamp > voucher.expiry) revert VoucherExpired();
        if (cancelledOrder[voucher.orderId]) revert OrderCancelled(voucher.orderId);
        if (issuanceOf[voucher.orderId].issuedAt != 0) revert OrderAlreadyUsed(voucher.orderId);
        if (!contentRegistry.exists(voucher.contentId)) revert UnknownContent();

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    VOUCHER_TYPEHASH, voucher.orderId, voucher.to, voucher.contentId, voucher.amount, voucher.expiry
                )
            )
        );

        address signer = ECDSA.recover(digest, signature);
        if (!hasRole(ISSUER_ROLE, signer)) revert InvalidSignature();

        if (voucher.to == address(0)) {
            holder = msg.sender;
        } else {
            if (msg.sender != voucher.to) revert WrongRecipient();
            holder = voucher.to;
        }

        _issue(voucher.orderId, holder, voucher.contentId, voucher.amount, true);
    }

    /**
     * @notice Emite directo, sin voucher, para usuarios con wallet embebida.
     * @dev Misma clave de idempotencia (`orderId`) que `redeem`.
     */
    function mintTo(bytes32 orderId, address to, uint256 contentId, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (cancelledOrder[orderId]) revert OrderCancelled(orderId);
        if (issuanceOf[orderId].issuedAt != 0) revert OrderAlreadyUsed(orderId);
        if (!contentRegistry.exists(contentId)) revert UnknownContent();

        _issue(orderId, to, contentId, amount, false);
    }

    function _issue(bytes32 orderId, address holder, uint256 contentId, uint256 amount, bool viaVoucher) private {
        issuanceOf[orderId] = Issuance({
            holder: holder, contentId: contentId, amount: amount, issuedAt: uint64(block.timestamp), revoked: false
        });

        _mint(holder, contentId, amount, "");

        emit LicenseIssued(orderId, holder, contentId, amount, viaVoucher);
    }

    // -------------------------------------------------------------- revocacion

    /// @notice Anula un voucher que todavia no se canjeo. Caso comun de contracargo.
    function cancelVoucher(bytes32 orderId) external onlyRole(REVOKER_ROLE) {
        if (issuanceOf[orderId].issuedAt != 0) revert OrderAlreadyUsed(orderId);
        if (cancelledOrder[orderId]) return;

        cancelledOrder[orderId] = true;

        emit VoucherCancelled(orderId);
    }

    /**
     * @notice Quema una licencia ya emitida, dentro de la ventana de revocacion.
     * @dev Falla a proposito si el titular ya transfirio la licencia. Quemarsela a un
     *      tercero de buena fe seria peor que perder el dinero del contracargo; ese
     *      caso se resuelve fuera de la cadena (suspension de cuenta).
     */
    function revoke(bytes32 orderId) external onlyRole(REVOKER_ROLE) {
        Issuance storage issuance = issuanceOf[orderId];

        if (issuance.issuedAt == 0) revert NotIssued();
        if (issuance.revoked) revert AlreadyRevoked();
        if (block.timestamp > issuance.issuedAt + revocationWindow) revert RevocationWindowClosed();
        if (balanceOf(issuance.holder, issuance.contentId) < issuance.amount) revert HolderMovedLicense();

        issuance.revoked = true;

        _burn(issuance.holder, issuance.contentId, issuance.amount);

        emit LicenseRevoked(orderId, issuance.holder, issuance.contentId, issuance.amount);
    }

    function setRevocationWindow(uint64 newWindow) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint64 previous = revocationWindow;
        revocationWindow = newWindow;

        emit RevocationWindowUpdated(previous, newWindow);
    }

    // ------------------------------------------------------------------ vistas

    function hasLicense(address user, uint256 contentId) external view returns (bool) {
        return balanceOf(user, contentId) > 0;
    }

    function isRevocable(bytes32 orderId) external view returns (bool) {
        Issuance memory issuance = issuanceOf[orderId];

        return issuance.issuedAt != 0 && !issuance.revoked && block.timestamp <= issuance.issuedAt + revocationWindow
            && balanceOf(issuance.holder, issuance.contentId) >= issuance.amount;
    }

    function voucherDigest(LicenseVoucher calldata voucher) external view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    VOUCHER_TYPEHASH, voucher.orderId, voucher.to, voucher.contentId, voucher.amount, voucher.expiry
                )
            )
        );
    }

    /// @dev Resuelve la metadata desde ContentRegistry en vez de devolver "".
    function uri(uint256 contentId) public view override returns (string memory) {
        return contentRegistry.metadataURIOf(contentId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
