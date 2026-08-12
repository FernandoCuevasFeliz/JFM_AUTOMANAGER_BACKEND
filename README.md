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

Requisitos: Node.js 20 o superior y PostgreSQL 14 o superior.

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

Aplica dos migraciones:

1. **`001_initial_schema`** — transcripción literal de `schema_ejgh_autoimport.sql`: extensión
   `pgcrypto`, los 8 ENUM, las 20 tablas, índices y los triggers de `updated_at`.
2. **`002_seed_catalogs`** — catálogos base (monedas, tipos de documento, métodos de pago, roles) y
   un juego inicial de categorías de gasto. Es idempotente (`ON CONFLICT DO NOTHING`).

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

`purchase_items.vehicle_id` y `sales.vehicle_id` son `UNIQUE` en la base (un vehículo se compra y se
vende una sola vez). El dominio comprueba ambas antes de insertar y devuelve **409 con un mensaje
que explica la regla** (`VehicleAlreadyPurchasedError`, `VehicleAlreadySoldError`) en lugar de dejar
escapar el error de constraint de Postgres como un 500.

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

`POST /api/v1/auth/login` es el **único endpoint público**. Devuelve un access token JWT (HS256) con
el id del usuario en `sub` y el nombre de su rol. El resto de la API exige
`Authorization: Bearer <token>`.

El login ejecuta una comparación bcrypt contra un hash señuelo cuando el correo no existe, para que
un correo inexistente no responda notablemente más rápido que uno existente (enumeración por tiempo).

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

Todo cuelga de `/api/v1`.

| Recurso | Endpoints |
|---|---|
| `/auth` | `POST /login` · `GET /me` · `POST /change-password` |
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

El módulo `vehicles` está cubierto con tests unitarios de sus casos de uso como muestra del patrón a
replicar en los demás módulos (`tests/vehicles/`, 40 pruebas):

- máquina de estados y disponibilidad comercial del vehículo;
- `create-vehicle`: normalización del VIN, chasis duplicado, modelo ajeno a la marca, estados
  vetados;
- `update-vehicle`: actualización parcial, unicidad del chasis, coherencia marca/modelo;
- `change-vehicle-status`: transiciones válidas e inválidas, estados del ciclo comercial;
- `delete-vehicle`: bloqueo de vendidos y reservados;
- imágenes: promoción automática de portada.

Los repositorios se sustituyen por dobles en memoria (`tests/helpers/fake-vehicle-repository.ts`),
que verifican el **efecto observable** (qué queda guardado, con qué estado) en lugar de la secuencia
exacta de llamadas: así los tests no se rompen ante una refactorización que no cambia el
comportamiento.

---

## Decisiones que conviene conocer

### `sales.vehicle_id UNIQUE` y las ventas canceladas

El `UNIQUE` de `sales.vehicle_id` **no tiene condición**: mientras exista la fila —aunque la venta
esté `cancelled` o marcada con `deleted_at`— ese vehículo no puede volver a venderse. Consecuencia:

- `cancel-sale` devuelve el vehículo a `in_inventory`, pero **no lo deja revendible**.
- Para revenderlo hay que eliminar la venta cancelada: `DELETE /sales/:id`, que solo acepta ventas
  en estado `cancelled` y hace un **borrado físico** (sus pagos se van en cascada). Es el único
  borrado físico del sistema, y por eso `sales` no usa borrado lógico.

**Propuesta (no aplicada)**: sustituir el `UNIQUE` por un índice único parcial que ignore las
canceladas, lo que permitiría conservar el histórico y revender sin borrar nada:

```sql
ALTER TABLE sales DROP CONSTRAINT sales_vehicle_id_key;
CREATE UNIQUE INDEX uq_sales_vehicle_active
  ON sales(vehicle_id)
  WHERE status <> 'cancelled' AND deleted_at IS NULL;
```

No se aplicó para no modificar el esquema entregado. Queda a decisión del equipo.

### Refresh tokens: propuestos, no implementados

El sistema emite **solo access tokens** de vida corta. El esquema no incluye una tabla donde
almacenar refresh tokens y la consigna es no inventar tablas, así que la propuesta queda planteada:

```sql
CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,  -- SHA-256 del token, nunca el token
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent VARCHAR(255),
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
```

Permitiría sesiones largas sin ampliar la vigencia del access token y cerrar sesión del lado del
servidor. **Requiere aprobación antes de añadirse.**

Mientras tanto, como el token lleva el rol dentro, un cambio de rol no surte efecto hasta que
expira: de ahí la vigencia corta de `JWT_EXPIRES_IN`.

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

### Costos en moneda mixta

`GET /expenses/vehicle-cost/:vehicleId` suma el costo de importación y los gastos **en su moneda
original**. La empresa compra en USD y vende en DOP, con tasas que se registran por documento
(`purchases.exchange_rate`, `sales.exchange_rate`); la conversión a una moneda única de reporte no
está implementada y debería definirse con el área contable antes de codificarla.

---

## Estado de verificación

Comprobado contra una base PostgreSQL real:

- las dos migraciones aplican (20 tablas de negocio, 20 triggers de `updated_at`) y el seed crea el
  administrador;
- el ciclo comercial completo funciona de punta a punta: marca → modelo → vehículo → proveedor →
  compra → recepción a inventario → cliente → cotización → reserva → venta → pagos → cierre;
- las reglas de negocio devuelven el código correcto (409 en duplicados y `UNIQUE`, 422 en
  transiciones inválidas, saldos excedidos y `scope` incoherente, 400 en errores de forma);
- RBAC bloquea a `ventas` la creación de vehículos y la administración de usuarios;
- `audit_logs` se llena solo, en 15 combinaciones de tabla/acción, sin `password_hash`;
- `npm run typecheck`, `npm run build` y `npm test` (40 pruebas) pasan en limpio.
