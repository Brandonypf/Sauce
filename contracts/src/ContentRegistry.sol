// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface ICreatorRegistry {
    function isRegisteredCreator(address creator) external view returns (bool);
    function payoutOf(address creator) external view returns (address);
}

/**
 * @title ContentRegistry
 * @notice Compromiso publico e inmutable de autoria: "el creador X publico la obra
 *         con hash H en el bloque N".
 * @dev El precio se guarda solo como referencia para el camino cripto nativo. En el
 *      camino fiat el precio real vive en el backend (varia por moneda, region,
 *      promociones) y este valor no se usa para cobrar.
 */
contract ContentRegistry is EIP712 {
    struct Content {
        uint256 id;
        address creator;
        string title;
        string metadataURI;
        bytes32 contentHash;
        uint256 referencePrice;
        uint64 publishedAt;
        bool exists;
        bool active;
    }

    ICreatorRegistry public immutable creatorRegistry;

    uint256 private _nextContentId;

    mapping(uint256 => Content) private _contents;

    /// @notice contentHash => contentId, para detectar republicaciones del mismo archivo.
    mapping(bytes32 => uint256) public contentIdByHash;

    /// @notice Nonce por creador para las registraciones firmadas.
    mapping(address => uint256) public nonces;

    bytes32 private constant REGISTER_TYPEHASH = keccak256(
        "RegisterContent(address creator,string title,string metadataURI,bytes32 contentHash,uint256 referencePrice,uint256 nonce,uint64 deadline)"
    );

    event ContentRegistered(
        uint256 indexed contentId, address indexed creator, bytes32 indexed contentHash, string title
    );
    event ContentUpdated(uint256 indexed contentId, string metadataURI, uint256 referencePrice);
    event ContentStatusChanged(uint256 indexed contentId, bool active);

    error CreatorNotRegistered();
    error TitleRequired();
    error ContentHashRequired();
    error DuplicateContentHash(uint256 existingContentId);
    error UnknownContent();
    error NotContentOwner();
    error ZeroAddress();
    error SignatureExpired();
    error InvalidSignature();
    error BadNonce(uint256 expected, uint256 provided);

    event ContentRegisteredWithSig(uint256 indexed contentId, address indexed creator, address relayer);

    constructor(address creatorRegistry_) EIP712("SauceContentRegistry", "1") {
        if (creatorRegistry_ == address(0)) revert ZeroAddress();
        creatorRegistry = ICreatorRegistry(creatorRegistry_);
    }

    function registerContent(
        string calldata title,
        string calldata metadataURI,
        bytes32 contentHash,
        uint256 referencePrice
    ) external returns (uint256) {
        return _register(msg.sender, title, metadataURI, contentHash, referencePrice);
    }

    /// @dev Logica compartida por el camino directo y el firmado. Extraida para
    ///      que las dos rutas no puedan validar cosas distintas con el tiempo.
    function _register(
        address creator,
        string calldata title,
        string calldata metadataURI,
        bytes32 contentHash,
        uint256 referencePrice
    ) private returns (uint256) {
        if (!creatorRegistry.isRegisteredCreator(creator)) revert CreatorNotRegistered();
        if (bytes(title).length == 0) revert TitleRequired();
        if (contentHash == bytes32(0)) revert ContentHashRequired();

        uint256 existing = contentIdByHash[contentHash];
        if (existing != 0) revert DuplicateContentHash(existing);

        uint256 contentId = ++_nextContentId;

        _contents[contentId] = Content({
            id: contentId,
            creator: creator,
            title: title,
            metadataURI: metadataURI,
            contentHash: contentHash,
            referencePrice: referencePrice,
            publishedAt: uint64(block.timestamp),
            exists: true,
            active: true
        });

        contentIdByHash[contentHash] = contentId;

        emit ContentRegistered(contentId, creator, contentHash, title);

        return contentId;
    }

    /**
     * @notice Registra una obra a nombre del creador, enviada y pagada por otro.
     *
     * @dev Esta funcion existe porque `registerContent` exige que `msg.sender` sea
     *      el creador, y en el camino fiat el creador no tiene ETH: quien envia la
     *      transaccion es el relayer de la plataforma.
     *
     *      Lo que NO se hace, a proposito: dar un rol de registrador al backend.
     *      Todo el valor de la procedencia on-chain es que fue EL CREADOR quien
     *      atestiguo tener los derechos. Con un rol de plataforma, la afirmacion
     *      pasa a ser "la plataforma dice que el creador dijo", que es justo lo
     *      que ya no se puede verificar.
     *
     *      Aqui el creador firma un EIP-712 fuera de cadena —gratis, sin ETH— y
     *      el contrato recupera al firmante. `msg.sender` puede ser cualquiera;
     *      la autoria sigue siendo criptograficamente del creador.
     *
     * @param nonce    Debe coincidir con `nonces[creator]`. Impide reenviar una
     *                 firma antigua. `contentIdByHash` ya rechazaria un replay
     *                 literal, pero el nonce es lo que permite extender el patron
     *                 a `updateContent`, donde no hay unicidad natural.
     * @param deadline Momento tras el cual la firma deja de valer. Sin el, una
     *                 firma filtrada sirve para siempre.
     */
    struct RegisterRequest {
        address creator;
        string title;
        string metadataURI;
        bytes32 contentHash;
        uint256 referencePrice;
        uint256 nonce;
        uint64 deadline;
    }

    function registerContentWithSig(RegisterRequest calldata req, bytes calldata signature) external returns (uint256) {
        if (block.timestamp > req.deadline) revert SignatureExpired();

        uint256 expected = nonces[req.creator];
        if (req.nonce != expected) revert BadNonce(expected, req.nonce);

        address signer = ECDSA.recover(_digest(req), signature);
        if (signer != req.creator || req.creator == address(0)) revert InvalidSignature();

        // El nonce se consume ANTES de registrar: hacerlo despues dejaria una
        // ventana para gastar la misma firma dos veces.
        nonces[req.creator] = expected + 1;

        uint256 contentId = _register(req.creator, req.title, req.metadataURI, req.contentHash, req.referencePrice);

        emit ContentRegisteredWithSig(contentId, req.creator, msg.sender);

        return contentId;
    }

    /// @notice Digest EIP-712 que el creador debe firmar. Lo usa el frontend.
    function registerDigest(RegisterRequest calldata req) external view returns (bytes32) {
        return _digest(req);
    }

    /// @dev El titulo y la URI van hasheados: en EIP-712 los tipos dinamicos se
    ///      codifican por su keccak, no por su contenido.
    function _digest(RegisterRequest calldata req) private view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    REGISTER_TYPEHASH,
                    req.creator,
                    keccak256(bytes(req.title)),
                    keccak256(bytes(req.metadataURI)),
                    req.contentHash,
                    req.referencePrice,
                    req.nonce,
                    req.deadline
                )
            )
        );
    }

    function updateContent(uint256 contentId, string calldata metadataURI, uint256 referencePrice) external {
        Content storage content = _contents[contentId];
        if (!content.exists) revert UnknownContent();
        if (content.creator != msg.sender) revert NotContentOwner();

        content.metadataURI = metadataURI;
        content.referencePrice = referencePrice;

        emit ContentUpdated(contentId, metadataURI, referencePrice);
    }

    /**
     * @notice Retira o repone la obra del catalogo.
     * @dev Retirarla impide emitir licencias nuevas. NO invalida las ya emitidas:
     *      quien compro conserva su licencia. Esa es la garantia que hace que la
     *      licencia on-chain valga mas que una fila en una base de datos.
     */
    function setContentActive(uint256 contentId, bool active) external {
        Content storage content = _contents[contentId];
        if (!content.exists) revert UnknownContent();
        if (content.creator != msg.sender) revert NotContentOwner();
        if (content.active == active) return;

        content.active = active;

        emit ContentStatusChanged(contentId, active);
    }

    /// @dev A diferencia de la version anterior, NO revierte para contenido inactivo.
    ///      Las licencias historicas necesitan poder resolver su metadata siempre.
    function getContent(uint256 contentId) external view returns (Content memory) {
        if (!_contents[contentId].exists) revert UnknownContent();
        return _contents[contentId];
    }

    function exists(uint256 contentId) external view returns (bool) {
        return _contents[contentId].exists;
    }

    function isActive(uint256 contentId) external view returns (bool) {
        return _contents[contentId].active;
    }

    function creatorOf(uint256 contentId) external view returns (address) {
        if (!_contents[contentId].exists) revert UnknownContent();
        return _contents[contentId].creator;
    }

    function metadataURIOf(uint256 contentId) external view returns (string memory) {
        if (!_contents[contentId].exists) revert UnknownContent();
        return _contents[contentId].metadataURI;
    }

    function totalContent() external view returns (uint256) {
        return _nextContentId;
    }
}
