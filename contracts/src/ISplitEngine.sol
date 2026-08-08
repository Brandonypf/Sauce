// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ISplitEngine
 * @notice Motor de reparto. La implementacion de produccion es un contrato Stylus
 *         (Rust/WASM); ver `stylus/split-engine`.
 * @dev Deliberadamente sin estado de dinero: el motor solo calcula, la boveda
 *      custodia y paga. Separar computo de custodia significa que un bug en la
 *      politica de reparto no puede vaciar la boveda.
 */
interface ISplitEngine {
    /**
     * @notice Agrega un lote de ventas a montos por beneficiario.
     * @param sales Lote codificado de ventas. Formato en `stylus/split-engine/README`.
     * @return payees Direcciones a acreditar, sin repetidos.
     * @return amounts Monto bruto por direccion, en la unidad minima del token.
     * @return totalGross Suma de `amounts`. La boveda la verifica contra el importe
     *         que realmente recibio, para que un motor con bug no pueda acreditar
     *         mas de lo que entro.
     */
    function aggregate(bytes calldata sales)
        external
        view
        returns (address[] memory payees, uint256[] memory amounts, uint256 totalGross);
}
