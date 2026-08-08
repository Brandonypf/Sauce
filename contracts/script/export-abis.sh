#!/usr/bin/env bash
# Regenera contracts/abi/ desde el codigo fuente.
#
# Los ABI son artefactos de build, pero se versionan a proposito: el frontend y el
# backend los importan directamente y no compilan Solidity. Regenerar despues de
# cada cambio en src/ es obligatorio; un ABI viejo no falla al compilar, falla en
# runtime con datos mal decodificados.
set -euo pipefail

cd "$(dirname "$0")/.."

CONTRACTS=(CreatorRegistry ContentRegistry LicenseNFT SettlementVault ISplitEngine)

mkdir -p abi
forge build --use "${SOLC:-solc}" >/dev/null

for name in "${CONTRACTS[@]}"; do
    forge inspect --use "${SOLC:-solc}" "$name" abi --json > "abi/${name}.json"
    echo "abi/${name}.json"
done
