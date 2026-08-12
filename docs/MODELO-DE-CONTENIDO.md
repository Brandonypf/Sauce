# Cómo almacenar juegos, manga y novelas visuales

Pediste que eliminara la base de datos falsa y propusiera cómo guardar el
catálogo de verdad. Esto explica qué se descartó, qué se eligió y por qué.

La migración está en `backend/migrations/002_content_model.sql`, aplicada y
probada contra PostgreSQL 16.

---

## Lo primero: qué había realmente

El export de Base44 venía **incompleto**. Diecinueve archivos pesaban 0 bytes,
incluidos los tres que definían los datos:

```
entities/Work.jsonc          0 bytes
entities/Creator.jsonc       0 bytes
entities/User.jsonc          0 bytes
functions/Checkout/entry.ts  0 bytes
functions/GetWorkContent/entry.ts  0 bytes
functions/ImportWorks/entry.ts     0 bytes
src/pages/WorkDetail.jsx     0 bytes
src/api/                     vacío
```

Así que no había esquema que migrar. El diseño se hizo desde cero.

Los datos falsos estaban en un solo sitio, `src/pages/Explore.jsx`, en un array
`MOCK_ITEMS` de seis elementos. Vale la pena mirarlos: *"Guía completa de
Arbitrum"*, *"Pack de assets neon"*, *"Curso de Foundry desde cero"*. No eran
juegos ni manga — eran infoproductos genéricos. Base44 generó una tienda de
plantillas, no lo que estás construyendo.

También: `packageconfig.json` era un `package-lock.json` con otro nombre. Se
renombró.

---

## La decisión que ordena todo lo demás

> **La licencia es sobre la obra, no sobre el archivo.**

Un juego se parchea. Un manga saca capítulos cada semana. Una novela visual hace
las dos cosas. Si la licencia apuntara a un archivo concreto, cada parche
invalidaría lo que el comprador pagó, y cada capítulo nuevo exigiría emitir una
licencia nueva y escribir en la cadena.

Por eso `works` sigue siendo la unidad vendible —lo que tiene precio, licencia y
`content_id` on-chain— y los artefactos descargables viven en tablas aparte que
pueden cambiar todo lo que quieran sin tocar Arbitrum.

Esto es también lo que hace viable el modelo de negocio: publicar el capítulo 48
no cuesta gas.

---

## Las cuatro formas de modelar esto

Un juego y un manga comparten un 70% de campos (título, creador, precio, portada)
y difieren en el 30% restante (plataformas vs. dirección de lectura). Hay cuatro
maneras de resolverlo:

### A. Tabla única con columnas para todo

Una `works` con `platforms`, `reading_direction`, `route_count`... y NULL en las
que no apliquen.

Simple de consultar, pero la tabla crece sin control y **nada impide que un manga
tenga `platforms = {Windows}`**. Los NULL dejan de significar "no aplica" y pasan
a significar "no sé", que no es lo mismo.

### B. Tabla única + `metadata jsonb`

Lo que casi todo el mundo hace primero, y es cómodo hasta que alguien escribe
`{"platforms": "Windows"}` en vez de un array y el filtro deja de funcionar **en
silencio**. Sin esquema no hay error: hay una lista vacía.

Tampoco se puede indexar bien lo que no tiene forma conocida.

### C. EAV (entidad-atributo-valor)

Una tabla `atributos(obra, clave, valor)`. Máxima flexibilidad, y consultar
"juegos de Windows con multijugador ordenados por precio" se convierte en tres
self-joins. Se descarta.

### D. Herencia por tablas — **la elegida**

`works` con lo común, más `game_details`, `manga_details`,
`visual_novel_details` con clave foránea. Cada formato tiene sus columnas, con
sus tipos y sus `CHECK`.

JSONB se reserva para lo genuinamente libre: `system_requirements`, que cambia por
juego y nadie consulta programáticamente. Ese es el uso correcto de JSONB —no como
sustituto de un esquema, sino para lo que de verdad no lo tiene.

Cuesta un JOIN más. A cambio, el motor impide los datos imposibles en vez de
delegar esa defensa a la interfaz.

---

## Qué se añadió, y por qué cada cosa

### Artefactos separados de la obra

```
releases   →  el juego para Windows, para Mac, el parche 1.0.2
chapters   →  el capítulo 47 del manga
```

`releases` lleva `checksum` (SHA-256) para que el cliente verifique la descarga y
para detectar que dos creadores subieron el mismo binario. Lleva `storage_key`,
**nunca una URL**: las URLs firmadas caducan, y guardarlas sería guardar un
permiso vencido.

`chapters.number` es `numeric(8,2)` y no `int`, porque existen los capítulos 10.5
—extras, omakes— y descubrirlo con la tabla ya poblada es una migración dolorosa.

`chapters.is_preview` marca el capítulo gratuito de muestra. Es la herramienta de
conversión más efectiva que existe en manga, y tiene que poder consultarse sin
licencia.

### Géneros como tabla, no como columna de texto

`category text` obliga a que "Shonen", "shonen" y "Shōnen" sean tres cosas
distintas, y no deja que una obra sea de dos géneros — que es el caso normal.

Se separaron dos conceptos que suelen mezclarse:

- **`genres`**: vocabulario cerrado que controla la plataforma, navegable, con
  `applies_to` para que "Roguelike" no aparezca al filtrar manga. Se amplía por
  migración, no desde la interfaz, para que no acaben existiendo cuarenta
  variantes de "Romance".
- **`work_tags`**: etiquetas libres del creador, que crecen sin control y sirven
  para buscar, no para navegar.

Vienen 20 géneros iniciales cargados.

### Clasificación por edad

`age_rating` es un enum, y el índice del catálogo lo incluye:

```sql
CREATE INDEX works_rating_idx ON works (rating, format) WHERE status = 'published';
```

Con contenido adulto-adyacente esto no es cosmético. Filtrar por rating pasa en
**cada** consulta pública, así que tiene que estar en el índice y no resolverse en
memoria.

### Búsqueda full-text en español

Columna generada, no índice sobre expresión: Postgres la mantiene al día sola y
nadie puede insertar una fila sin actualizarla.

```sql
setweight(to_tsvector('spanish', title), 'A') ||
setweight(to_tsvector('spanish', synopsis), 'B') ||
setweight(to_tsvector('spanish', description), 'C')
```

Los pesos hacen que una coincidencia en el título gane a una en la descripción.
Con índice GIN encima.

### Integridad por trigger

Un juego no puede tener capítulos:

```sql
CREATE TRIGGER chapters_format_check BEFORE INSERT OR UPDATE ON chapters ...
```

Sin esto el formato es solo una etiqueta, y la interfaz acaba teniendo que
defenderse de datos que nunca debieron existir.

### Progreso de lectura

`reading_progress` guarda dónde se quedó el usuario. No es analítica: es lo que
hace que la biblioteca sirva para algo más que listar compras.

### Series

`series` agrupa los tres volúmenes de un manga o la trilogía de un juego, con
`series_position` único para que no haya dos "volumen 2".

---

## Verificado

Migraciones aplicadas contra PostgreSQL 16 limpio, y las restricciones probadas
una por una:

| Prueba | Resultado |
|---|---|
| Capítulo en una novela visual | pasa |
| Capítulo en un **juego** | rechazado por el trigger |
| Capítulo 10.5 | pasa (`numeric`, no `int`) |
| Mismo capítulo dos veces | rechazado por índice único |
| Búsqueda `"roguelike plataformas"` | encuentra *Pixel Quest*, rank 0.394 |
| Géneros aplicables a manga | 16 de 20 |

---

## Lo que falta

1. **Endpoints del catálogo.** El cliente `src/api/client.js` ya llama a
   `/api/works?format=&genre=&q=`, `/api/works/:slug/chapters` y
   `/api/works/:slug/releases`. Esas rutas todavía no existen en el backend —
   `catalog.ts` sirve la versión de la migración 001. Es el siguiente paso
   obvio.

2. **`WorkDetail.jsx` está vacío** en el export de Base44, y es la página que
   más cambia según el formato: un juego muestra plataformas y requisitos, un
   manga muestra lista de capítulos y dirección de lectura. Hay que escribirla.

3. **Subida de archivos.** `releases` y `chapters` esperan un `storage_key` de S3
   o R2. Nada lo genera todavía.

4. **Dos frontends en el repo.** El anterior en Next.js quedó en `frontend-next/`
   por si quieres rescatar algo — el checkout con hosted fields, el flujo de
   voucher EIP-712. Bórralo cuando decidas.

5. **Cambio de stack.** Esto es Vite + React Router + JSX; lo anterior era
   Next.js + TypeScript. Se pierde el renderizado en servidor y el SEO de las
   fichas de obra, que para una tienda es probablemente lo más valioso del
   frontend. También cambia lo que empaqueta Electron. Es una decisión con
   consecuencias, no un cambio de carpeta.
