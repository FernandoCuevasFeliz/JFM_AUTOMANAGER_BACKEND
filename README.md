# JFM AutoManager — Backend

Backend del sistema web **JFM AutoManager** para **EJGH AUTO IMPORT SRL** (República Dominicana):
gestión de ventas e inventario de vehículos importados.

> Monografía: *"Implementación del sistema web JFM AutoManager para la eficiencia de las ventas e
> inventario de vehículos de la empresa EJGH AUTO IMPORT SRL, República Dominicana, período
> 2026–2027"*.

---

## Stack

| Pieza | Elección |
|---|---|
| Runtime | Node.js 20+ (LTS) |
| Lenguaje | TypeScript en modo `strict` |
| HTTP | Express 4 |
| Acceso a datos | Kysely (query builder tipado) sobre `pg` |
| Validación | Zod |
| Auth | JWT (`jsonwebtoken`) + `bcrypt` |
| Logs | `pino` / `pino-http` |
| Tests | Vitest |

No se usa ORM. El dominio no conoce el esquema: los repositorios traducen entre `snake_case`
(base de datos) y `camelCase` (dominio) mediante *mappers*.

---

## Instalación

```bash
npm install
```

Requisitos: **Node.js 22** y PostgreSQL 14 o superior.

La versión exacta está fijada en `.nvmrc`. Con [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm use
```

Es la misma versión que usa la imagen de Docker, así que lo que pruebas en local
es lo que corre en el contenedor.

### Variables de entorno

```bash
cp .env.example .env
```

Genere un secreto JWT real (mínimo 32 caracteres):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| Variable | Obligatoria | Descripción |
|---|---|---|
| `NODE_ENV` | no | `development` \| `test` \| `production` (por defecto `development`) |
| `PORT` | no | Puerto HTTP (por defecto `3000`) |
| `DATABASE_URL` | **sí** | Cadena de conexión a PostgreSQL |
| `DB_POOL_MAX` | no | Conexiones máximas del pool (por defecto `10`) |
| `DB_SSL` | no | `true` para exigir SSL contra la base (por defecto `false`) |
| `JWT_SECRET` | **sí** | Secreto de firma, mínimo 32 caracteres |
| `JWT_EXPIRES_IN` | no | Vigencia del access token (por defecto `8h`) |
| `JWT_ISSUER` | no | Emisor del token (por defecto `jfm-automanager`) |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | no | Duración de la sesión en días (por defecto `30`) |
| `BCRYPT_SALT_ROUNDS` | no | Costo de bcrypt (por defecto `10`) |
| `LOG_LEVEL` | no | `fatal`…`trace` (por defecto `info`) |
| `CORS_ORIGINS` | no | Orígenes separados por coma, o `*` |
| `SEED_ADMIN_*` | solo seed | Datos del administrador inicial |

Las variables se validan con Zod al arrancar: si falta o está mal formada alguna obligatoria, el
proceso no levanta y explica cuál.

### Crear la base y migrar

```bash
createdb ejgh_autoimport
```

```bash
npm run db:migrate
```

Aplica ocho migraciones:

1. **`001_initial_schema`** — transcripción literal de `schema_ejgh_autoimport.sql`: extensión
   `pgcrypto`, los 8 ENUM, las 20 tablas, índices y los triggers de `updated_at`.
2. **`002_seed_catalogs`** — catálogos base (monedas, tipos de documento, métodos de pago, roles) y
   un juego inicial de categorías de gasto. Es idempotente (`ON CONFLICT DO NOTHING`).
3. **`003_sales_vehicle_partial_unique`** — sustituye el `UNIQUE` de `sales.vehicle_id` por un
   índice único parcial que ignora las ventas canceladas.
4. **`004_refresh_tokens`** — tabla `refresh_tokens` para sesiones persistentes.
5. **`005_expenses_exchange_rate`** — añade `exchange_rate` a `expenses`.
6. **`006_invoices`** — facturación electrónica: los ENUM `ncf_type_enum` y
   `fiscal_doc_status_enum`, y las tablas `invoices` y `credit_notes`.
7. **`007_report_views`** — las siete vistas de reporte (`vw_*`). No crea tablas ni columnas: son
   consultas con nombre sobre lo que ya existe.
8. **`008_sale_items_and_refunds`** — parte `sales` en cabecera y detalle (`sale_items`), añade
   `refunds` y `credit_notes.sale_item_id`, y redefine cinco de las vistas sobre el detalle más una
   nueva de devoluciones.

De la tercera a la sexta modifican el esquema entregado; el porqué de cada una está en
[Cambios sobre el esquema entregado](#cambios-sobre-el-esquema-entregado). La séptima no lo
modifica: una vista no altera el modelo de datos. La octava sí lo modifica, y a fondo:
[Venta de varios vehículos y reembolsos](#venta-de-varios-vehículos-y-reembolsos-migración-008).

Para revertir la última migración:

```bash
npm run db:migrate:down
```

> Kysely crea dos tablas propias de infraestructura, `kysely_migration` y `kysely_migration_lock`,
> para llevar el control de qué migraciones ya corrieron. No forman parte del modelo de negocio.

### Crear el usuario administrador

```bash
npm run db:seed
```

Crea la primera cuenta con el correo y contraseña de `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
Es idempotente: si el correo ya existe, no hace nada. **Cambie la contraseña tras el primer acceso.**

### Regenerar los tipos de la base (opcional)

`src/infrastructure/database/database.types.ts` está escrito a mano y refleja exactamente el
esquema. Contra una base ya migrada puede regenerarse:

```bash
npm run db:codegen
```

---

## Ejecución

```bash
npm run dev
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga en caliente (`tsx watch`) |
| `npm run build` | Compila a `dist/` |
| `npm start` | Ejecuta lo compilado |
| `npm run typecheck` | `tsc --noEmit` sobre `src` y `tests` |
| `npm test` | Tests unitarios |
| `npm run test:watch` | Tests en modo watch |

Comprobaciones de salud:

- `GET /health` — el proceso responde.
- `GET /health/ready` — además, la base de datos contesta (503 si no).

### Logs

En el terminal cada petición ocupa **una sola línea**: método, ruta, código de estado y tiempo.
Cuando algo falla, se añade el código de error y el mensaje.

```
[16:19:24] INFO: JFM AutoManager backend escuchando en http://localhost:3000/api/v1 [development]
[16:19:33] INFO: POST /api/v1/auth/login 200 (78ms)
[16:19:33] INFO: GET /api/v1/vehicles?status=in_inventory&page=1 200 (15ms)
[16:19:33] WARN: POST /api/v1/vehicle-brands 409 (10ms) CONFLICT: Ya existe una marca con el nombre Mazda
[16:19:33] WARN: GET /api/v1/vehicles 401 (1ms) UNAUTHORIZED: Falta el token de autenticacion
[16:19:33] WARN: POST /api/v1/vehicles 400 (5ms) VALIDATION_ERROR: body.brandId: Identificador invalido; ...
[16:19:33] WARN: GET /api/v1/ruta-que-no-existe 404 (2ms) ROUTE_NOT_FOUND: La ruta no existe
```

Tres detalles del diseño:

- El error-handler **no emite una línea propia** para los errores de negocio: anota el código en la
  respuesta (`request-outcome.ts`) y el registro de acceso lo incluye. Así un 404 o un 409 produce
  una línea, no dos.
- Los fallos **inesperados (500)** sí generan su propia línea con el `stack trace` completo: es la
  única forma de diagnosticarlos.
- El logger es el **primer middleware** de la cadena. Si fuera después de `express.json()`, una
  petición con el cuerpo mal formado se rechazaría con 400 sin dejar rastro.

Los objetos `req`/`res` completos que adjunta `pino-http` se ocultan **solo en la salida legible**
(`ignore` de `pino-pretty`). En producción la salida es JSON y conserva todos los campos para el
agregador de logs. Con `LOG_LEVEL=debug` se ve además cada consulta SQL.

---

## Docker

```bash
cp .env.docker.example .env.docker    # y cambia JWT_SECRET
docker compose up -d --build          # PostgreSQL + migraciones + API
docker compose --profile seed up seed # usuario administrador inicial
```

La API queda en `http://localhost:3000/api/v1`. PostgreSQL se publica en el
**5433** del host (no el 5432) para no chocar con una instalación local.

| Comando | Qué hace |
|---|---|
| `docker compose logs -f api` | sigue el log de la API |
| `docker compose ps` | estado y salud de los servicios |
| `docker compose down` | detiene todo; **los datos sobreviven** |
| `docker compose down -v` | detiene y **borra** el volumen de la base |
| `docker compose run --rm migrate` | reaplica migraciones pendientes |

### Qué hay dentro

**`Dockerfile`** — build en tres etapas. La imagen final contiene únicamente el
JavaScript compilado y las dependencias de producción: sin TypeScript, sin
`tsx`, sin `pino-pretty`, sin el código fuente y sin las herramientas de
compilación de C++. Corre como el usuario `node`, sin privilegios.

Dos decisiones que conviene conocer:

- **Sin herramientas de compilación.** `bcrypt` es un módulo nativo, pero su
  versión 6 trae binarios precompilados para linux-x64 y linux-arm64 en
  variantes glibc **y** musl, y `node-gyp-build` se limita a elegir el correcto.
  Ninguna otra dependencia de producción tiene scripts de instalación, así que
  la imagen no necesita `python3`/`make`/`g++`. Por lo mismo, cambiar
  `NODE_VERSION` a `22.23.2-alpine` funciona si quieres una imagen más pequeña;
  se deja Debian por ser la opción más conservadora.
- **Versión de Node fijada** (`22.23.2`, la misma de `.nvmrc`), no un tag
  flotante: dos builds separados en el tiempo producen la misma imagen.
- **`NODE_ENV=production` está fijado en la imagen.** El logger solo carga
  `pino-pretty` cuando el entorno no es producción, y esa librería es una
  dependencia de desarrollo que no está instalada. Cambiar esa variable dentro
  del contenedor haría fallar el arranque; la salida en el contenedor es JSON,
  una línea por evento.

**`docker-compose.yml`** — cuatro servicios: `db`, `migrate`, `api` y `seed`.

Las migraciones corren en un **contenedor de un solo uso** y no en el arranque
de la API. Si la API migrara al iniciarse, dos réplicas competirían por aplicar
el mismo cambio de esquema. El orden lo garantizan las condiciones de
`depends_on`: `migrate` espera a que PostgreSQL responda a `pg_isready`, y `api`
espera a que `migrate` termine con éxito.

`seed` está bajo un perfil, así que no corre solo: crear credenciales debe ser
un acto deliberado.

**Healthcheck** — el del contenedor sondea `/health` (¿vive el proceso?) y no
`/health/ready`, porque si dependiera de la base un corte momentáneo marcaría el
contenedor como enfermo y podría provocar reinicios en cadena. Para *readiness*
en un orquestador, sondea `/health/ready`, que sí verifica PostgreSQL.

No hay gestor de init (`tini`/`dumb-init`): `server.ts` ya maneja `SIGTERM` y
`SIGINT` cerrando el pool ordenadamente, que es exactamente lo que envía
`docker stop`.

### Despliegue en Railway

Railway detecta el `Dockerfile` y lo construye solo. Lo que **no** hace solo es
darte las variables: `.env` está en `.dockerignore` a propósito, así que la
imagen viaja sin secretos y el contenedor arranca sin ninguna variable.

En el servicio → **Variables**:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | *(ver tabla siguiente)* |
| `JWT_SECRET` | mínimo 32 caracteres |
| `DB_SSL` | *(ver tabla siguiente)* |
| `CORS_ORIGINS` | el dominio del frontend, no `*` |
| `IMAGEKIT_PUBLIC_KEY` / `IMAGEKIT_PRIVATE_KEY` | solo si se usa la subida de imágenes |

Solo `DATABASE_URL` y `JWT_SECRET` son obligatorias; el resto tiene valores por
defecto razonables. Si falta alguna, el proceso sale con código 1 y escribe qué
falta, sin stack trace.

| Base de datos | `DATABASE_URL` | `DB_SSL` |
|---|---|---|
| PostgreSQL de Railway (red interna) | `${{Postgres.DATABASE_URL}}` | `false` |
| PostgreSQL de Railway (proxy público) | cadena `*.proxy.rlwy.net` | `true` |
| Supabase | cadena del *session pooler* | `true` |

`${{Postgres.DATABASE_URL}}` es una **variable de referencia** de Railway: se
escribe tal cual y Railway la resuelve al valor del servicio de PostgreSQL. La
red interna (`*.railway.internal`) no usa TLS, de ahí el `false`.

**No configures `PORT`.** Railway lo inyecta y el código ya lo lee; fijarlo a
mano rompe el enrutado.

#### Migraciones

El contenedor no migra al arrancar (ver más arriba el porqué). Tienes dos vías:

```bash
# A) Puntual, desde tu máquina, contra la base de Railway
railway run node dist/infrastructure/database/migrate.js up
railway run node dist/infrastructure/database/seed.js      # solo la primera vez
```

```bash
# B) En cada despliegue: cambia el Start Command del servicio por
node dist/infrastructure/database/migrate.js up && node dist/main/server.js
```

La opción B es cómoda con **una sola réplica**. Si algún día escalas a varias,
vuelve a la A: dos instancias arrancando a la vez competirían por aplicar el
mismo cambio de esquema.

### Contra una base externa (Supabase)

El `docker-compose.yml` levanta su propio PostgreSQL. Para usar una base
gestionada, no uses compose: ejecuta la imagen directamente.

```bash
docker build -t jfm-automanager-backend .
docker run --rm --env-file .env jfm-automanager-backend \
  node dist/infrastructure/database/migrate.js up
docker run -d -p 3000:3000 --env-file .env --name jfm-api jfm-automanager-backend
```

Recuerda `DB_SSL=true` para proveedores gestionados.

### Scripts en el contenedor

Los `npm run db:*` usan `tsx`, que es una dependencia de desarrollo y no existe
en la imagen. Para el contenedor están sus equivalentes compilados:

| Desarrollo | Producción / contenedor |
|---|---|
| `npm run db:migrate` | `npm run db:migrate:prod` |
| `npm run db:migrate:down` | `npm run db:migrate:down:prod` |
| `npm run db:seed` | `npm run db:seed:prod` |

### `.env` frente a `.env.docker`

Son dos archivos distintos a propósito. `.env` apunta a la base que usas desde
tu máquina; `.env.docker` apunta al servicio `db` de la red interna de compose
(host `db`, puerto `5432`). Mezclarlos haría que las migraciones corrieran
contra la base equivocada. Ninguno de los dos entra en la imagen: están en
`.dockerignore` y se inyectan en tiempo de ejecución.

---

## Arquitectura

Clean Architecture por capas y por módulo. La **regla de dependencia** apunta siempre hacia adentro:

```
presentation ─┐
              ├──▶ application ──▶ domain
infrastructure┘
```

- **`domain/`** — entidades, reglas de negocio, máquinas de estado, errores tipados e *interfaces*
  de repositorio (puertos). No importa nada de las otras capas ni de ninguna librería de
  infraestructura.
- **`application/`** — casos de uso. Orquestan entidades y puertos. No conocen Express ni SQL.
- **`infrastructure/`** — implementaciones concretas: repositorios Kysely, bcrypt, JWT, pino,
  conexión, migraciones.
- **`presentation/`** — HTTP: controladores, rutas, esquemas Zod y middlewares.
- **`main/`** — *composition root*: `container.ts` (inyección de dependencias manual), `routes.ts`,
  `app.ts`, `server.ts`.

```
src/
├── domain/<modulo>/          <entidad>.entity.ts · <entidad>.repository.ts · <entidad>.errors.ts
├── application/<modulo>/     <accion>-<entidad>.use-case.ts
├── infrastructure/
│   ├── database/             connection · database.types · migrations/ · kysely-unit-of-work
│   ├── repositories/         kysely-<entidad>.repository.ts + mappers
│   ├── auth/                 bcrypt-password-hasher · jwt-token-service
│   ├── audit/                async-local-audit-context · kysely-audit-log.repository
│   ├── config/env.ts · logging/logger.ts · system-clock.ts
├── presentation/
│   ├── http/<modulo>/        <modulo>.controller.ts · <modulo>.routes.ts · <modulo>.schemas.ts
│   └── middlewares/          auth · rbac · error-handler · audit-context · validate · async-handler
└── main/                     container.ts · routes.ts · app.ts · server.ts
```

Módulos: `users`, `vehicles`, `clients`, `suppliers`, `purchases`, `expenses`, `quotations`,
`reservations`, `sales`, `invoices`, `catalogs`, `reports`. Todos siguen la misma estructura
(`reports` no tiene `.errors.ts`: consultar un reporte no viola ninguna regla de negocio).

### Manejo de errores: `Result` en lugar de excepciones

Los casos de uso devuelven `Result<T, DomainError>`. Un error de negocio (documento duplicado,
vehículo no disponible) es un **valor**, no una excepción; solo se lanzan excepciones ante fallos
realmente inesperados.

El `error-handler` centralizado es el único lugar que decide códigos HTTP:

| Error | HTTP | `code` |
|---|---|---|
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ConflictError` | 409 | `CONFLICT` |
| `BusinessRuleError` | 422 | `BUSINESS_RULE_VIOLATION` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `InvalidReferenceError` | 422 | `INVALID_REFERENCE` |
| `RequestValidationError` (Zod) | 400 | `VALIDATION_ERROR` |
| cualquier otro | 500 | `INTERNAL_ERROR` |

Formato de respuesta:

```jsonc
// éxito
{ "data": { } }
// listado paginado
{ "data": [ ], "meta": { "total": 42, "page": 1, "pageSize": 20, "totalPages": 3 } }
// error
{ "error": { "code": "CONFLICT", "message": "…", "details": { } } }
```

### Zod vs. dominio: sin lógica duplicada

- **Zod (presentación)** valida *la forma del mensaje HTTP*: tipos, obligatoriedad, longitudes,
  formatos, rangos, valores por defecto. Responde 400.
- **El dominio** valida *las invariantes del negocio*: unicidad, coherencia entre entidades,
  transiciones de estado, disponibilidad. Responde 409/422.

Ejemplo: Zod comprueba que `documentNumber` sea un texto de hasta 30 caracteres; el dominio
comprueba que ese documento no esté ya registrado. Zod comprueba que `clientType` sea
`individual` o `company`; el dominio comprueba que una persona traiga nombre y apellido y una
empresa traiga razón social — regla que además debe seguir valiendo en una actualización parcial
donde el tipo viene del registro ya guardado.

---

## Reglas de negocio modeladas

### Máquina de estados del vehículo

```
                     ┌──────────────── unavailable ◀──────────┐
                     │                  ▲   │                 │
                     ▼                  │   ▼                 │
   in_transit ──▶ in_inventory ◀──────────▶ in_repair         │
                     │    ▲                                   │
                     │    │ (reserva cancelada o vencida)     │
                     ▼    │                                   │
                  reserved ┴───────────────────────────────────┘
                     │
                     ▼
                   sold ──(solo por cancelación de venta)──▶ in_inventory
```

Definida en `src/domain/vehicles/vehicle.entity.ts`:

- `in_transit` es el estado inicial: el vehículo se compró pero aún no llegó.
- `in_inventory` es el único estado desde el que se puede **reservar**.
- Se puede **vender** desde `in_inventory` o `reserved`.
- `sold` es prácticamente terminal: la única salida es volver a inventario, y solo la produce la
  cancelación de una venta.
- **`reserved` y `sold` no se asignan a mano.** El endpoint `PATCH /vehicles/:id/status` los rechaza
  como origen y como destino: se derivan de crear/cancelar una reserva o una venta. Si se pudieran
  fijar manualmente, el inventario dejaría de cuadrar con las ventas registradas.

### Operaciones transaccionales

`UnitOfWork` (`domain/shared/unit-of-work.ts`) define la frontera transaccional como puerto; Kysely
la implementa. El trabajo devuelve un `Result`: si es `Err`, la transacción se revierte y el error
se propaga **como valor**, no como excepción.

| Caso de uso | Qué ocurre en la transacción |
|---|---|
| `create-sale` | valida disponibilidad → crea la venta → vehículo a `sold` → reserva y cotización a `converted` → registra el pago inicial |
| `issue-credit-note` | registra la nota emitida y, si cubre el importe, anula la factura |
| `create-reservation` | valida → crea la reserva → vehículo a `reserved` → cotización a `converted` |
| `cancel-reservation` | reserva a `cancelled` → vehículo vuelve a `in_inventory` |
| `cancel-sale` | venta a `cancelled` → vehículo vuelve a `in_inventory` |
| `create-purchase` | crea encabezado + ítems; si nace `received`, mete los vehículos a inventario |
| `change-purchase-status` → `received` | ingresa a inventario todos los vehículos de la compra |
| `expire-reservations` | vence las reservas cumplidas y libera sus vehículos |
| `register-sale-payment` | calcula el saldo y registra el abono en el mismo acto |

Las validaciones de disponibilidad se repiten **dentro** de la transacción, no solo antes de
abrirla: así dos vendedores que registren la misma unidad a la vez no pueden pasar ambos el control.

### Restricciones `UNIQUE` traducidas a errores de negocio

Un vehículo se compra una sola vez (`purchase_items.vehicle_id UNIQUE`) y no puede tener dos ventas
vigentes a la vez (índice parcial `uq_sales_vehicle_active`). El dominio comprueba ambas **con los
mismos predicados que la base** antes de insertar, y devuelve **409 con un mensaje que explica la
regla** (`VehicleAlreadyPurchasedError`, `VehicleAlreadySoldError`) en lugar de dejar escapar el
error de constraint de Postgres como un 500.

### Facturación electrónica (e-CF, DGII Ley 32-23)

El backend **no habla con la DGII**: la firma digital y el envío los resuelve un PSFE homologado.
Estas tablas persisten el *resultado* del proceso fiscal (NCF asignado, acuse, XML, motivo de
rechazo).

Máquina de estados de `invoices` y `credit_notes`:

```
   pending ──► issued ──► cancelled     (anulado por nota de crédito total)
      │  ▲        │
      ▼  │        ▼
   rejected ──► cancelled
```

Reglas modeladas:

- **Ninguna de las dos tablas tiene `deleted_at`.** Por ley un comprobante fiscal no se borra: su
  ciclo de vida se gobierna por completo con `status`.
- Un comprobante `issued` es **inmutable**. Corregirlo o anularlo exige emitir notas de crédito
  (e-CF E34); cuando estas cubren el importe completo, el sistema anula la factura solo.
- El NCF se valida en formato (`E` + tipo + secuencia), en coherencia con el tipo declarado, y en
  unicidad **cruzando ambas tablas**: la DGII usa un único espacio de numeración.
- **Una venta facturada no se puede cancelar** mientras su comprobante siga vivo. Un e-CF emitido no
  desaparece porque el sistema marque la venta como anulada. Primero la nota de crédito, después la
  cancelación.
- `invoices:issue` es un permiso propio, separado de `invoices:write`: preparar un borrador y
  declarar que la DGII lo aceptó son actos de peso distinto, y el segundo fija un NCF irreversible.

### Otras reglas

- **Gastos**: la categoría lleva un `scope`. Una categoría de vehículo exige `vehicleId`; una general
  lo prohíbe. Sin esta regla, el costo real por unidad se contaminaría con gastos de la empresa.
- **Ventas**: una venta solo se **completa** si está totalmente pagada; un abono no puede superar el
  saldo pendiente; el precio no puede bajarse por debajo de lo ya cobrado.
- **Borrados lógicos**: un cliente con historial comercial no se borra (se desactiva); un vehículo
  reservado o vendido tampoco; una compra ya recibida tampoco.
- **Correlativos**: `COM-2026-000001`, `COT-…`, `RES-…`, `VEN-…`, generados dentro de la transacción
  y reiniciados cada año.

---

## Seguridad

### Autenticación

`POST /api/v1/auth/login` y `POST /api/v1/auth/refresh` son los **únicos endpoints públicos**: el
refresco no puede exigir un access token válido, porque su razón de ser es que ese token ya expiró.
El resto de la API exige `Authorization: Bearer <token>`.

El login devuelve dos credenciales:

- un **access token** JWT (HS256) de vida corta, con el id del usuario en `sub` y el nombre de su
  rol; es el que autoriza cada petición;
- un **refresh token**, secreto opaco de 384 bits con el que obtener un access token nuevo sin
  volver a pedir la contraseña.

El login ejecuta una comparación bcrypt contra un hash señuelo cuando el correo no existe, para que
un correo inexistente no responda notablemente más rápido que uno existente (enumeración por tiempo).

#### Sesiones y rotación

```
POST /auth/login       -> { accessToken, expiresAt, refreshToken, refreshExpiresAt, user, permissions }
POST /auth/refresh     -> mismo objeto, con un refreshToken NUEVO
POST /auth/logout      -> 204, revoca el refresh token presentado
GET  /auth/sessions    -> sesiones abiertas del propio usuario
POST /auth/logout-all  -> cierra la sesión en todos los dispositivos
```

De la tabla `refresh_tokens` solo sale el **SHA-256** del secreto, nunca el secreto: quien lea la
tabla no puede suplantar a nadie, igual que con `users.password_hash`. No se usa bcrypt aquí porque
son 384 bits aleatorios, no una frase elegida por una persona: no hay diccionario que aplicar y el
coste deliberado de bcrypt solo añadiría latencia a cada refresco.

Cada refresh token es de **un solo uso**: al canjearlo se revoca y se emite otro (*rotación*). Si
reaparece un token ya rotado, existen dos copias en circulación y no hay forma de saber cuál es la
legítima, así que **se revocan todas las sesiones del usuario** y se obliga a iniciar sesión de
nuevo. Es la respuesta estándar ante un robo de credenciales.

También se revocan todas las sesiones al **cambiar la contraseña** (si alguien la conocía, dejar sus
sesiones abiertas haría inútil el cambio) y al **dar de baja un usuario**. Un usuario desactivado
tampoco puede renovar: `refresh` vuelve a comprobar que siga activo.

El access token ya emitido **sigue siendo válido hasta que expire**, incluso tras un logout: un JWT
firmado no se puede invalidar. De ahí que `JWT_EXPIRES_IN` sea corto y la sesión larga la sostenga
el refresh token, que sí es revocable.

### RBAC en código de aplicación

Por decisión de diseño la base **no modela permisos**: `roles` es un catálogo simple. El mapa
`ROLE_PERMISSIONS` vive en `src/domain/users/permissions.ts`, versionado junto al código.

Middlewares en `presentation/middlewares/rbac.middleware.ts`:

```ts
router.post('/', requirePermission('vehicles:write'), asyncHandler(controller.create));
router.get('/:id', requireAnyPermission('sales:read', 'reports:read'), …);
router.delete('/:id', requireRole('admin'), …);
```

Se prefiere `requirePermission` sobre `requireRole`: nombrar la capacidad envejece mejor que nombrar
el rol.

| Rol | Alcance |
|---|---|
| `admin` | todos los permisos |
| `ventas` | clientes, cotizaciones, reservas, ventas y pagos; lectura de inventario |
| `inventario` | vehículos, catálogo de marcas/modelos, proveedores y compras |
| `contabilidad` | gastos y pagos; lectura de compras, ventas e inventario |

Es **fail-closed**: un rol que no aparezca en el mapa no tiene ningún permiso, así que crear un rol
nuevo en la tabla `roles` no otorga acceso hasta declararlo explícitamente en el código.

### Auditoría transversal

Ningún caso de uso escribe en `audit_logs`. El mecanismo tiene tres piezas:

1. **`auditContextMiddleware`** abre un ámbito por petición con `AsyncLocalStorage` que lleva el
   usuario y la IP, sin arrastrarlos como parámetros por todas las capas.
2. **`withAudit(useCase, descriptor, deps)`** (`application/shared/with-audit.ts`) envuelve el caso
   de uso: toma el `old_data` antes de ejecutar y el `new_data` después, leyendo la fila cruda. Si el
   caso de uso devuelve `Err`, no registra nada: no hubo cambio que auditar.
3. **`main/container.ts`** aplica el decorador. La lista completa de operaciones auditadas se lee de
   un vistazo en un solo archivo en lugar de estar dispersa por los módulos.

Un fallo de auditoría se registra en el log pero **nunca tumba** una operación de negocio ya
confirmada. El `password_hash` jamás llega a `audit_logs`.

---

## API

> Para construir el frontend, la referencia completa está en **[API.md](API.md)**: convenciones,
> flujo de sesión, permisos por rol, cuerpos de request y response de cada endpoint, máquinas de
> estado y reglas de negocio que la interfaz debe anticipar.

Todo cuelga de `/api/v1`.

| Recurso | Endpoints |
|---|---|
| `/auth` | `POST /login` · `POST /refresh` · `POST /logout` · `GET /me` · `GET /sessions` · `POST /logout-all` · `POST /change-password` |
| `/users` | `GET /roles` · CRUD · `POST /:id/reset-password` |
| `/catalogs` | `GET /` (monedas, tipos de documento, métodos de pago, categorías de gasto) · `POST /expense-categories` |
| `/vehicle-brands`, `/vehicle-models` | listar · crear · actualizar |
| `/vehicles` | CRUD · `GET /summary` · `PATCH /:id/status` · imágenes (`/:id/images`, `…/primary`) |
| `/clients`, `/suppliers` | CRUD |
| `/purchases` | CRUD · `PATCH /:id/status` |
| `/expenses` | CRUD · `GET /vehicle-cost/:vehicleId` (costo real y margen) |
| `/quotations` | CRUD · `PATCH /:id/status` · `POST /expire-overdue` |
| `/reservations` | CRUD · `POST /:id/cancel` · `POST /expire-overdue` |
| `/sales` | CRUD · `GET /summary` · `POST /:id/complete` · `POST /:id/cancel` · pagos (`/:id/payments`) |

Los listados aceptan `?page`, `?pageSize`, `?search` y los filtros propios de cada módulo.

### Ejemplo

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@ejghautoimport.com","password":"Admin123*"}' | jq -r .data.token)
```

```bash
curl -s "http://localhost:3000/api/v1/vehicles?status=in_inventory&page=1" -H "authorization: Bearer $TOKEN" | jq
```

---

## Tests

```bash
npm test
```

60 pruebas unitarias. El módulo `vehicles` está cubierto por completo como muestra del patrón a
replicar en los demás módulos (`tests/vehicles/`, 40 pruebas):

- máquina de estados y disponibilidad comercial del vehículo;
- `create-vehicle`: normalización del VIN, chasis duplicado, modelo ajeno a la marca, estados
  vetados;
- `update-vehicle`: actualización parcial, unicidad del chasis, coherencia marca/modelo;
- `change-vehicle-status`: transiciones válidas e inválidas, estados del ciclo comercial;
- `delete-vehicle`: bloqueo de vendidos y reservados;
- imágenes: promoción automática de portada.

A eso se suman las reglas transversales añadidas después (20 pruebas):

- `tests/shared/money.test.ts` — conversión a moneda de reporte y coherencia moneda/tasa;
- `tests/users/refresh-token.entity.test.ts` — vigencia y revocación de un refresh token;
- `tests/users/refresh-session.use-case.test.ts` — rotación, detección de reutilización, sesiones
  independientes por dispositivo, corte de sesión de un usuario desactivado y logout idempotente.

Los repositorios se sustituyen por dobles en memoria (`tests/helpers/`),
que verifican el **efecto observable** (qué queda guardado, con qué estado) en lugar de la secuencia
exacta de llamadas: así los tests no se rompen ante una refactorización que no cambia el
comportamiento.

---

## Decisiones que conviene conocer

### Cambios sobre el esquema entregado

Las tres decisiones que este README dejaba abiertas están **aplicadas**. Cada una tiene su propia
migración, reversible con `npm run db:migrate:down`.

#### 1. Índice único parcial en `sales` (migración 003)

El `UNIQUE` original de `sales.vehicle_id` no tenía condición: una venta cancelada seguía ocupando
el vehículo y este no podía volver a venderse nunca. Se sustituyó por:

```sql
CREATE UNIQUE INDEX uq_sales_vehicle_active
  ON sales(vehicle_id)
  WHERE status <> 'cancelled' AND deleted_at IS NULL;
```

El índice expresa la regla real del negocio —*un vehículo no puede tener dos ventas **vigentes** a la
vez*— sin sacrificar el historial. Consecuencias:

- **Cancelar una venta ya deja el vehículo revendible.** Antes había que borrarla físicamente.
- **Desaparece el único borrado físico del sistema.** `DELETE /sales/:id` volvió a ser un borrado
  lógico y solo archiva ventas ya canceladas; sus pagos siguen siendo consultables.
- `SaleRepository.isVehicleSold` filtra con **los mismos predicados que el índice**. Si divergieran,
  el dominio dejaría pasar casos que la base rechazaría con un 500.

#### 2. Tabla `refresh_tokens` (migración 004)

Implementada tal como se propuso, con rotación y detección de reutilización. Ver
[Sesiones y rotación](#sesiones-y-rotación).

#### 3. Moneda única de reporte

**Criterio contable adoptado:** los importes se consolidan en **pesos dominicanos** usando la tasa
registrada **en cada documento**, no una tasa del día de la consulta.

Es el criterio de costo histórico: una unidad comprada a 58.00 y otra a 62.50 costaron lo que
costaron, y su margen no debe moverse cada vez que fluctúa el dólar. Además es el único cálculo
reproducible — dos consultas al mismo vehículo en fechas distintas devuelven el mismo número, y ese
número cuadra con lo que la empresa efectivamente pagó.

Convención de `exchange_rate` en todo el sistema: **cuántos pesos vale una unidad de la moneda del
documento**. Un documento en pesos lleva tasa 1 (el `DEFAULT` de las tres columnas); una compra en
dólares a 60.50 lleva `60.5000`. El dominio rechaza con 422 un documento en DOP con tasa distinta
de 1, porque convertiría pesos en pesos y falsearía los totales.

`GET /expenses/vehicle-cost/:vehicleId` devuelve cada importe en su moneda original **y** su
equivalente en pesos:

```
importación   12,450.00 USD @ 60.5  ->    753,225.00 DOP
gastos       145,000.00 DOP         ->    145,000.00 DOP
gastos           300.00 USD @ 61.0  ->     18,300.00 DOP
COSTO TOTAL                         ->    916,525.00 DOP
vendido    1,800,000.00 DOP         ->  1,800,000.00 DOP
MARGEN                              ->    883,475.00 DOP  (96.39 %)
```

Solo los campos con sufijo `Converted` son sumables entre sí. `GET /sales/summary` aplica el mismo
criterio y declara su `reportingCurrency`.

> **`vehicles.sale_price` no tiene moneda** asociada en el esquema. Se interpreta como precio de
> lista en la moneda de reporte. Si la empresa publica precios en dólares habría que añadirle un
> `currency_id`; se dejó como está por ser un precio sugerido y no un importe contable.

##### Adición requerida: `expenses.exchange_rate` (migración 005)

> **Esta columna no estaba en el esquema entregado ni entre las propuestas anteriores.**

El costo real suma tres orígenes y solo dos traían su tasa: `purchases.exchange_rate` y
`sales.exchange_rate` ya existían, pero `expenses` guardaba `currency_id` **sin tasa**, de modo que
un gasto en dólares no se podía convertir sin inventar un valor — y el "costo total" habría sido una
suma de monedas distintas, que no significa nada.

La forma es idéntica a la de las otras dos (`NUMERIC(10,4)`, `NOT NULL`, `DEFAULT 1`), así que las
filas existentes, registradas en pesos, quedan correctas sin tocarlas.

##### Regla nueva: el pago se registra en la moneda de la venta

`sale_payments` guarda `currency_id` pero **no** una tasa propia, así que sumar un abono en dólares
con uno en pesos daba un saldo sin sentido — un descuadre latente que existía desde el principio.
Se cerró con una regla de negocio en vez de con otra columna: el abono debe registrarse en la moneda
de la venta (422 si no coincide). Si el cliente paga en otra divisa, la conversión la hace la caja
al recibir, no el sistema al sumar.

### Reportes: vistas SQL, no tablas nuevas (migración 007)

El módulo de reportes no agrega ni una tabla ni una columna. Son ocho `CREATE VIEW` sobre el
esquema existente, así que **la 3FN queda intacta**: no hay ningún dato duplicado que pueda quedar
desincronizado con su origen, y un reporte nunca puede contradecir a la operación porque lee de
ella.

| Vista | Qué responde |
|---|---|
| `vw_vehicle_profitability` | costo real (compra + gastos) vs. precio de venta y margen, por unidad |
| `vw_accounts_receivable` | saldo por venta (líneas vigentes − cobros + reembolsos), sin canceladas |
| `vw_sales_summary_monthly` | ventas completadas por mes y moneda, con ventas **y** unidades |
| `vw_sales_by_salesperson` | lo mismo, abierto por vendedor: ranking de desempeño |
| `vw_returns_summary_monthly` | devoluciones parciales por mes: unidades, valor y reembolsos |
| `vw_expenses_summary_monthly` | gastos por mes, categoría, alcance y moneda |
| `vw_inventory_status_summary` | conteo de vehículos activos por `status` |
| `vw_fiscal_documents_summary` | comprobantes por mes, tipo y estado — control ante la DGII |

Hay además una vista auxiliar, `vw_sale_totals`, que no se expone por la API: solo nombra una vez la
suma de las líneas de cada venta para no repetirla en cuatro reportes.

> **Cinco de ellas las redefine la migración 008**, que baja y vuelve a crear las que dependían de
> `sales.vehicle_id` / `sales.sale_price`. Una migración ya escrita no se edita, así que el estado
> final de esas vistas está en `008_sale_items_and_refunds.ts`, no en la 007.

Tres criterios comunes a todas: filtran el borrado lógico (un registro archivado no aparece en un
reporte), exponen cada importe en la moneda del documento **y** convertido con la tasa de ese mismo
documento (solo lo convertido es sumable entre monedas), y devuelven `currencies.code` ya sin el
relleno del `CHAR(3)`.

Dónde vive cada cosa: el cálculo está **en la vista**, y `KyselyReportRepository` solo filtra,
ordena y traduce a `camelCase`. Si un margen cambia de definición, cambia la vista.

**Acceso.** Los cinco agregados piden solo `reports:read`, que tienen los cuatro roles: una cifra
consolidada no revela el detalle de nadie. Los dos reportes de detalle piden además el permiso del
módulo que exponen —`expenses:read` para rentabilidad, `sales:read` para cuentas por cobrar— para
que un reporte no sea una puerta lateral a datos que el rol no puede ver por su propio módulo. En
la práctica: `ventas` no ve márgenes, `inventario` no ve saldos de clientes. Se cambia en una línea
de `reports.routes.ts` si el negocio decide otra cosa.

Si alguna se vuelve lenta con el volumen, se convierte puntualmente a `MATERIALIZED VIEW` con
refresco programado, sin tocar el resto del esquema. La única que cambiaría de semántica al
materializarse es `vw_accounts_receivable`: su `daysOutstanding` se calcula contra `CURRENT_DATE` y
quedaría congelado en la fecha del último refresco.

### Venta de varios vehículos y reembolsos (migración 008)

El esquema entregado ataba una venta a **un** vehículo: `sales.vehicle_id` y `sales.sale_price`. Eso
impedía vender una flotilla en un solo documento y, peor, obligaba a **cancelar la venta entera**
para devolver una unidad. La migración 008 parte `sales` en cabecera y detalle, igual que ya estaban
`purchases` / `purchase_items`:

```
sales (quién, cuándo, en qué moneda)
  ├── sale_items    (qué vehículos y a qué precio cada uno)
  ├── sale_payments (dinero que entró)
  └── refunds       (dinero que salió de vuelta al cliente)
```

**El importe de una venta deja de ser una columna.** Es `SUM(sale_items.sale_price)` de las líneas
`active`. No es una preferencia de estilo: guardarlo además en la tabla crearía dos fuentes del mismo
dato que se desincronizan en cuanto se devuelve un vehículo. Devolver una unidad no reescribe ningún
importe histórico —la línea simplemente deja de sumar—, y por eso la factura ya emitida no se
descuadra.

**`refunds` es una tabla aparte, no un pago negativo.** Meter importes negativos en `sale_payments`
habría roto su `CHECK (amount > 0)` y, sobre todo, su significado: esa tabla responde *cuánto entró*,
no *cuánto neto*. El saldo de la venta se mide contra el cobrado neto (`pagos − reembolsos`), así que
un reembolso vuelve a abrir saldo pendiente, que es exactamente lo que ocurre en la realidad.

**`credit_notes.sale_item_id`** ata la nota de crédito al vehículo devuelto. Con ella, acreditar una
unidad de una venta de tres ya no obliga a anular el comprobante completo, y el techo de la nota pasa
a ser el precio de esa unidad.

#### Dos desviaciones deliberadas del documento de esquema

1. **El `UNIQUE` de `sale_items.vehicle_id` es PARCIAL.** El documento lo pide a secas; aplicado tal
   cual, un vehículo cuya venta se canceló no podría volver a venderse **nunca**, que es justo el
   defecto que arregló la migración 003. Aquí el índice es
   `ON sale_items(vehicle_id) WHERE status = 'active'`, y cancelar una venta marca sus líneas como
   `returned` — los vehículos vuelven a inventario, que es lo que cancelar significa. La regla real
   del negocio queda igual de garantizada, sin perder trazabilidad.

2. **`refunds` lleva `exchange_rate`.** El documento no la trae. Sin ella, un reembolso en dólares no
   se puede consolidar a pesos con el mismo criterio de costo histórico que usa el resto del sistema;
   es la misma razón por la que la migración 005 se la añadió a `expenses`. La tasa es la del día en
   que sale el dinero, no la de la venta.

#### El traslado de los datos

La migración convierte cada venta existente en su única línea antes de soltar las columnas viejas.
Las ventas canceladas o archivadas nacen con la línea en `returned`, para que el índice parcial
refleje el estado real y su vehículo siga siendo revendible. `down()` reconstruye el modelo anterior;
si alguna venta llegó a tener más de un vehículo solo puede recuperar uno, y los reembolsos se
pierden porque antes no había dónde guardarlos.

### Categorías de gasto sembradas

La migración `002` añade diez categorías de gasto que **no venían** en el script original
(nacionalización, transporte interno, reparación, nómina, alquiler…), alineadas al
`expense_scope_enum`. Sin al menos una categoría el módulo de gastos no es usable. Son datos, no
esquema, y pueden editarse o desactivarse desde el catálogo.

### Tipos de columna

- `NUMERIC` se parsea a `number` (el máximo representable, 9 999 999 999.99, cabe de sobra en un
  `double` con 2 decimales).
- `DATE` se mantiene como string `YYYY-MM-DD` para evitar corrimientos de un día por zona horaria:
  es una fecha civil, no un instante.
- `TIMESTAMPTZ` se lee como `Date`.

Ver `src/infrastructure/database/pg-types.ts`.

## Estado de verificación

Comprobado contra una base PostgreSQL real:

- las **ocho** migraciones aplican en orden y el seed crea el administrador; `sales` queda sin
  `vehicle_id` ni `sale_price` y su único `UNIQUE` es el de `sale_number`; la unicidad del vehículo
  vive ahora en `uq_sale_items_vehicle_active`;
- el ciclo comercial completo funciona de punta a punta: marca → vehículo → proveedor → compra →
  recepción a inventario → cliente → cotización → reserva → venta → pagos → cierre;
- **reventa tras cancelación**: cancelar una venta devuelve el vehículo a inventario y permite
  registrar una venta nueva sobre él **sin borrar nada**; las dos ventas conviven en el historial;
- **sesiones**: el login entrega ambos tokens, `refresh` rota el secreto, reutilizar un token ya
  rotado devuelve 401 y cierra todas las sesiones, `logout` invalida el token y `logout-all` cierra
  las sesiones simultáneas;
- **moneda**: una compra en USD @ 60.50 más gastos en DOP y en USD @ 61.00 consolidan en
  916 525.00 DOP, verificado contra el cálculo a mano; un documento en DOP con tasa ≠ 1 y un pago en
  moneda distinta a la de la venta devuelven 422;
- las reglas de negocio devuelven el código correcto (409 en duplicados, 422 en transiciones
  inválidas, saldos excedidos, `scope` incoherente y tasas incoherentes, 400 en errores de forma);
- RBAC bloquea a `ventas` la creación de vehículos y la administración de usuarios;
- `audit_logs` se llena solo, sin `password_hash`;
- **reportes**: las ocho vistas se crean y se revierten sin residuos (`007` y `008` bajan y vuelven a
  subir), y los ocho endpoints devuelven datos coherentes con el juego de demostración: el margen por
  vehículo cuadra con la compra en USD más los gastos convertidos, la venta cancelada no aparece ni
  en cuentas por cobrar ni consumiendo la unidad, el reporte mensual cuenta solo las ventas
  completadas, `?dateFrom=2026-07-15` devuelve julio completo, y el inventario devuelve los seis
  estados aunque alguno esté en cero;
- **varios vehículos por venta**: una venta de tres unidades por 3 000 000 con un cobro de 2 000 000
  pasa a 2 100 000 al devolver una de 900 000, y su saldo de 100 000 sube a 300 000 tras reembolsar
  200 000; el vehículo devuelto vuelve a `in_inventory` y se revende en un documento nuevo sin borrar
  nada; un reembolso mayor a lo cobrado devuelve 422;
- **bloqueo fiscal de la devolución**: con la factura emitida, devolver el vehículo da 422 hasta que
  se emite una nota de crédito por el importe de esa línea; una nota que supera el precio de la línea
  se rechaza; tras la devolución la factura conserva su importe (1 800 000) y baja solo su
  `netAmount` (800 000), sin descontar dos veces;
- **traslado de datos**: sobre una base con el modelo anterior —incluida una venta cancelada del
  mismo vehículo que una vigente— la migración 008 genera una línea por venta, marca `returned` las
  de ventas canceladas y archivadas, y el índice único parcial acepta el caso sin conflicto;
- `npm run typecheck`, `npm run build` y `npm test` (154 pruebas) pasan en limpio.
