// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CreatorRegistry
 * @notice Registra creadores vinculados a sus wallets.
 * @dev La wallet es la identidad principal del creador.
 */
contract CreatorRegistry {
    struct Creator {
        string name;
        string profileURI;
        uint256 registeredAt;
        bool active;
    }

    mapping(address => Creator) private creators;

    event CreatorRegistered(
        address indexed creator,
        string name,
        string profileURI,
        uint256 registeredAt
    );

    event CreatorProfileUpdated(
        address indexed creator,
        string name,
        string profileURI
    );

    event CreatorStatusChanged(
        address indexed creator,
        bool active
    );

    /**
     * @notice Registra la wallet que llama como creador.
     * @param name Nombre o alias público del creador.
     * @param profileURI URI de la metadata del perfil.
     */
    function registerCreator(
        string calldata name,
        string calldata profileURI
    ) external {
        require(!creators[msg.sender].active, "Creator already registered");
        require(bytes(name).length > 0, "Name cannot be empty");

        creators[msg.sender] = Creator({
            name: name,
            profileURI: profileURI,
            registeredAt: block.timestamp,
            active: true
        });

        emit CreatorRegistered(
            msg.sender,
            name,
            profileURI,
            block.timestamp
        );
    }

    /**
     * @notice Actualiza el nombre y la URI del perfil.
     * @param name Nuevo nombre o alias.
     * @param profileURI Nueva URI de metadata.
     */
    function updateProfile(
        string calldata name,
        string calldata profileURI
    ) external {
        require(creators[msg.sender].active, "Creator not registered");
        require(bytes(name).length > 0, "Name cannot be empty");

        creators[msg.sender].name = name;
        creators[msg.sender].profileURI = profileURI;

        emit CreatorProfileUpdated(
            msg.sender,
            name,
            profileURI
        );
    }

    /**
     * @notice Devuelve la información de un creador.
     * @param creator Dirección de la wallet del creador.
     */
    function getCreator(
        address creator
    ) external view returns (
        string memory name,
        string memory profileURI,
        uint256 registeredAt,
        bool active
    ) {
        Creator memory creatorData = creators[creator];

        return (
            creatorData.name,
            creatorData.profileURI,
            creatorData.registeredAt,
            creatorData.active
        );
    }

    /**
     * @notice Indica si una wallet está registrada y activa.
     * @param creator Dirección que se desea consultar.
     */
    function isRegisteredCreator(
        address creator
    ) external view returns (bool) {
        return creators[creator].active;
    }
}
