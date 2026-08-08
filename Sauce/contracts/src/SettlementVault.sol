// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISplitEngine} from "./ISplitEngine.sol";

/**
 * @title SettlementVault
 * @notice Liquida en USDC lo recaudado en moneda local. Reemplaza a RoyaltyManager.
 *
 * @dev Tres cambios de fondo respecto de la version anterior:
 *
 *      1. Pago por retiro (pull), no por envio (push). Antes, un creador cuya wallet
 *         fuera un contrato que revierte al recibir dejaba su propia obra imposible de
 *         comprar para siempre: cada compra revertia dentro de `distributeRoyalty`.
 *         Ahora un creador que no puede recibir solo se afecta a si mismo.
 *
 *      2. USDC en vez de ETH nativo. En el camino fiat el dinero entra por pasarela y
 *         se convierte en un stablecoin. Un creador al que le pagas en ETH asume
 *         riesgo de precio que nunca pidio.
 *
 *      3. Liquidacion por lotes. Escribir en cadena en cada venta es caro y filtra el
 *         historial de compras de cada usuario. Un lote por epoca (diario o semanal)
 *         cuesta una fraccion y no revela quien compro que.
 */
contract SettlementVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Envia lotes de liquidacion. Cuenta operativa del backend.
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");

    /// @notice Techo duro de comision. Ni el admin puede superarlo.
    uint16 public constant MAX_FEE_BPS = 3000; // 30%

    uint16 public constant BPS_DENOMINATOR = 10_000;

    IERC20 public immutable token;

    address public treasury;

    uint16 public platformFeeBps;

    /// @notice Motor de reparto opcional. Si es 0, solo se admiten lotes explicitos.
    ISplitEngine public splitEngine;

    /// @notice Saldo retirable por direccion.
    mapping(address => uint256) public accrued;

    /// @notice Suma de todos los saldos retirables. Protege el dinero de los creadores
    ///         de `sweep`: la plataforma solo puede retirar el excedente sobre esto.
    uint256 public totalAccrued;

    /// @notice Idempotencia de lotes: un reintento del backend no paga dos veces.
    mapping(bytes32 => bool) public batchSettled;

    event BatchSettled(bytes32 indexed batchId, uint256 gross, uint256 fee, uint256 payeeCount);
    event Accrued(address indexed payee, uint256 amount);
    event Withdrawn(address indexed payee, address indexed to, uint256 amount);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event PlatformFeeUpdated(uint16 previousBps, uint16 newBps);
    event SplitEngineUpdated(address indexed previousEngine, address indexed newEngine);
    event ExcessSwept(address indexed to, uint256 amount);

    error ZeroAddress();
    error FeeTooHigh(uint16 requested, uint16 maximum);
    error BatchAlreadySettled(bytes32 batchId);
    error LengthMismatch();
    error EmptyBatch();
    error ZeroAmountForPayee(address payee);
    error NothingToWithdraw();
    error NoSplitEngine();
    error EngineOverAllocated(uint256 reported, uint256 computed);
    error NoExcess();

    constructor(address token_, address treasury_, address admin, uint16 platformFeeBps_) {
        if (token_ == address(0) || treasury_ == address(0) || admin == address(0)) revert ZeroAddress();
        if (platformFeeBps_ > MAX_FEE_BPS) revert FeeTooHigh(platformFeeBps_, MAX_FEE_BPS);

        token = IERC20(token_);
        treasury = treasury_;
        platformFeeBps = platformFeeBps_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        emit TreasuryUpdated(address(0), treasury_);
        emit PlatformFeeUpdated(0, platformFeeBps_);
    }

    // ------------------------------------------------------------ liquidacion

    /**
     * @notice Liquida un lote con montos brutos explicitos.
     * @dev El llamante debe haber aprobado `sum(grossAmounts)` a esta boveda.
     *      La comision se calcula por beneficiario y se suma, en vez de calcularse
     *      sobre el total: asi el redondeo nunca deja un descuadre entre lo que
     *      entra y lo que se acredita.
     */
    function settleBatch(bytes32 batchId, address[] calldata payees, uint256[] calldata grossAmounts)
        external
        onlyRole(SETTLER_ROLE)
    {
        if (payees.length != grossAmounts.length) revert LengthMismatch();
        _settle(batchId, payees, grossAmounts);
    }

    /**
     * @notice Liquida un lote delegando la agregacion al motor de reparto.
     * @param sales Lote de ventas codificado; el motor Stylus lo colapsa a montos
     *        por creador. Un lote de 10.000 ventas de 200 creadores se convierte en
     *        200 escrituras de storage, no 10.000.
     */
    function settleFromSales(bytes32 batchId, bytes calldata sales) external onlyRole(SETTLER_ROLE) {
        ISplitEngine engine = splitEngine;
        if (address(engine) == address(0)) revert NoSplitEngine();

        (address[] memory payees, uint256[] memory amounts, uint256 reportedGross) = engine.aggregate(sales);

        if (payees.length != amounts.length) revert LengthMismatch();

        uint256 computedGross;
        for (uint256 i = 0; i < amounts.length; ++i) {
            computedGross += amounts[i];
        }

        // El motor es codigo externo. Si su total declarado no cuadra con la suma
        // real, no se confia en el: la boveda solo mueve lo que puede verificar.
        if (reportedGross != computedGross) revert EngineOverAllocated(reportedGross, computedGross);

        _settle(batchId, payees, amounts);
    }

    function _settle(bytes32 batchId, address[] memory payees, uint256[] memory grossAmounts) private {
        if (batchSettled[batchId]) revert BatchAlreadySettled(batchId);
        if (payees.length == 0) revert EmptyBatch();

        batchSettled[batchId] = true;

        uint16 feeBps = platformFeeBps;
        uint256 gross;
        uint256 fee;
        uint256 netTotal;

        for (uint256 i = 0; i < payees.length; ++i) {
            address payee = payees[i];
            uint256 amount = grossAmounts[i];

            if (payee == address(0)) revert ZeroAddress();
            if (amount == 0) revert ZeroAmountForPayee(payee);

            uint256 payeeFee = (amount * feeBps) / BPS_DENOMINATOR;
            uint256 net = amount - payeeFee;

            gross += amount;
            fee += payeeFee;
            netTotal += net;

            accrued[payee] += net;

            emit Accrued(payee, net);
        }

        accrued[treasury] += fee;
        totalAccrued += gross;

        token.safeTransferFrom(msg.sender, address(this), gross);

        emit Accrued(treasury, fee);
        emit BatchSettled(batchId, gross, fee, payees.length);

        // Invariante: lo acreditado equivale exactamente a lo recibido.
        assert(netTotal + fee == gross);
    }

    // ---------------------------------------------------------------- retiros

    function withdraw() external nonReentrant returns (uint256) {
        return _withdraw(msg.sender, msg.sender);
    }

    function withdrawTo(address to) external nonReentrant returns (uint256) {
        if (to == address(0)) revert ZeroAddress();
        return _withdraw(msg.sender, to);
    }

    function _withdraw(address payee, address to) private returns (uint256 amount) {
        amount = accrued[payee];
        if (amount == 0) revert NothingToWithdraw();

        accrued[payee] = 0;
        totalAccrued -= amount;

        token.safeTransfer(to, amount);

        emit Withdrawn(payee, to, amount);
    }

    // ------------------------------------------------------------ administracion

    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();

        address previous = treasury;
        treasury = newTreasury;

        emit TreasuryUpdated(previous, newTreasury);
    }

    function setPlatformFee(uint16 newBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newBps > MAX_FEE_BPS) revert FeeTooHigh(newBps, MAX_FEE_BPS);

        uint16 previous = platformFeeBps;
        platformFeeBps = newBps;

        emit PlatformFeeUpdated(previous, newBps);
    }

    function setSplitEngine(address newEngine) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address previous = address(splitEngine);
        splitEngine = ISplitEngine(newEngine);

        emit SplitEngineUpdated(previous, newEngine);
    }

    /// @notice Retira solo el excedente sobre lo que se le debe a los creadores,
    ///         por ejemplo tokens enviados por error a esta direccion.
    function sweepExcess(address to) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 excess) {
        if (to == address(0)) revert ZeroAddress();

        uint256 balance = token.balanceOf(address(this));
        if (balance <= totalAccrued) revert NoExcess();

        excess = balance - totalAccrued;
        token.safeTransfer(to, excess);

        emit ExcessSwept(to, excess);
    }
}
