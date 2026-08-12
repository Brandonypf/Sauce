-- Modelo de catálogo para juegos, manga y novelas visuales.
--
-- La migración 001 trataba una obra como un archivo con precio. Eso no aguanta
-- el catálogo real: un manga tiene capítulos que salen semanalmente, un juego
-- tiene builds por plataforma y parches, una novela visual tiene las dos cosas.
--
-- La decisión estructural, y la razón de casi todo lo que hay aquí:
--
--   La LICENCIA es sobre la obra, no sobre el archivo.
--
-- Un parche nuevo o un capítulo nuevo no emite una licencia nueva ni toca la
-- cadena. `works` sigue siendo la unidad vendible y la que tiene `content_id`
-- on-chain; los artefactos descargables viven aparte y cambian todo lo que
-- quieran. Si la licencia apuntara al archivo, cada parche invalidaría lo que
-- el comprador pagó.

-- ------------------------------------------------------------------- formato

-- Enum y no texto libre: el formato decide qué tabla de detalle aplica, y un
-- typo en un INSERT no puede crear un formato fantasma que nadie renderiza.
CREATE TYPE work_format AS ENUM ('game', 'manga', 'visual_novel', 'artbook', 'audio');

CREATE TYPE age_rating AS ENUM ('all_ages', 'teen', 'mature', 'adult');

ALTER TABLE works
    ADD COLUMN format work_format NOT NULL DEFAULT 'game',
    ADD COLUMN rating age_rating NOT NULL DEFAULT 'all_ages',
    ADD COLUMN synopsis text NOT NULL DEFAULT '',
    ADD COLUMN original_language text NOT NULL DEFAULT 'es',
    ADD COLUMN release_date date,
    ADD COLUMN is_series boolean NOT NULL DEFAULT false;

-- El catálogo se filtra por formato en casi todas las vistas.
CREATE INDEX works_format_idx ON works (format) WHERE status = 'published';

-- Contenido adulto: se necesita filtrar por rating en cada consulta pública,
-- así que el índice lo incluye en vez de forzar un filtro en memoria.
CREATE INDEX works_rating_idx ON works (rating, format) WHERE status = 'published';

-- ------------------------------------------------------------------ taxonomía

-- Géneros como tabla y no como columna de texto. `category text` obliga a que
-- "Shonen", "shonen" y "Shōnen" sean tres cosas distintas, y no permite que una
-- obra sea de dos géneros — que es el caso normal.
CREATE TABLE genres (
    id          smallserial PRIMARY KEY,
    slug        text NOT NULL,
    name_es     text NOT NULL,
    name_en     text NOT NULL,
    applies_to  work_format[] NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX genres_slug_key ON genres (slug);

CREATE TABLE work_genres (
    work_id   uuid NOT NULL REFERENCES works (id) ON DELETE CASCADE,
    genre_id  smallint NOT NULL REFERENCES genres (id) ON DELETE RESTRICT,
    PRIMARY KEY (work_id, genre_id)
);

CREATE INDEX work_genres_genre_idx ON work_genres (genre_id);

-- Etiquetas libres, separadas de los géneros a propósito: las etiquetas las
-- pone el creador y crecen sin control; los géneros son un vocabulario cerrado
-- que la plataforma controla y por el que se puede navegar.
CREATE TABLE work_tags (
    work_id  uuid NOT NULL REFERENCES works (id) ON DELETE CASCADE,
    tag      text NOT NULL,
    PRIMARY KEY (work_id, tag)
);

CREATE INDEX work_tags_tag_idx ON work_tags (tag);

-- --------------------------------------------------------- detalle por formato

-- Herencia por tablas en vez de un `metadata jsonb` genérico.
--
-- El JSONB es cómodo hasta que alguien escribe `{"platforms": "Windows"}` en vez
-- de un array y la vista de filtros deja de funcionar en silencio. Aquí el motor
-- no deja: cada formato tiene sus columnas, con sus tipos y sus CHECK.
--
-- Lo que SÍ va en JSONB es lo genuinamente libre —requisitos de sistema, que
-- cambian por juego y nadie consulta programáticamente.

CREATE TABLE game_details (
    work_id           uuid PRIMARY KEY REFERENCES works (id) ON DELETE CASCADE,
    engine            text,
    platforms         text[] NOT NULL DEFAULT '{}',
    input_methods     text[] NOT NULL DEFAULT '{}',
    avg_playtime_min  int CHECK (avg_playtime_min IS NULL OR avg_playtime_min > 0),
    multiplayer       boolean NOT NULL DEFAULT false,
    system_requirements jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE manga_details (
    work_id        uuid PRIMARY KEY REFERENCES works (id) ON DELETE CASCADE,
    reading_dir    text NOT NULL DEFAULT 'rtl' CHECK (reading_dir IN ('rtl', 'ltr', 'vertical')),
    is_colored     boolean NOT NULL DEFAULT false,
    volume_count   int CHECK (volume_count IS NULL OR volume_count > 0),

    -- En curso, terminado o abandonado. Importa para la decisión de compra: no
    -- es lo mismo comprar una serie cerrada que una que puede quedar a medias.
    publication_status text NOT NULL DEFAULT 'ongoing'
        CHECK (publication_status IN ('ongoing', 'completed', 'hiatus', 'cancelled'))
);

CREATE TABLE visual_novel_details (
    work_id         uuid PRIMARY KEY REFERENCES works (id) ON DELETE CASCADE,
    route_count     int CHECK (route_count IS NULL OR route_count > 0),
    ending_count    int CHECK (ending_count IS NULL OR ending_count > 0),
    has_voice_acting boolean NOT NULL DEFAULT false,
    voice_language  text,
    avg_playtime_min int CHECK (avg_playtime_min IS NULL OR avg_playtime_min > 0)
);

-- ------------------------------------------------------------------ artefactos

-- Lo que realmente se descarga.
--
-- Separado de `works` porque una obra tiene varios: el juego para Windows, el
-- mismo juego para Mac, el parche 1.0.2, el capítulo 47. Todos bajo la misma
-- licencia.
CREATE TABLE releases (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id       uuid NOT NULL REFERENCES works (id) ON DELETE CASCADE,
    version       text NOT NULL,
    channel       text NOT NULL DEFAULT 'stable'
                  CHECK (channel IN ('stable', 'beta', 'archived')),
    platform      text,
    language      text NOT NULL DEFAULT 'es',

    -- Clave en el almacenamiento de objetos (S3/R2). Nunca una URL: las URLs
    -- firmadas se generan al momento y caducan; guardarlas sería guardar un
    -- permiso vencido.
    storage_key   text NOT NULL,
    size_bytes    bigint NOT NULL CHECK (size_bytes > 0),

    -- SHA-256 del archivo. Permite al cliente verificar la descarga y detectar
    -- que dos creadores subieron el mismo binario.
    checksum      text NOT NULL,

    changelog     text NOT NULL DEFAULT '',
    published_at  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Una versión por plataforma e idioma. Sin esto, republicar la 1.0.2 por error
-- crea dos filas y el cliente descarga la que le toque.
CREATE UNIQUE INDEX releases_version_key
    ON releases (work_id, version, coalesce(platform, ''), language);

CREATE INDEX releases_work_idx ON releases (work_id, published_at DESC);
CREATE UNIQUE INDEX releases_checksum_key ON releases (checksum);

-- ------------------------------------------------------------------ capítulos

-- Contenido serializado: capítulos de manga, episodios.
--
-- Tabla aparte de `releases` porque el orden importa y se navega, mientras que
-- una release es un artefacto suelto que se descarga.
CREATE TABLE chapters (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id       uuid NOT NULL REFERENCES works (id) ON DELETE CASCADE,
    number        numeric(8, 2) NOT NULL,
    volume        int,
    title         text NOT NULL DEFAULT '',
    page_count    int CHECK (page_count IS NULL OR page_count > 0),
    storage_key   text NOT NULL,
    size_bytes    bigint NOT NULL CHECK (size_bytes > 0),

    -- Capítulo gratuito de muestra. Es la herramienta de conversión más efectiva
    -- en manga, y tiene que poder consultarse sin licencia.
    is_preview    boolean NOT NULL DEFAULT false,

    published_at  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- `numeric` y no `int` porque existen los capítulos 10.5 (extras, omakes), y
-- descubrir eso después de poblar la tabla es una migración dolorosa.
CREATE UNIQUE INDEX chapters_number_key ON chapters (work_id, number);
CREATE INDEX chapters_work_idx ON chapters (work_id, number);
CREATE INDEX chapters_preview_idx ON chapters (work_id) WHERE is_preview;

-- -------------------------------------------------------------------- series

-- Agrupa obras: los tres volúmenes de un manga, la trilogía de un juego.
CREATE TABLE series (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id   uuid NOT NULL REFERENCES creators (id) ON DELETE RESTRICT,
    slug         text NOT NULL,
    title        text NOT NULL,
    description  text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX series_slug_key ON series (lower(slug));

ALTER TABLE works
    ADD COLUMN series_id uuid REFERENCES series (id) ON DELETE SET NULL,
    ADD COLUMN series_position int;

CREATE UNIQUE INDEX works_series_position_key
    ON works (series_id, series_position) WHERE series_id IS NOT NULL;

-- --------------------------------------------------------------------- medios

-- Capturas, arte promocional, tráilers. Separado de `cover_url` porque son
-- varios y llevan orden.
CREATE TABLE work_media (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id      uuid NOT NULL REFERENCES works (id) ON DELETE CASCADE,
    kind         text NOT NULL CHECK (kind IN ('cover', 'screenshot', 'banner', 'trailer')),
    storage_key  text NOT NULL,
    position     int NOT NULL DEFAULT 0,
    alt_text     text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX work_media_work_idx ON work_media (work_id, kind, position);

-- --------------------------------------------------------------------- búsqueda

-- Columna generada en vez de un índice sobre una expresión: Postgres la mantiene
-- al día solo, y no hay forma de que alguien inserte una fila sin actualizarla.
--
-- `spanish` como configuración base porque el catálogo es para Perú. Para títulos
-- en japonés romanizado el stemmer no ayuda, pero tampoco estorba: la coincidencia
-- exacta sigue funcionando.
ALTER TABLE works
    ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('spanish', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('spanish', coalesce(synopsis, '')), 'B') ||
        setweight(to_tsvector('spanish', coalesce(description, '')), 'C')
    ) STORED;

CREATE INDEX works_search_idx ON works USING GIN (search_vector);

-- ------------------------------------------------------------------ progreso

-- Dónde se quedó el usuario. No es analítica: es la función que hace que la
-- biblioteca sirva para algo.
CREATE TABLE reading_progress (
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    work_id      uuid NOT NULL REFERENCES works (id) ON DELETE CASCADE,
    chapter_id   uuid REFERENCES chapters (id) ON DELETE SET NULL,
    position     int NOT NULL DEFAULT 0,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, work_id)
);

-- --------------------------------------------------------------- integridad

-- Un juego no puede tener capítulos y un manga no puede tener requisitos de
-- sistema. Sin esta comprobación el formato es solo una etiqueta y la interfaz
-- acaba teniendo que defenderse de datos imposibles.
CREATE OR REPLACE FUNCTION assert_work_format(target_work uuid, expected work_format)
RETURNS void AS $$
DECLARE
    actual work_format;
BEGIN
    SELECT format INTO actual FROM works WHERE id = target_work;

    IF actual IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'La obra % es de formato %, se esperaba %', target_work, actual, expected;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION chapters_require_serialized()
RETURNS trigger AS $$
DECLARE
    fmt work_format;
BEGIN
    SELECT format INTO fmt FROM works WHERE id = NEW.work_id;

    IF fmt NOT IN ('manga', 'visual_novel') THEN
        RAISE EXCEPTION 'Solo manga y novelas visuales tienen capítulos (formato: %)', fmt;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chapters_format_check
    BEFORE INSERT OR UPDATE ON chapters
    FOR EACH ROW EXECUTE FUNCTION chapters_require_serialized();

-- -------------------------------------------------------------- vocabulario

-- Géneros iniciales. Vocabulario cerrado: se amplía con migraciones, no desde
-- la interfaz, para que no acabe habiendo cuarenta variantes de "Romance".
INSERT INTO genres (slug, name_es, name_en, applies_to) VALUES
    ('shonen',      'Shōnen',          'Shonen',        '{manga}'),
    ('shojo',       'Shōjo',           'Shojo',         '{manga}'),
    ('seinen',      'Seinen',          'Seinen',        '{manga}'),
    ('josei',       'Josei',           'Josei',         '{manga}'),
    ('isekai',      'Isekai',          'Isekai',        '{manga,visual_novel,game}'),
    ('slice-of-life', 'Recuentos de la vida', 'Slice of Life', '{manga,visual_novel}'),
    ('romance',     'Romance',         'Romance',       '{manga,visual_novel,game}'),
    ('accion',      'Acción',          'Action',        '{manga,game}'),
    ('aventura',    'Aventura',        'Adventure',     '{manga,game,visual_novel}'),
    ('misterio',    'Misterio',        'Mystery',       '{manga,visual_novel,game}'),
    ('terror',      'Terror',          'Horror',        '{manga,visual_novel,game}'),
    ('ciencia-ficcion', 'Ciencia ficción', 'Sci-Fi',    '{manga,visual_novel,game}'),
    ('fantasia',    'Fantasía',        'Fantasy',       '{manga,visual_novel,game}'),
    ('deportes',    'Deportes',        'Sports',        '{manga,game}'),
    ('comedia',     'Comedia',         'Comedy',        '{manga,visual_novel,game}'),
    ('drama',       'Drama',           'Drama',         '{manga,visual_novel}'),
    ('rpg',         'RPG',             'RPG',           '{game}'),
    ('plataformas', 'Plataformas',     'Platformer',    '{game}'),
    ('puzzle',      'Puzzle',          'Puzzle',        '{game}'),
    ('roguelike',   'Roguelike',       'Roguelike',     '{game}');
