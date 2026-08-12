// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {ContentRegistry} from "../src/ContentRegistry.sol";
import {LicenseNFT} from "../src/LicenseNFT.sol";
import {SettlementVault} from "../src/SettlementVault.sol";

/**
 * @notice Despliegue del camino fiat.
 * @dev USDC nativo en Arbitrum Sepolia: 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d
 *      USDC nativo en Arbitrum One:     0xaf88d065e77c8cC2239327C5EDb3A432268e5831
 */
contract DeployScript is Script {
    uint64 internal constant REVOCATION_WINDOW = 180 days;
    uint16 internal constant PLATFORM_FEE_BPS = 500;

    function run() external {
        address admin = vm.envAddress("SAUCE_ADMIN");
        address treasury = vm.envAddress("SAUCE_TREASURY");
        address usdc = vm.envAddress("SAUCE_USDC");
        address issuer = vm.envAddress("SAUCE_ISSUER");
        address settler = vm.envAddress("SAUCE_SETTLER");

        vm.startBroadcast();

        CreatorRegistry creators = new CreatorRegistry(admin);
        ContentRegistry contents = new ContentRegistry(address(creators));
        LicenseNFT licenses = new LicenseNFT(address(contents), admin, REVOCATION_WINDOW);
        SettlementVault vault = new SettlementVault(usdc, treasury, admin, PLATFORM_FEE_BPS);

        console.log("CreatorRegistry ", address(creators));
        console.log("ContentRegistry ", address(contents));
        console.log("LicenseNFT      ", address(licenses));
        console.log("SettlementVault ", address(vault));
        console.log("");
        console.log("Pendiente desde la cuenta admin:");
        console.log("  licenses.grantRole(ISSUER_ROLE, %s)", issuer);
        console.log("  vault.grantRole(SETTLER_ROLE, %s)", settler);

        vm.stopBroadcast();
    }
}
