-- Firma EIP-712 del creador para el registro on-chain.
--
-- El creador firma fuera de cadena —gratis, sin ETH— y el relayer envia la
-- transaccion y paga el gas. Esta tabla es donde vive esa firma entre ambos
-- momentos, que pueden estar separados por minutos u horas.
--
-- Guardarla tiene un segundo valor, independiente de la cadena: aunque la
-- transaccion no llegue a enviarse nunca, queda una atestacion verificable de
-- que el creador reclamo esos derechos en esa fecha. Eso es exactamente la
-- evidencia de licenciamiento que el proyecto necesita.

CREATE TABLE content_registrations (
    work_id          uuid PRIMARY KEY REFERENCES works (id) ON DELETE CASCADE,

    -- Direccion que firmo. Puede diferir de `users.wallet` si el creador la
    -- cambia despues, asi que se congela aqui: la firma solo vale para esta.
    creator_address  text NOT NULL,

    -- Los campos exactos que cubre la firma. Se guardan todos porque el relayer
    -- tiene que reconstruir el RegisterRequest byte a byte: cambiar una coma del
    -- titulo invalida la firma y el contrato responde InvalidSignature.
    title            text NOT NULL,
    metadata_uri     text NOT NULL DEFAULT '',
    content_hash     text NOT NULL,
    reference_price  numeric(78, 0) NOT NULL DEFAULT 0,
    nonce            numeric(78, 0) NOT NULL,
    deadline         bigint NOT NULL,

    signature        text NOT NULL,

    -- Dominio EIP-712 con el que se firmo. Si el backend se reconfigura a otra
    -- red o se redespliega el contrato, las firmas viejas dejan de valer y esto
    -- permite detectarlo en vez de gastar gas en transacciones que revierten.
    chain_id         bigint NOT NULL,
    verifying_contract text NOT NULL,

    signed_at        timestamptz NOT NULL DEFAULT now(),
    submitted_at     timestamptz,
    tx_hash          text,
    confirmed_at     timestamptz
);

CREATE INDEX content_registrations_pending_idx
    ON content_registrations (signed_at) WHERE confirmed_at IS NULL;

-- Una transaccion confirmada no puede repetirse. El indice parcial permite
-- muchos NULL mientras estan pendientes, y unicidad en cuanto hay hash.
CREATE UNIQUE INDEX content_registrations_tx_key
    ON content_registrations (tx_hash) WHERE tx_hash IS NOT NULL;
