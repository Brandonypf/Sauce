// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {ContentRegistry} from "../src/ContentRegistry.sol";
import {LicenseNFT} from "../src/LicenseNFT.sol";
import {SettlementVault} from "../src/SettlementVault.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";

/**
 * @notice Levanta la pila completa en anvil, con un USDC de mentira.
 * @dev A diferencia de `Deploy.s.sol`, aqui no hay variables de entorno que
 *      configurar: una sola cuenta hace de admin, tesoreria, emisor y liquidador,
 *      y ademas otorga los roles. Sirve para que el backend y el frontend tengan
 *      contra que hablar sin depender de una testnet.
 *
 *      anvil
 *      forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 \
 *        --broadcast --private-key <anvil key 0>
 */
contract DeployLocalScript is Script {
    uint64 internal constant REVOCATION_WINDOW = 180 days;
    uint16 internal constant PLATFORM_FEE_BPS = 500;

    function run() external {
        uint256 pk =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address operator = vm.addr(pk);

        vm.startBroadcast(pk);

        MockUSDC usdc = new MockUSDC();
        CreatorRegistry creators = new CreatorRegistry(operator);
        ContentRegistry contents = new ContentRegistry(address(creators));
        LicenseNFT licenses = new LicenseNFT(address(contents), operator, REVOCATION_WINDOW);
        SettlementVault vault = new SettlementVault(address(usdc), operator, operator, PLATFORM_FEE_BPS);

        licenses.grantRole(licenses.ISSUER_ROLE(), operator);
        licenses.grantRole(licenses.MINTER_ROLE(), operator);
        vault.grantRole(vault.SETTLER_ROLE(), operator);

        usdc.mint(operator, 1_000_000_000_000);

        vm.stopBroadcast();

        console.log("MockUSDC        ", address(usdc));
        console.log("CreatorRegistry ", address(creators));
        console.log("ContentRegistry ", address(contents));
        console.log("LicenseNFT      ", address(licenses));
        console.log("SettlementVault ", address(vault));
    }
}
