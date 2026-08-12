# Web3: estado actualizado

## Fase 6 — Deploy y roles

- CreatorRegistry desplegado en Arbitrum Sepolia.
- ContentRegistry desplegado.
- LicenseNFT desplegado.
- SettlementVault desplegado.
- `ISSUER_ROLE` verificado.
- `SETTLER_ROLE` verificado.

## Fase 7 — Registro de contenido

### Implementado

- `ContentRegistry.registerContentWithSig`.
- Persistencia de la firma EIP-712.
- Outbox `register_content`.
- Relayer único con advisory lock.
- Idempotencia por `works.content_id`, `contentIdByHash` y `tx_hash`.
- Simulación previa a gastar gas para exponer custom errors.
- Firma desde `PublishForm` cuando hay wallet conectada.
- Registro on-chain del creador desde la wallet si todavía no existe.

### Pendiente de prueba

- Ejecutar `npm run verify:sepolia` contra la red real después de las últimas correcciones.

## Fase 8 — Licencia

- El backend firma vouchers EIP-712.
- El relayer procesa `issue_voucher` cuando existe `content_id` y wallet del comprador.
- El frontend puede obtener la transacción `redeem` y emitir la licencia desde la wallet del comprador.

Pendiente de prueba real: compra -> voucher -> `LicenseNFT.redeem`.

## Fase 9 — Settlement

- El relayer procesa `settle_order`.
- Consulta `CreatorRegistry.payoutOf`.
- Crea la línea/batch en PostgreSQL.
- Aprueba USDC al `SettlementVault` si hace falta.
- Ejecuta `settleBatch` con idempotencia.

Pendiente de prueba real: la cuenta del relayer debe disponer de USDC de Arbitrum Sepolia suficiente para cubrir una venta de prueba.

## Regla

No considerar una fase cerrada solo por compilación o tests locales. La evidencia de Sepolia debe incluir hash de transacción, bloque, status y estado correspondiente en PostgreSQL/contrato.
