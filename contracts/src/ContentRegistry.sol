// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

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
contract ContentRegistry {
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

    constructor(address creatorRegistry_) {
        if (creatorRegistry_ == address(0)) revert ZeroAddress();
        creatorRegistry = ICreatorRegistry(creatorRegistry_);
    }

    function registerContent(
        string calldata title,
        string calldata metadataURI,
        bytes32 contentHash,
        uint256 referencePrice
    ) external returns (uint256) {
        if (!creatorRegistry.isRegisteredCreator(msg.sender)) revert CreatorNotRegistered();
        if (bytes(title).length == 0) revert TitleRequired();
        if (contentHash == bytes32(0)) revert ContentHashRequired();

        uint256 existing = contentIdByHash[contentHash];
        if (existing != 0) revert DuplicateContentHash(existing);

        uint256 contentId = ++_nextContentId;

        _contents[contentId] = Content({
            id: contentId,
            creator: msg.sender,
            title: title,
            metadataURI: metadataURI,
            contentHash: contentHash,
            referencePrice: referencePrice,
            publishedAt: uint64(block.timestamp),
            exists: true,
            active: true
        });

        contentIdByHash[contentHash] = contentId;

        emit ContentRegistered(contentId, msg.sender, contentHash, title);

        return contentId;
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
