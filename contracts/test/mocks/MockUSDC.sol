// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice USDC de mentira para tests y para la cadena local.
/// @dev 6 decimales, como el USDC real. Usar 18 en el mock y 6 en produccion es
///      la clase de diferencia que hace que un bug de escala pase los tests.
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
