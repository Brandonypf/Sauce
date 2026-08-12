# SAUCE Web3 Runbook — Arbitrum Sepolia

## Red desplegada

- Chain ID: `421614`
- CreatorRegistry: `0x7c400646002d9e0f792d625908c28c8d2ba21307`
- ContentRegistry: `0xee3e374d202a1f8c6560b9d0a2ca3c34c67f6e0e`
- LicenseNFT: `0xbd3a690551424c658cb28d550feed767f92a65a0`
- SettlementVault: `0x2a6180da8a27c5ab8319ca78d8f9ed5e441fb50d`
- Native USDC (Arbitrum Sepolia): `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`

## Evidencia Fase 7.1

Registro real de contenido:

- TX: `0x900c0279ebe0919a426388af5ecede711ab1972740ef52c7052516b6fa2f4cdb`
- Block: `297424908`
- Gas: `234294`
- Content ID: `1`
- ContentRegistry: `0xee3e374d202a1f8c6560b9d0a2ca3c34c67f6e0e`

## Prueba Fase 7

Terminal 1:

```bash
cd backend
npm run dev
```

Terminal 2:

```bash
cd backend
export CREATOR_PRIVATE_KEY='0x...'
npm run verify:sepolia
```

El relayer debe ser distinto del creador.

## Prueba completa voucher + licencia + settlement

Requiere una wallet compradora distinta y USDC de Arbitrum Sepolia para el relayer.

```bash
cd backend
export CREATOR_PRIVATE_KEY='0x...'
export BUYER_PRIVATE_KEY='0x...'
npm run verify:web3:sepolia
```

El script:

1. crea/reutiliza una identidad de comprador;
2. vincula su wallet con SIWE simplificado;
3. compra una obra pagada con el checkout mock;
4. fuerza el `issue_voucher` específico de esa orden;
5. canjea el voucher en `LicenseNFT` con una transacción real de la wallet compradora;
6. fuerza el `settle_order` específico;
7. comprueba `SettlementVault.accrued()`.

Si el relayer no tiene USDC suficiente, Fase 9 queda bloqueada por fondos de testnet, no por código.

## Seguridad

Nunca pongas private keys en Git, `.env.example`, commits, screenshots ni mensajes. Solo se usan en la terminal local.
