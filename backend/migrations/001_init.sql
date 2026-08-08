-- Esquema inicial de SAUCE.
--
-- Casi todas las restricciones de este archivo existen por una razon de
-- concurrencia, no de limpieza. Cuando varias cuentas se registran o publican al
-- mismo tiempo, o cuando la pasarela reenvia un webhook, lo unico que impide una
-- doble escritura es un indice unico dentro de una transaccion. Ninguna cantidad
-- de replicas de la API cambia eso, y varias replicas lo empeoran.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- identidades

CREATE TABLE users (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet      text NOT NULL,
    email       text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Las direcciones se guardan en minuscula. Sin esto, la misma wallet en
-- distinto casing crea dos usuarios y las licencias quedan repartidas.
CREATE UNIQUE INDEX users_wallet_key ON users (lower(wallet));

CREATE TABLE creators (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    handle          text NOT NULL,
    name            text NOT NULL,
    bio             text NOT NULL DEFAULT '',
    profile_uri     text NOT NULL DEFAULT '',
    payout_address  text,
    onchain_tx      text,
    status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- El caso que preguntaste: dos personas eligiendo el mismo handle a la vez. Una
-- de las dos transacciones recibe 23505 y la API responde 409. Un "SELECT y si no
-- existe INSERT" en el codigo de la aplicacion NO resuelve esto.
CREATE UNIQUE INDEX creators_handle_key ON creators (lower(handle));
CREATE UNIQUE INDEX creators_user_key ON creators (user_id);

-- ------------------------------------------------------------------ catalogo

CREATE TABLE works (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id      uuid NOT NULL REFERENCES creators (id) ON DELETE RESTRICT,
    slug            text NOT NULL,
    content_id      bigint,
    title           text NOT NULL,
    description     text NOT NULL DEFAULT '',
    category        text NOT NULL,
    cover_url       text NOT NULL DEFAULT '',
    content_hash    text NOT NULL,
    price_minor     bigint NOT NULL CHECK (price_minor >= 0),
    price_currency  text NOT NULL DEFAULT 'PEN',
    status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'withdrawn')),
    published_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX works_slug_key ON works (lower(slug));

-- Espeja `contentIdByHash` del ContentRegistry: la misma obra no se publica dos
-- veces aunque dos peticiones simultaneas lo intenten.
CREATE UNIQUE INDEX works_content_hash_key ON works (content_hash);
CREATE UNIQUE INDEX works_content_id_key ON works (content_id) WHERE content_id IS NOT NULL;
CREATE INDEX works_creator_idx ON works (creator_id);
CREATE INDEX works_published_idx ON works (published_at DESC) WHERE status = 'published';

-- -------------------------------------------------------------------- ordenes

CREATE TABLE orders (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    work_id          uuid NOT NULL REFERENCES works (id) ON DELETE RESTRICT,
    status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
    currency         text NOT NULL,
    amount_minor     bigint NOT NULL CHECK (amount_minor > 0),

    -- El tipo de cambio se congela al abrir el checkout, no al liquidar. Si se
    -- calcula despues, lo que se le debe al creador deja de coincidir con lo que
    -- pago el comprador.
    fx_rate          numeric(20, 10) NOT NULL,
    fx_locked_at     timestamptz NOT NULL,
    usdc_amount      bigint NOT NULL CHECK (usdc_amount > 0),

    gateway          text NOT NULL,
    gateway_ref      text,
    idempotency_key  text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    paid_at          timestamptz
);

-- Doble clic en "Comprar" produce una sola orden.
CREATE UNIQUE INDEX orders_idempotency_key ON orders (idempotency_key);
CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders (status) WHERE status = 'pending';

-- Un usuario no puede tener dos ordenes pendientes de la misma obra a la vez.
CREATE UNIQUE INDEX orders_one_pending_per_work
    ON orders (user_id, work_id) WHERE status = 'pending';

-- La pasarela reintenta. Reintenta mucho. Este indice es lo que convierte
-- "procesar el webhook" en una operacion idempotente.
CREATE TABLE gateway_events (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider     text NOT NULL,
    event_id     text NOT NULL,
    order_id     uuid REFERENCES orders (id) ON DELETE SET NULL,
    payload      jsonb NOT NULL,
    received_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX gateway_events_key ON gateway_events (provider, event_id);

-- ------------------------------------------------------- licencias y vouchers

CREATE TABLE vouchers (
    order_id      uuid PRIMARY KEY REFERENCES orders (id) ON DELETE CASCADE,
    to_address    text NOT NULL,
    content_id    bigint NOT NULL,
    amount        bigint NOT NULL DEFAULT 1,
    expiry        timestamptz NOT NULL,
    signature     text NOT NULL,
    signed_at     timestamptz NOT NULL DEFAULT now(),
    redeemed_at   timestamptz,
    redeem_tx     text,
    cancelled_at  timestamptz
);

CREATE TABLE entitlements (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    work_id     uuid NOT NULL REFERENCES works (id) ON DELETE RESTRICT,
    order_id    uuid REFERENCES orders (id) ON DELETE SET NULL,
    source      text NOT NULL DEFAULT 'purchase'
                CHECK (source IN ('purchase', 'gift', 'grant')),
    revoked_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- La verdad sobre "este usuario tiene esta obra". No el saldo del token, no
-- localStorage. Unico mientras no este revocado.
CREATE UNIQUE INDEX entitlements_active_key
    ON entitlements (user_id, work_id) WHERE revoked_at IS NULL;
CREATE INDEX entitlements_user_idx ON entitlements (user_id);

-- ------------------------------------------------------------------- sesiones

CREATE TABLE siwe_nonces (
    nonce       text PRIMARY KEY,
    issued_at   timestamptz NOT NULL DEFAULT now(),
    used_at     timestamptz
);

CREATE TABLE sessions (
    id          text PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions (user_id);

-- --------------------------------------------------------------------- outbox

-- Todo lo que toca la cadena pasa por aqui. La transaccion que marca una orden
-- como pagada tambien encola el trabajo on-chain, en el mismo COMMIT: o pasan las
-- dos cosas o no pasa ninguna. Escribir en la cadena dentro del handler del
-- webhook es como se pierden pagos cuando la RPC falla.
CREATE TABLE outbox (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind             text NOT NULL,
    payload          jsonb NOT NULL,
    status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    attempts         int NOT NULL DEFAULT 0,
    last_error       text,
    next_attempt_at  timestamptz NOT NULL DEFAULT now(),
    tx_hash          text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbox_claimable_idx ON outbox (next_attempt_at)
    WHERE status IN ('pending', 'processing');

-- -------------------------------------------------------------- liquidaciones

CREATE TABLE settlement_batches (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id      text NOT NULL,
    epoch_start   timestamptz NOT NULL,
    epoch_end     timestamptz NOT NULL,
    gross_usdc    bigint NOT NULL,
    status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed')),
    tx_hash       text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX settlement_batches_key ON settlement_batches (batch_id);

CREATE TABLE settlement_lines (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id      uuid REFERENCES settlement_batches (id) ON DELETE CASCADE,
    order_id      uuid NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
    creator_id    uuid NOT NULL REFERENCES creators (id) ON DELETE RESTRICT,
    usdc_amount   bigint NOT NULL CHECK (usdc_amount > 0),
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Una orden se liquida una sola vez, aunque el job de cierre de epoca se corra
-- dos veces o dos replicas lo disparen a la vez.
CREATE UNIQUE INDEX settlement_lines_order_key ON settlement_lines (order_id);
CREATE INDEX settlement_lines_batch_idx ON settlement_lines (batch_id);
