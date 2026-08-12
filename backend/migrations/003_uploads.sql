-- Subidas de archivos.
--
-- Los archivos NO pasan por la API. Una novela visual puede pesar varios GB, y
-- subirla a través de Fastify bloquea el proceso, choca con los límites de cuerpo
-- y paga el ancho de banda dos veces: entrada al servidor y salida al
-- almacenamiento. Con varias réplicas es peor, porque una subida a medias queda
-- atada al pod que la recibió.
--
-- El navegador pide una URL prefirmada, sube directo al almacenamiento, y avisa
-- al backend cuando termina. Esta tabla es lo que hace esa conversación
-- verificable: sin ella, "ya subí el archivo" sería otra cosa que el cliente
-- afirma y el servidor cree.

CREATE TYPE upload_status AS ENUM ('pending', 'completed', 'aborted', 'expired');

CREATE TABLE uploads (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,

    filename      text NOT NULL,
    mime_type     text NOT NULL,

    -- Tamaño declarado al abrir la subida. Al completarla se compara con el real:
    -- si no coinciden, la subida se corta. Sin esto alguien pide permiso para 2 MB
    -- y escribe 40 GB.
    declared_size bigint NOT NULL CHECK (declared_size > 0),
    actual_size   bigint CHECK (actual_size IS NULL OR actual_size > 0),

    -- SHA-256 que calcula el navegador antes de subir. El mismo hash sirve para
    -- tres cosas: verificar la descarga, detectar que dos creadores subieron el
    -- mismo binario, y ser el `contentHash` de la atestación on-chain.
    checksum      text,

    storage_key   text NOT NULL,
    storage_driver text NOT NULL DEFAULT 'local',

    status        upload_status NOT NULL DEFAULT 'pending',
    purpose       text NOT NULL DEFAULT 'content'
                  CHECK (purpose IN ('content', 'cover', 'chapter', 'media')),

    -- Una subida abierta que nadie completa ocupa espacio para siempre. Un job de
    -- limpieza borra las vencidas del almacenamiento.
    expires_at    timestamptz NOT NULL DEFAULT now() + interval '24 hours',
    completed_at  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uploads_storage_key_key ON uploads (storage_key);
CREATE INDEX uploads_user_idx ON uploads (user_id, created_at DESC);
CREATE INDEX uploads_pending_idx ON uploads (expires_at) WHERE status = 'pending';

-- Un archivo idéntico no se sube dos veces: la segunda vez se reutiliza el
-- primero. Parcial sobre `completed` porque un checksum solo es de fiar cuando
-- la subida terminó y el servidor lo verificó.
CREATE UNIQUE INDEX uploads_checksum_key
    ON uploads (checksum) WHERE status = 'completed' AND checksum IS NOT NULL;

-- Trozos de una subida multiparte.
--
-- Es lo que hace que subir 1,4 GB con una conexión inestable no se pierda entero
-- al minuto 40: cada trozo se reintenta por su cuenta.
CREATE TABLE upload_parts (
    upload_id    uuid NOT NULL REFERENCES uploads (id) ON DELETE CASCADE,
    part_number  int NOT NULL CHECK (part_number BETWEEN 1 AND 10000),
    etag         text,
    size_bytes   bigint CHECK (size_bytes IS NULL OR size_bytes > 0),
    uploaded_at  timestamptz,
    PRIMARY KEY (upload_id, part_number)
);

-- Enlaza la obra con el archivo que la respalda.
ALTER TABLE works
    ADD COLUMN cover_upload_id uuid REFERENCES uploads (id) ON DELETE SET NULL;

ALTER TABLE releases
    ADD COLUMN upload_id uuid REFERENCES uploads (id) ON DELETE SET NULL;

ALTER TABLE chapters
    ADD COLUMN upload_id uuid REFERENCES uploads (id) ON DELETE SET NULL;
