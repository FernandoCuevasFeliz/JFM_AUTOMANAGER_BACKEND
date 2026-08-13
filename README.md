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

Aplica cinco migraciones:

1. **`001_initial_schema`** — transcripción literal de `schema_ejgh_autoimport.sql`: extensión
   `pgcrypto`, los 8 ENUM, las 20 tablas, índices y los triggers de `updated_at`.
2. **`002_seed_catalogs`** — catálogos base (monedas, tipos de documento, métodos de pago, roles) y
   un juego inicial de categorías de gasto. Es idempotente (`ON CONFLICT DO NOTHING`).
3. **`003_sales_vehicle_partial_unique`** — sustituye el `UNIQUE` de `sales.vehicle_id` por un
   índice único parcial que ignora las ventas canceladas.
4. **`004_refresh_tokens`** — tabla `refresh_tokens` para sesiones persistentes.
5. **`005_expenses_exchange_rate`** — añade `exchange_rate` a `expenses`.

Las tres últimas modifican el esquema entregado; el porqué de cada una está en
[Cambios sobre el esquema entregado](#cambios-sobre-el-esquema-entregado).

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
`reservations`, `sales`, `catalogs`. Todos siguen la misma estructura.

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

- las **cinco** migraciones aplican en orden y el seed crea el administrador; el `UNIQUE` de
  `sales.vehicle_id` queda sustituido por `uq_sales_vehicle_active` y el único `UNIQUE` que
  permanece en `sales` es el de `sale_number`;
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
- `npm run typecheck`, `npm run build` y `npm test` (60 pruebas) pasan en limpio.
