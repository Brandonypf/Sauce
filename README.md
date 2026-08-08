# SAUCE

Plataforma de distribución de contenido otaku licenciado. Pago en moneda local,
cobro del creador en USDC sobre Arbitrum.

```
frontend/    Next.js 14, exportación estática, envuelto en Electron
backend/     Fastify + Postgres. Órdenes, licencias, firma de vouchers
contracts/   Solidity. Registro de obras, licencias ERC-1155, liquidación
stylus/      Rust sobre Arbitrum Stylus. Motor de reparto por lotes
k8s/         Manifiestos de despliegue
docs/        Auditoría de contratos y alcance de lo que va on-chain
```

---

## 1. Qué hace cada capa, y por qué está separada

**El frontend no puede ser el backend.** Se exporta estático (`output: "export"`),
así que no hay servidor de Next: no hay dónde recibir un webhook, ni dónde guardar
la llave que firma vouchers, ni dónde decidir si se entregan los bytes de una obra.
Esa llave en el navegador significa que cualquiera se emite licencias gratis.

Esa restricción no es accidental. `frontend/desktop/` empaqueta la exportación en
Electron, y una app de escritorio no puede depender de rutas de servidor. De ahí
que el backend sea un servicio aparte al que el navegador llama por CORS.

**El backend no puede ser los contratos.** La cadena es lenta, pública y cara. Los
precios cambian, el tipo de cambio se mueve, las órdenes se reembolsan y los datos
personales se borran por ley. Nada de eso pertenece a un registro inmutable.
`docs/ONCHAIN-SCOPE.md` desarrolla dónde se pone cada cosa.

---

## 2. El flujo de compra, de punta a punta

```
1. El usuario conecta su wallet     →  wagmi/RainbowKit, solo en el navegador
2. Firma un nonce                   →  POST /api/auth/verify, abre sesión
3. Pulsa "Comprar"                  →  POST /api/checkout, orden PENDING
4. Se va a la pasarela              →  redirección fuera de la aplicación
5. La pasarela cobra y avisa        →  POST /api/webhooks/:provider
6. El backend cumple la orden       →  PAID + entitlement + voucher firmado
7. El usuario abre su obra          →  POST /api/works/:slug/access → URL firmada
8. (Opcional) reclama el recibo     →  LicenseNFT.redeem() desde su wallet
9. Cierre de época                  →  SettlementVault.settleBatch()
10. El creador cobra                →  SettlementVault.withdraw() en USDC
```

Cinco decisiones dentro de ese flujo merecen explicación.

### El usuario se va de la aplicación (paso 4)

El panel de compra antes simulaba todo con un `setTimeout` de 1,6 segundos que
terminaba en éxito. El flujo real no tiene esa forma: hay una redirección, y la
licencia aparece cuando llega el webhook — que puede ser antes o después de que el
usuario vuelva. Por eso `purchase-panel.tsx` no marca nada como comprado al
redirigir; solo el paso 6 crea el derecho.

### El tipo de cambio se congela al abrir el checkout (paso 3)

Tu diagrama calculaba el equivalente en USDC *después* de crear la orden. Si el
tipo se recalcula al liquidar, lo que se le debe al creador deja de coincidir con
lo que pagó el comprador, y la diferencia sale de alguien. Ahora se fija en el
paso 3 y se guarda con la orden (`fx_rate`, `fx_locked_at`).

### El webhook es idempotente (paso 5)

Stripe y Mercado Pago reenvían. Reenvían mucho, fuera de orden, y a veces después
de que el usuario ya volvió. `fulfillOrder()` inserta primero en `gateway_events`,
que tiene un índice único sobre `(provider, event_id)`: si ese INSERT choca, el
evento ya se procesó y se sale sin tocar nada. Una entrega duplicada es una
operación sin efecto, no dos licencias.

### El código de licencia desapareció (paso 8)

Tu diagrama tenía "usuario ingresa código de licencia" con validación y un camino
de "código inválido". Se reemplazó por un voucher EIP-712.

Un código aleatorio en la base de datos es un secreto compartido: hay que
adivinarlo o robarlo, y obliga a limitar intentos porque es fuerza bruta. Un
voucher firmado no es un secreto — se puede publicar entero. Solo sirve para la
dirección que nombra, solo una vez, y el contrato lo verifica sin consultar a
nadie. No hay nada que teclear ni nada que adivinar.

Además, el canje es opcional y no bloquea el acceso. El comprador ya pagó; el
recibo on-chain es una prueba adicional que sobrevive a la plataforma.

### El acceso al contenido se decide en el servidor (paso 7)

**Un saldo de token no puede proteger un archivo.** Cualquiera puede leer
`balanceOf`, pero solo este servidor decide si entrega los bytes.
`POST /api/works/:slug/access` consulta `entitlements` en cada acceso y devuelve
una URL firmada que caduca en minutos.

Esto fue un cambio de raíz. Antes la propiedad vivía en `localStorage` vía zustand
y el panel de compra la escribía tras el `setTimeout` — cualquiera con la consola
abierta se regalaba el catálogo. `lib/store.ts` ahora es solo un cache en memoria,
**deliberadamente sin `persist`**: un cache que sobrevive a la recarga vuelve a
parecer una fuente de verdad.

---

## 3. Concurrencia — y por qué Kubernetes no la resuelve

Preguntaste si hace falta Kubernetes para varias cuentas registrándose o
publicando a la vez. **Kubernetes no resuelve eso.** Da escalado horizontal y
disponibilidad; la corrección bajo concurrencia es un problema de base de datos.
Aplicado sin cuidado lo empeora, porque más réplicas son más procesos compitiendo
por las mismas filas.

Dos personas pidiendo el mismo handle en el mismo instante se resuelve con un
índice único dentro de una transacción, o no se resuelve. Esto **no** funciona:

```ts
const existe = await db.query("SELECT 1 FROM creators WHERE handle = $1", [handle]);
if (!existe.rowCount) await db.query("INSERT INTO creators ...");  // ← carrera
```

Entre el SELECT y el INSERT cabe la otra petición. Con un proceso ya es frágil;
con tres réplicas falla a diario. Lo que sí funciona es dejar que Postgres decida:

```sql
CREATE UNIQUE INDEX creators_handle_key ON creators (lower(handle));
```

y traducir el error 23505 a un 409. Cada restricción en `migrations/001_init.sql`
está por una razón de concurrencia concreta, comentada en su sitio.

`backend/test/concurrency.test.ts` lo comprueba contra Postgres de verdad, no
contra un mock — lanzando N operaciones en paralelo, que es lo que harían N
réplicas:

| Escenario | Intentos simultáneos | Éxitos |
|---|---|---|
| Mismo handle de creador | 20 | 1 |
| Mismo archivo publicado | 10 | 1 |
| Mismo webhook reentregado | 5 | 1 |
| Mismo checkout (doble clic) | 8 | 1 |
| Bloqueo del relayer | 2 | 1 |

### Dónde escalar sí rompe cosas

Hay un proceso que **no** se puede escalar, y es lo contrario de lo que uno
esperaría: el relayer.

Cada transacción de Ethereum lleva un nonce que tiene que ser consecutivo por cada
dirección que firma. Si dos réplicas leen el nonce a la vez —las dos ven 42— ambas
envían una transacción con nonce 42. Una entra; la otra se rechaza o, si paga más
gas, reemplaza a la primera. Y como la siguiente espera el 43, **la cola se atasca
entera**.

Por eso hay dos defensas, y las dos a propósito:

1. `replicas: 1` y `strategy: Recreate` en `k8s/relayer.yaml`.
2. `pg_try_advisory_lock` en `src/relayer/index.ts`.

La primera se deshace con un `kubectl scale`. La segunda no: los pods de más
arrancan, no consiguen el bloqueo y se quedan inactivos sin tocar la cola. Un
comentario se puede ignorar; un bloqueo no.

Si el volumen algún día lo exige, la salida no es subir `replicas` — es repartir el
trabajo entre varias direcciones firmantes, cada una con su proceso y su nonce.

### El patrón outbox

Nada escribe en la cadena dentro del handler de una petición. La transacción que
marca una orden como pagada **también** encola el trabajo on-chain, en el mismo
COMMIT: o pasan las dos cosas o no pasa ninguna.

Si el webhook enviara la transacción en línea, un fallo de RPC devolvería 500, la
pasarela reintentaría, y el estado quedaría a medias — orden pagada sin licencia, o
licencia sin orden. El relayer consume la cola aparte, con reintentos y backoff
exponencial.

### ¿Hace falta Kubernetes entonces?

Para tu escala actual, no. `docker-compose.yml` levanta lo mismo y es mucho menos
que mantener. Lo que sí conviene adoptar ya es la **disciplina** que Kubernetes
exige, porque es la que hace posible escalar después sin reescribir:

- procesos sin estado (nada de sesiones en memoria)
- configuración por variables de entorno
- `SIGTERM` cierra conexiones en vuelo antes de salir
- liveness y readiness separadas
- migraciones seguras con varias réplicas arrancando a la vez

Ese último punto vale la pena: `migrate()` toma un bloqueo consultivo, así que la
primera réplica migra y las demás esperan y siguen. Sin él, dos pods ejecutando
`CREATE TABLE` a la vez hacen que uno entre en bucle de reinicio.

Una cosa que los manifiestos **no** resuelven: el rate limit es por pod, no global.
Con tres réplicas el límite real es el triple del configurado. Para limitar de
verdad hace falta un store compartido (Redis).

---

## 4. Levantarlo

### Local, sin contenedores

```bash
# Base de datos
createdb sauce

# Contratos en cadena local
cd contracts
git submodule update --init --recursive
anvil &
forge script script/DeployLocal.s.sol \
  --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Backend
cd ../backend
cp .env.example .env          # las llaves del ejemplo son cuentas de anvil
npm install && npm run migrate && npm run dev

# Frontend
cd ../frontend
cp .env.example .env.local
npm install && npm run dev
```

### Con Docker

```bash
docker compose up --build
# web http://localhost:3000 · api http://localhost:4000
```

### Recorrer el flujo completo

1. Abre `/explore`, entra a una obra
2. Conecta la wallet y firma para iniciar sesión
3. "Comprar" → redirige a `/checkout/mock`
4. "Simular pago aprobado" → llama a `POST /api/dev/pay/:orderId`
5. Apareces en `/library` con la obra
6. "Reclamar recibo on-chain" → `/verify` → `LicenseNFT.redeem()`

El atajo del paso 4 está en `src/routes/dev.ts` y **no se registra con
`NODE_ENV=production`**. Es un atajo de tiempo, no de seguridad: pasa por el mismo
`fulfillOrder()` que el webhook real, con la misma comprobación de idempotencia.

### Pruebas

```bash
cd backend   && npm test         # 10 pruebas: concurrencia + flujo HTTP
cd contracts && forge test       # 45 pruebas
```

### Verificacion contra el servidor levantado

`npm test` usa `app.inject`, que salta la capa de red. Para medir de verdad hay un
script aparte que abre sockets HTTP reales, recorre el flujo completo, lanza 20
registros simultaneos del mismo handle y mide latencias por endpoint:

```bash
cd backend
npm run dev &                    # o docker compose up
DATABASE_URL=... npm run verify
```

---

## 5. Endpoints

| Método | Ruta | Sesión | Qué hace |
|---|---|---|---|
| GET | `/api/auth/nonce` | — | Emite nonce para firmar |
| POST | `/api/auth/verify` | — | Verifica firma, abre sesión |
| GET | `/api/auth/me` | — | Estado de sesión |
| POST | `/api/auth/logout` | — | Cierra sesión |
| GET | `/api/works` | — | Catálogo publicado |
| GET | `/api/works/:slug` | opcional | Ficha; incluye `owned` si hay sesión |
| POST | `/api/works/:slug/access` | sí | **Control de acceso real** → URL firmada |
| GET | `/api/creators/:handle` | — | Perfil y obras |
| POST | `/api/creators` | sí | Registro de creador |
| POST | `/api/works` | sí | Publicar obra |
| GET | `/api/creators/me/works` | sí | Obras propias |
| POST | `/api/checkout` | sí | Abre orden PENDING |
| GET | `/api/orders/:id` | sí | Orden + voucher firmado |
| POST | `/api/orders/:id/redeemed` | sí | Registra el canje |
| GET | `/api/library` | sí | Licencias del usuario |
| POST | `/api/webhooks/:provider` | HMAC | Cumple la orden (idempotente) |
| GET | `/health` `/ready` | — | Sondas de Kubernetes |

La sesión va en cookie `httpOnly`, no en `localStorage`: un token que puede leer
cualquier script inyectado no protege nada, y esta app carga imágenes y metadatos
de terceros.

---

## 6. Verificado

- `backend`: 10/10 pruebas contra PostgreSQL 16 real, repetibles
- `frontend`: `npm run build` → 25 rutas exportadas
- `contracts`: 45/45 pruebas, `forge fmt` limpio
- `DeployLocal.s.sol` despliega la pila en anvil y otorga los roles

### Corrida contra el servidor levantado (`npm run verify`)

Postgres 16 + anvil + backend en un solo host, sin latencia de red real.

| Endpoint | p50 | p95 | max |
|---|---|---|---|
| `GET /health` | 1,0 ms | 1,8 ms | 4,9 ms |
| `GET /ready` (toca Postgres) | 1,0 ms | 2,9 ms | 15,6 ms |
| `GET /api/works` | 1,0 ms | 3,3 ms | 3,8 ms |
| `GET /api/works/:slug` | 0,9 ms | 3,4 ms | 14,8 ms |
| `GET /api/library` | 1,4 ms | 11,9 ms | 12,9 ms |
| `POST /api/works/:slug/access` | 1,4 ms | 2,0 ms | 2,9 ms |

Ráfaga de 20 registros simultáneos del mismo handle sobre HTTP: 1 × 200, 19 × 409,
completada en 143 ms. Ningún 500, ningún timeout, ningún interbloqueo.

**No verificado:** las imágenes Docker y los manifiestos de Kubernetes no se
construyeron ni aplicaron (no hay Docker ni cluster en el entorno donde se
escribieron). El motor Stylus sigue sin compilar — falta toolchain de Rust; hay que
pasarle `cargo stylus check`.

---

## 7. Decisiones abiertas

0. **El relayer no puede registrar obras on-chain — bloqueante.**
   `ContentRegistry.registerContent` exige que `msg.sender` sea un creador
   registrado, pero el relayer firma con la llave de la plataforma. El resultado es
   que `content_id` nunca se rellena, y sin `content_id` no se emite ningún voucher:
   el recibo on-chain no funciona en la práctica. Dos salidas:

   **(a) que el creador firme desde su wallet.** Es la que recomiendo. Todo el
   sentido de la procedencia on-chain es que fue *el creador* quien atestiguó tener
   los derechos; una registración firmada por la plataforma debilita justamente la
   afirmación que hace valiosa a esa capa. Cuesta que el creador necesite gas.

   **(b) añadir `registerFor(creator, ...)` con `REGISTRAR_ROLE`.** Más cómodo,
   pero la atestación pasa a ser "la plataforma dice que este creador dijo".

1. **Exportación estática.** La tomé yo ante la falta de respuesta, para preservar
   Electron. Tiene un coste real: `generateStaticParams` fija el conjunto de
   páginas de obra en tiempo de compilación, así que **una obra publicada después
   de un build no tiene página de detalle hasta el siguiente build**. El catálogo y
   la biblioteca sí se actualizan solos porque piden datos desde el cliente. Si eso
   no es aceptable, hay que pasar a runtime de servidor y repensar qué envía
   Electron.

2. ~~**Dirección visual.**~~ **Resuelto.** Los tokens ya están declarados en
   `app/globals.css` con la paleta del spec del checkout: `#16162a` base, `#1e1e3f`
   superficie, `#D94F3D` acento, `#2D8A4E` éxito. Gana el vidrio oscuro. Queda
   pendiente cargar una fuente real con `next/font` — hoy `--font-inter` apunta a la
   pila del sistema.

3. **Qué página es la portada.** `/` la sirve `(marketing)`; el prototipo de vidrio
   vive en `/prototype`. Se decidió por omisión dos veces, nunca por ti.

4. **Dos fuentes de datos.** `lib/mock-data.ts` alimenta `/explore`, `/search` y la
   ficha de obra; `data/works.ts` alimenta el prototipo. La ficha ya pide el precio
   y la propiedad al backend, pero el resto sigue en mocks.

5. **`electron@31` está fuera de soporte** (actual: 43.x). No lo subí porque una
   actualización mayor de Electron no se puede validar aquí.

6. **`settleFromSales` no reparte por lotes.** La llamada al motor está acotada por
   el gas de un bloque. Pasados unos pocos miles de registros hay que fragmentar
   por `batchId` — conviene decidirlo antes de dimensionar las épocas de
   liquidación.
