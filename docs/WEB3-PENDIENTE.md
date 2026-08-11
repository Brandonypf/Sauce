# Web3: qué falta para cerrar el ciclo on-chain

Estado tras la Fase 3. El flujo Web2 está completo y probado; la parte on-chain
sigue bloqueada por una razón concreta y conocida.

## El bloqueo

`ContentRegistry.registerContent` exige que `msg.sender` sea el creador:

```solidity
function registerContent(...) external onlyActiveCreator returns (uint256)
```

El relayer firma con la llave de la plataforma, que no es el creador. Por eso
`works.content_id` nunca se rellena, y `fulfillOrder()` solo emite voucher si hay
`content_id`. Sin resolverlo, el recibo on-chain no puede existir.

**No se resuelve dando un rol de registrador al backend.** Todo el valor de la
procedencia on-chain es que fue *el creador* quien atestiguó tener los derechos.
Una registración firmada por la plataforma convierte esa afirmación en "la
plataforma dice que el creador dijo", que es justo lo que ya no se puede
verificar.

## Lo que hace falta

Una función nueva en `ContentRegistry`:

```solidity
function registerContentWithSig(
    address creator,
    string  calldata title,
    string  calldata metadataURI,
    bytes32 contentHash,
    uint256 referencePrice,
    uint256 nonce,
    uint64  deadline,
    bytes   calldata signature
) external returns (uint256 contentId);
```

Debe: recuperar el firmante del EIP-712, exigir `signer == creator`, comprobar
que el creador está registrado y activo, validar nonce y deadline, y guardar
`creator` como autor aunque `msg.sender` sea el relayer.

Tres detalles que suelen hacerse mal:

- **Nonce por creador más deadline**, con `chainId` y `verifyingContract` en el
  dominio EIP-712. `contentIdByHash` ya rechazaría un replay literal, pero el
  nonce es lo que permite extender el patrón a `updateContent`, donde no hay
  unicidad natural que proteja.
- **Guardar la firma en Postgres**, no solo enviarla. Aunque la transacción nunca
  llegue a la cadena, tienes una atestación verificable de que el creador reclamó
  esos derechos en esa fecha.
- **Permite lotes.** Como envía el relayer, `registerContentBatchWithSig` mete
  veinte registros en una transacción.

## Lo que ya está preparado en el backend

| Pieza | Estado |
|---|---|
| `outbox` con `kind = 'register_content'` | encola correctamente al publicar |
| Patrón outbox transaccional | publicar y encolar ocurren en el mismo COMMIT |
| Relayer con escritor único (`pg_try_advisory_lock`) | listo |
| Backoff exponencial y reintentos | listo |
| `works.content_id` nullable con índice único | listo |
| `issue_voucher` reencolado si falta `content_id` o wallet | listo |
| Firma EIP-712 de vouchers (`lib/voucher.ts`) | funcionando; sirve de referencia |

Lo único que falta en el backend es el manejador real dentro de
`src/relayer/index.ts`, que hoy solo hace `console.log`.

## Segundo bloqueo, independiente

Un comprador sin wallet no puede recibir voucher: un voucher EIP-712 nombra una
dirección concreta. El entitlement y el acceso al contenido funcionan igual —eso
lo decide el backend—, y al vincular wallet queda `issue_voucher` en la cola.

No se generan wallets custodiales: guardar llaves privadas de terceros cambia el
perfil de riesgo del proyecto entero y el comprador no notaría ninguna diferencia.

## Orden sugerido

1. `registerContentWithSig` en el contrato, con sus tests de replay y expiración
2. Firma del creador en el navegador al publicar
3. Manejador `register_content` en el relayer
4. Despliegue a Arbitrum Sepolia y actualización de `CHAIN_ID`, `RPC_URL` y direcciones
5. Manejador `issue_voucher`
6. Cierre de época y `settleBatch`

Los pasos 1 a 3 no tocan nada del flujo Web2 y pueden hacerse sin riesgo.
