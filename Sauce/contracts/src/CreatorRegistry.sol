// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title CreatorRegistry
 * @notice Vincula la identidad de un creador con la wallet que recibe sus pagos.
 * @dev La wallet que llama (`msg.sender`) es la identidad. La direccion de cobro
 *      (`payout`) es independiente y puede cambiarse sin perder la identidad, para
 *      que un creador pueda cobrar en una multisig o en una wallet fria sin mover
 *      su cuenta.
 */
contract CreatorRegistry is AccessControl {
    /// @notice Puede suspender o reactivar creadores (moderacion / takedowns).
    bytes32 public constant CURATOR_ROLE = keccak256("CURATOR_ROLE");

    struct Creator {
        string name;
        string profileURI;
        address payout;
        uint64 registeredAt;
        bool exists;
        bool active;
    }

    mapping(address => Creator) private _creators;

    event CreatorRegistered(address indexed creator, address indexed payout, string name, string profileURI);
    event CreatorProfileUpdated(address indexed creator, string name, string profileURI);
    event CreatorPayoutUpdated(address indexed creator, address indexed previousPayout, address indexed newPayout);
    event CreatorStatusChanged(address indexed creator, bool active);

    error AlreadyRegistered();
    error NotRegistered();
    error EmptyName();
    error ZeroAddress();

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CURATOR_ROLE, admin);
    }

    /**
     * @notice Registra la wallet que llama como creador.
     * @param name Nombre o alias publico.
     * @param profileURI URI de la metadata del perfil.
     * @param payout Direccion que recibira los pagos. Si es 0, se usa msg.sender.
     */
    function registerCreator(string calldata name, string calldata profileURI, address payout) external {
        if (_creators[msg.sender].exists) revert AlreadyRegistered();
        if (bytes(name).length == 0) revert EmptyName();

        address payoutAddress = payout == address(0) ? msg.sender : payout;

        _creators[msg.sender] = Creator({
            name: name,
            profileURI: profileURI,
            payout: payoutAddress,
            registeredAt: uint64(block.timestamp),
            exists: true,
            active: true
        });

        emit CreatorRegistered(msg.sender, payoutAddress, name, profileURI);
    }

    function updateProfile(string calldata name, string calldata profileURI) external {
        if (!_creators[msg.sender].exists) revert NotRegistered();
        if (bytes(name).length == 0) revert EmptyName();

        _creators[msg.sender].name = name;
        _creators[msg.sender].profileURI = profileURI;

        emit CreatorProfileUpdated(msg.sender, name, profileURI);
    }

    /**
     * @notice Cambia la direccion de cobro sin cambiar la identidad del creador.
     * @dev No afecta a los saldos ya acreditados en SettlementVault: esos siguen
     *      asociados a la direccion que estaba vigente cuando se liquidaron.
     */
    function updatePayout(address newPayout) external {
        if (!_creators[msg.sender].exists) revert NotRegistered();
        if (newPayout == address(0)) revert ZeroAddress();

        address previous = _creators[msg.sender].payout;
        _creators[msg.sender].payout = newPayout;

        emit CreatorPayoutUpdated(msg.sender, previous, newPayout);
    }

    /**
     * @notice Suspende o reactiva a un creador. Un creador suspendido no puede
     *         publicar contenido nuevo, pero su contenido existente y las licencias
     *         ya emitidas siguen siendo validas.
     */
    function setCreatorActive(address creator, bool active) external onlyRole(CURATOR_ROLE) {
        if (!_creators[creator].exists) revert NotRegistered();
        if (_creators[creator].active == active) return;

        _creators[creator].active = active;

        emit CreatorStatusChanged(creator, active);
    }

    function getCreator(address creator) external view returns (Creator memory) {
        return _creators[creator];
    }

    function isRegisteredCreator(address creator) external view returns (bool) {
        return _creators[creator].active;
    }

    /// @notice Direccion de cobro vigente. Revierte si el creador no existe.
    function payoutOf(address creator) external view returns (address) {
        if (!_creators[creator].exists) revert NotRegistered();
        return _creators[creator].payout;
    }
}
