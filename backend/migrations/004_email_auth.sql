-- Autenticación con email y contraseña, con la wallet como vínculo opcional.
--
-- Hasta ahora la identidad ERA la wallet: `users.wallet` era NOT NULL, así que no
-- existía forma de tener cuenta sin una. Eso obliga al comprador a instalar
-- MetaMask antes de poder mirar el catálogo, que es exactamente la barrera que la
-- plataforma quiere quitar.
--
-- Después de esta migración un usuario puede existir con email, con wallet, o con
-- ambos. La blockchain pasa a ser infraestructura, no requisito de entrada.
--
-- No destructiva: no borra filas ni columnas. Los usuarios creados por SIWE
-- siguen funcionando igual, con `password_hash` en NULL.

ALTER TABLE users
    ALTER COLUMN wallet DROP NOT NULL;

ALTER TABLE users
    ADD COLUMN password_hash text,
    ADD COLUMN display_name  text,
    ADD COLUMN email_verified boolean NOT NULL DEFAULT false,
    ADD COLUMN last_login_at timestamptz;

-- El índice antiguo era UNIQUE sobre lower(wallet). Postgres ya permite varios
-- NULL en un índice único, así que técnicamente seguiría funcionando — pero se
-- rehace como parcial para que la intención quede escrita y no dependa de un
-- detalle del motor que alguien podría no conocer.
DROP INDEX IF EXISTS users_wallet_key;

CREATE UNIQUE INDEX users_wallet_key
    ON users (lower(wallet)) WHERE wallet IS NOT NULL;

-- Mismo motivo del lado del email: único cuando existe, libre cuando no.
-- `lower()` porque nadie recuerda si se registró con mayúscula inicial.
CREATE UNIQUE INDEX users_email_key
    ON users (lower(email)) WHERE email IS NOT NULL;

-- Una cuenta tiene que ser alcanzable por algo. Sin esta comprobación se pueden
-- crear filas huérfanas que nadie puede volver a usar y que ocupan el id para
-- siempre.
ALTER TABLE users
    ADD CONSTRAINT users_has_identity
    CHECK (wallet IS NOT NULL OR email IS NOT NULL);

-- Una cuenta con email pero sin contraseña no puede iniciar sesión. Se permite
-- únicamente si llegó por wallet (el caso de vincular email más tarde).
ALTER TABLE users
    ADD CONSTRAINT users_email_needs_password
    CHECK (email IS NULL OR password_hash IS NOT NULL OR wallet IS NOT NULL);

-- Intentos de acceso fallidos, para poder frenar la fuerza bruta por cuenta y no
-- solo por IP. Un atacante con muchas IP y una sola cuenta objetivo pasa por
-- debajo de un límite basado solo en IP.
CREATE TABLE login_attempts (
    id          bigserial PRIMARY KEY,
    email       text NOT NULL,
    ip          text,
    succeeded   boolean NOT NULL,
    attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX login_attempts_email_idx
    ON login_attempts (lower(email), attempted_at DESC);
