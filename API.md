# JFM AutoManager — Guía de la API para el frontend

Todo lo que necesitas para construir el cliente contra este backend: convenciones, autenticación,
permisos, endpoints, estados y las reglas de negocio que la interfaz debe anticipar.

> Este documento describe **el contrato HTTP**. Para instalar y correr el backend, ver
> [README.md](README.md).

---

## Índice

1. [Convenciones generales](#1-convenciones-generales)
2. [Autenticación y sesión](#2-autenticación-y-sesión)
3. [Permisos por rol](#3-permisos-por-rol)
4. [Arranque de la aplicación](#4-arranque-de-la-aplicación)
5. [Endpoints](#5-endpoints)
6. [Estados y transiciones](#6-estados-y-transiciones)
7. [Reglas de negocio que la UI debe anticipar](#7-reglas-de-negocio-que-la-ui-debe-anticipar)
8. [Estructura del backend](#8-estructura-del-backend)

---

## 1. Convenciones generales

### URL base

```
http://localhost:3000/api/v1
```

Fuera del prefijo solo existen `GET /health` (el proceso responde) y `GET /health/ready` (además la
base de datos contesta; devuelve 503 si no).

### Formato de las respuestas

Todo viene envuelto. **Nunca** llega un array o un escalar en la raíz.

```jsonc
// Éxito (200, 201)
{ "data": { "id": "…", "chassisNumber": "JT2BF22K1X0111111" } }

// Listado paginado
{
  "data": [ /* … */ ],
  "meta": { "total": 42, "page": 1, "pageSize": 20, "totalPages": 3 }
}

// Sin contenido (204) — cuerpo vacío
```

```jsonc
// Error (4xx, 5xx)
{
  "error": {
    "code": "CONFLICT",
    "message": "Ya existe un cliente con el documento 402-1234567-8 para ese tipo de documento",
    "details": { "field": "documentNumber", "documentNumber": "402-1234567-8" }
  }
}
```

`message` está redactado en español y **es apto para mostrarse tal cual al usuario**. `code` es
estable: úsalo para reaccionar en el código, no el texto.

### Códigos de error

| `code` | HTTP | Qué significa | Qué hacer en el frontend |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | El cuerpo o la query no cumplen la forma esperada | Pintar los errores campo a campo desde `details` |
| `MALFORMED_JSON` | 400 | El JSON enviado no se puede parsear | Bug del cliente |
| `UNAUTHORIZED` | 401 | Sin token, token inválido o expirado | Intentar `POST /auth/refresh`; si falla, ir al login |
| `FORBIDDEN` | 403 | Autenticado pero sin permiso | No debería ocurrir si ocultas la acción; mostrar aviso |
| `NOT_FOUND` | 404 | El recurso no existe o fue borrado | Volver al listado |
| `ROUTE_NOT_FOUND` | 404 | La ruta no existe | Bug del cliente |
| `CONFLICT` | 409 | Choca con un valor único ya existente | Marcar `details.field` como duplicado |
| `BUSINESS_RULE_VIOLATION` | 422 | Viola una regla del negocio | Mostrar `message`; suele explicar qué hacer |
| `INVALID_REFERENCE` | 422 | Apunta a una entidad que no existe | Refrescar los catálogos |
| `INTERNAL_ERROR` | 500 | Fallo inesperado | Mensaje genérico y reintento |

`VALIDATION_ERROR` trae el detalle por campo:

```jsonc
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "La solicitud contiene datos invalidos",
    "details": [
      { "path": "body.brandId", "message": "Identificador invalido" },
      { "path": "body.year",    "message": "El ano no puede ser anterior a 1900" }
    ]
  }
}
```

El `path` viene prefijado por el origen (`body.`, `query.`, `params.`), así que para mapearlo a tu
formulario basta con quitar el prefijo.

### Tipos de dato

| Tipo | Formato | Ejemplo |
|---|---|---|
| Identificadores | UUID v4 en string | `"7c380846-c0cd-4086-8860-6a794887b79e"` |
| Fecha y hora | ISO 8601 UTC | `"2026-03-05T14:22:31.115Z"` |
| **Fecha civil** | `YYYY-MM-DD`, **sin** hora ni zona | `"2026-03-05"` |
| Dinero | `number` con 2 decimales | `1800000.00` |
| Tasa de cambio | `number` con 4 decimales | `60.5` |

La distinción entre los dos tipos de fecha importa. Los campos `…Date`, `validUntil` y
`expirationDate` son **fechas civiles**: no las conviertas a `Date` de JavaScript para mostrarlas o
te correrán un día según la zona horaria del navegador. Trátalas como string.

Campos con fecha civil: `purchaseDate`, `expenseDate`, `saleDate`, `paymentDate`, `validUntil`,
`reservationDate`, `expirationDate`.

### Paginación y filtros

Todos los listados aceptan:

| Query | Por defecto | Notas |
|---|---|---|
| `page` | `1` | Empieza en 1, no en 0 |
| `pageSize` | `20` | Máximo `100` |
| `search` | — | Búsqueda libre; qué campos cubre se indica en cada endpoint |

Los booleanos en la query van como **texto literal**: `?isActive=true`, `?isActive=false`. Cualquier
otro valor da 400.

Las fechas en filtros usan el formato civil: `?dateFrom=2026-01-01&dateTo=2026-12-31`.

### Actualizaciones parciales (`PATCH`)

Los `PATCH` distinguen tres situaciones:

- **campo ausente** → no se toca;
- **campo con valor** → se actualiza;
- **campo en `null`** → se borra (solo en campos que admiten nulo).

No envíes el objeto completo: manda solo lo que cambió. Un `PATCH` con el cuerpo vacío devuelve 400
(`Debe enviar al menos un campo a modificar`).

---

## 2. Autenticación y sesión

### El flujo

```
POST /auth/login    ──► accessToken (corto) + refreshToken (largo)
                          │
     cada petición ◄───────┘   Authorization: Bearer <accessToken>
                          │
     access expirado ─► POST /auth/refresh ─► par NUEVO (el anterior queda muerto)
                          │
POST /auth/logout   ──► revoca el refreshToken
```

- El **access token** es un JWT de vida corta (8 h por defecto). Va en cada petición.
- El **refresh token** es un secreto opaco de vida larga (30 días por defecto). **Solo** se usa
  contra `/auth/refresh` y `/auth/logout`.

### Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/auth/login` | **pública** | Inicia sesión |
| `POST` | `/auth/refresh` | **pública** | Renueva el par de tokens |
| `POST` | `/auth/logout` | **pública** | Cierra la sesión actual |
| `GET` | `/auth/me` | token | Datos del usuario autenticado |
| `GET` | `/auth/sessions` | token | Sesiones abiertas del propio usuario |
| `POST` | `/auth/logout-all` | token | Cierra la sesión en todos los dispositivos |
| `POST` | `/auth/change-password` | token | Cambia la propia contraseña |

`/auth/refresh` es pública **a propósito**: no puede exigir un access token válido, porque su razón
de ser es que ese token ya expiró. Lo que la autoriza es el refresh token del cuerpo.

### `POST /auth/login`

```jsonc
// Request
{ "email": "admin@ejghautoimport.com", "password": "Admin123*" }
```

```jsonc
// 200
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs…",
    "expiresAt": "2026-03-05T22:22:31.000Z",
    "refreshToken": "kR8v…",                       // ← guárdalo; no vuelve a mostrarse
    "refreshExpiresAt": "2026-04-04T14:22:31.000Z",
    "user": {
      "id": "7c380846-…", "roleId": "…", "roleName": "admin",
      "firstName": "Administrador", "lastName": "General",
      "email": "admin@ejghautoimport.com", "phone": null,
      "isActive": true, "lastLoginAt": "2026-03-04T09:00:00.000Z",
      "createdAt": "…", "updatedAt": "…", "deletedAt": null
    },
    "permissions": ["users:read", "users:write", "vehicles:read", "…"]
  }
}
```

Credenciales incorrectas → `401 UNAUTHORIZED` con mensaje genérico (*"Correo o contrasena
incorrectos"*). **No distingue** si el correo existe: no intentes deducirlo.

Usuario desactivado → `401` con *"El usuario esta inactivo…"*.

### `POST /auth/refresh`

```jsonc
// Request
{ "refreshToken": "kR8v…" }
// 200 → exactamente la misma forma que el login, con un refreshToken NUEVO
```

**Cada refresh token es de un solo uso.** Al canjearlo se invalida y recibes otro. Guarda el nuevo y
descarta el anterior de inmediato.

Si presentas un token ya rotado, el backend asume que hay una copia robada en circulación,
**cierra todas las sesiones del usuario** y devuelve `401`. El mensaje contiene *"uso indebido"*.
En ese caso lleva al usuario al login; no reintentes.

### Interceptor recomendado

```ts
// Pseudo-código del cliente HTTP
async function request(config) {
  let res = await fetch(url, withAccessToken(config));

  if (res.status === 401 && !config.isRetry) {
    const renewed = await refreshSession();   // POST /auth/refresh
    if (!renewed) return redirectToLogin();
    res = await fetch(url, withAccessToken({ ...config, isRetry: true }));
  }
  return res;
}
```

Dos precauciones:

1. **Serializa los refrescos.** Si cinco peticiones fallan a la vez con 401 y las cinco llaman a
   `/auth/refresh`, la primera rota el token y las otras cuatro lo presentan ya usado → el backend
   lo interpreta como robo y cierra todo. Usa una única promesa compartida de refresco.
2. **No reintentes `/auth/refresh`.** Si falla, es sesión terminada.

### `POST /auth/logout`

```jsonc
{ "refreshToken": "kR8v…" }   // → 204
```

Siempre responde 204, exista el token o no. El **access token sigue siendo válido hasta que
expire**: un JWT firmado no se puede invalidar. Borra ambos tokens del almacenamiento del cliente.

### `GET /auth/sessions`

```jsonc
{ "data": [
  { "id": "…", "userAgent": "Mozilla/5.0…", "ipAddress": "190.80.1.1",
    "createdAt": "2026-03-05T14:22:31.115Z", "expiresAt": "2026-04-04T14:22:31.000Z" }
] }
```

`POST /auth/logout-all` → `{ "data": { "revoked": 3 } }`.

### `POST /auth/change-password`

```jsonc
{ "currentPassword": "Admin123*", "newPassword": "NuevaClave2026" }   // → 204
```

**Cambiar la contraseña cierra todas las sesiones**, incluida la actual. Tras un 204, manda al
usuario al login.

Reglas de la contraseña (validadas por el servidor): 8–72 caracteres, al menos una letra y al menos
un número.

### Almacenamiento de tokens

El backend no impone dónde guardarlos (no usa cookies). `localStorage` es lo más simple;
`sessionStorage` o memoria + cookie `httpOnly` gestionada por tu propio BFF son más seguros frente a
XSS. Es decisión del frontend.

---

## 3. Permisos por rol

El backend **no** modela permisos en la base de datos: viven en el código. Cada rol tiene una lista
fija, y el login y el refresco te la devuelven en `permissions`.

**Usa ese array para decidir qué mostrar.** No codifiques `if (rol === 'admin')` en el frontend: si
mañana cambia el mapa de permisos, tu interfaz quedaría desincronizada.

```ts
const can = (p: string) => session.permissions.includes(p);

{can('vehicles:write') && <BotonNuevoVehiculo />}
```

### Convención

`<recurso>:<acción>` — `read` (consultar y listar), `write` (crear y actualizar), `delete` (borrado
lógico). Las acciones propias del negocio llevan su verbo: `vehicles:change-status`.

### Matriz

| Permiso | admin | ventas | inventario | contabilidad |
|---|:--:|:--:|:--:|:--:|
| `users:read` / `write` / `delete` | ✅ | — | — | — |
| `catalogs:read` | ✅ | ✅ | ✅ | ✅ |
| `catalogs:write` | ✅ | — | ✅ | — |
| `vehicles:read` | ✅ | ✅ | ✅ | ✅ |
| `vehicles:write` | ✅ | — | ✅ | — |
| `vehicles:delete` | ✅ | — | ✅ | — |
| `vehicles:change-status` | ✅ | — | ✅ | — |
| `clients:read` | ✅ | ✅ | ✅ | ✅ |
| `clients:write` | ✅ | ✅ | — | — |
| `clients:delete` | ✅ | — | — | — |
| `suppliers:read` | ✅ | — | ✅ | ✅ |
| `suppliers:write` / `delete` | ✅ | — | ✅ | — |
| `purchases:read` | ✅ | — | ✅ | ✅ |
| `purchases:write` / `delete` | ✅ | — | ✅ | — |
| `expenses:read` | ✅ | — | ✅ | ✅ |
| `expenses:write` / `delete` | ✅ | — | — | ✅ |
| `quotations:read` | ✅ | ✅ | — | ✅ |
| `quotations:write` / `delete` | ✅ | ✅ | — | — |
| `reservations:read` | ✅ | ✅ | — | ✅ |
| `reservations:write` / `delete` | ✅ | ✅ | — | — |
| `sales:read` | ✅ | ✅ | — | ✅ |
| `sales:write` | ✅ | ✅ | — | — |
| `sales:delete` | ✅ | — | — | — |
| `payments:read` / `write` | ✅ | ✅ | — | ✅ |
| `invoices:read` | ✅ | ✅ | — | ✅ |
| `invoices:write` | ✅ | — | — | ✅ |
| `invoices:issue` | ✅ | — | — | ✅ |
| `credit-notes:write` | ✅ | — | — | ✅ |
| `audit:read` | ✅ | — | — | — |
| `reports:read` | ✅ | ✅ | ✅ | ✅ |

La fuente de verdad es `src/domain/users/permissions.ts`. Un rol que no aparezca en ese mapa **no
tiene ningún permiso** (fail-closed).

> **Dos permisos están declarados pero todavía no tienen endpoint**: `audit:read` (no hay API de
> consulta de `audit_logs`; la tabla se escribe pero no se lee) y `reservations:delete` (las reservas
> se cancelan, no se borran). No construyas pantallas para ellos todavía.

`reports:read` cubre `GET /sales/summary` y todo `/reports` ([§5.13](#513-reportes)). Lo tienen los
cuatro roles, pero los dos reportes de detalle exigen **además** el permiso del módulo que exponen
(`expenses:read` para rentabilidad, `sales:read` para cuentas por cobrar).

---

## 4. Arranque de la aplicación

Secuencia recomendada al cargar la SPA:

```
¿hay refreshToken guardado?
  ├─ no  → pantalla de login
  └─ sí  → POST /auth/refresh
             ├─ 401 → limpiar almacenamiento → login
             └─ 200 → guardar tokens, user y permissions
                        └─ GET /catalogs  (una vez, cachear en memoria)
```

**Arranca con `/auth/refresh`, no con `/auth/me`.** El refresco te devuelve token nuevo, usuario
**y** `permissions` en una sola llamada; `/auth/me` devuelve solo el usuario, sin permisos.

`GET /catalogs` trae de un golpe las cuatro listas que necesitan casi todos los formularios
(monedas, tipos de documento, métodos de pago y categorías de gasto). Cachéalas: cambian por
despliegue, no por operación.

---

## 5. Endpoints

Cada tabla indica el permiso exigido. Un `—` significa que basta con estar autenticado.

### 5.1 Catálogos

| Método | Ruta | Permiso |
|---|---|---|
| `GET` | `/catalogs` | `catalogs:read` |
| `POST` | `/catalogs/expense-categories` | `catalogs:write` |

`GET /catalogs?includeInactive=true` (por defecto solo activos):

```jsonc
{ "data": {
  "documentTypes":     [{ "id": "…", "name": "Cedula", "isActive": true, "createdAt": "…", "updatedAt": "…" }],
  "currencies":        [{ "id": "…", "code": "DOP", "name": "Peso Dominicano", "symbol": "RD$", "isActive": true, … }],
  "paymentMethods":    [{ "id": "…", "name": "Efectivo", "isActive": true, … }],
  "expenseCategories": [{ "id": "…", "name": "Nacionalizacion / Aduana", "scope": "vehicle", "isActive": true, … }]
} }
```

`scope` de la categoría vale `"general"` o `"vehicle"` y **condiciona el formulario de gastos**
(ver §7).

`POST /catalogs/expense-categories` → `{ "name": "…", "scope": "vehicle" }` → 201.

### 5.2 Marcas y modelos

| Método | Ruta | Permiso |
|---|---|---|
| `GET` | `/vehicle-brands` | `catalogs:read` |
| `POST` | `/vehicle-brands` | `catalogs:write` |
| `PATCH` | `/vehicle-brands/:id` | `catalogs:write` |
| `GET` | `/vehicle-models` | `catalogs:read` |
| `POST` | `/vehicle-models` | `catalogs:write` |
| `PATCH` | `/vehicle-models/:id` | `catalogs:write` |

Query: `?includeInactive=true`, y en modelos `?brandId=<uuid>` para el típico select en cascada.

```jsonc
// POST /vehicle-brands            { "name": "Toyota" }
// PATCH /vehicle-brands/:id       { "name": "…", "isActive": false }
// POST /vehicle-models            { "brandId": "…", "name": "Corolla Cross" }
// PATCH /vehicle-models/:id       { "name": "…", "isActive": false }

// GET /vehicle-models → cada modelo incluye el nombre de su marca
{ "data": [{ "id": "…", "brandId": "…", "brandName": "Toyota", "name": "Corolla Cross", "isActive": true, … }] }
```

Marcas y modelos **no se borran**, se desactivan (`isActive: false`): siempre hay vehículos
históricos apuntando a ellos.

### 5.3 Usuarios

| Método | Ruta | Permiso |
|---|---|---|
| `GET` | `/users/roles` | `users:read` |
| `GET` | `/users` | `users:read` |
| `GET` | `/users/:id` | `users:read` |
| `POST` | `/users` | `users:write` |
| `PATCH` | `/users/:id` | `users:write` |
| `POST` | `/users/:id/reset-password` | `users:write` |
| `DELETE` | `/users/:id` | `users:delete` |

Filtros del listado: `search` (nombre, apellido, correo), `roleId`, `isActive`.

```jsonc
// POST /users
{ "roleId": "…", "firstName": "Ana", "lastName": "Vendedora",
  "email": "ana@ejghautoimport.com", "password": "Ventas2026",
  "phone": null, "isActive": true }

// PATCH /users/:id — todos opcionales
{ "roleId": "…", "firstName": "…", "lastName": "…", "email": "…", "phone": null, "isActive": false }

// POST /users/:id/reset-password  (no pide la contraseña actual)
{ "newPassword": "NuevaClave2026" }   // → 204
```

`GET /users/roles` devuelve cada rol **con sus permisos**, útil para una pantalla de administración:

```jsonc
{ "data": [{ "id": "…", "name": "ventas", "description": "Gestion de cotizaciones…",
             "isActive": true, "permissions": ["catalogs:read", "vehicles:read", …] }] }
```

El hash de contraseña **nunca** viaja en ninguna respuesta.

### 5.4 Vehículos

| Método | Ruta | Permiso |
|---|---|---|
| `GET` | `/vehicles/summary` | `vehicles:read` |
| `GET` | `/vehicles` | `vehicles:read` |
| `GET` | `/vehicles/:id` | `vehicles:read` |
| `POST` | `/vehicles` | `vehicles:write` |
| `PATCH` | `/vehicles/:id` | `vehicles:write` |
| `PATCH` | `/vehicles/:id/status` | `vehicles:change-status` |
| `DELETE` | `/vehicles/:id` | `vehicles:delete` |
| `GET` | `/vehicles/:id/images` | `vehicles:read` |
| `POST` | `/vehicles/:id/images` | `vehicles:write` |
| `PATCH` | `/vehicles/:id/images/:imageId/primary` | `vehicles:write` |
| `DELETE` | `/vehicles/:id/images/:imageId` | `vehicles:write` |

Filtros: `search` (chasis, color, marca, modelo), `status` (repetible: `?status=in_inventory&status=reserved`),
`brandId`, `modelId`, `yearFrom`, `yearTo`, `priceFrom`, `priceTo`, `isActive`.

```jsonc
// POST /vehicles
{
  "brandId": "…", "modelId": "…", "year": 2024,
  "chassisNumber": "jt2bf22k1x0111111",     // se normaliza a MAYÚSCULAS
  "color": "Blanco", "mileage": 12,
  "engineNumber": null, "transmissionType": "automatica", "fuelType": "gasolina",
  "salePrice": 1850000,
  "status": "in_transit",                   // in_transit | in_inventory | in_repair | unavailable
  "notes": null, "isActive": true
}
```

```jsonc
// GET /vehicles/:id
{ "data": {
  "id": "…", "brandId": "…", "modelId": "…", "brandName": "Toyota", "modelName": "Corolla Cross",
  "year": 2024, "chassisNumber": "JT2BF22K1X0111111", "color": "Blanco", "mileage": 12,
  "engineNumber": null, "transmissionType": "automatica", "fuelType": "gasolina",
  "salePrice": 1850000, "status": "in_inventory", "notes": null, "isActive": true,
  "images": [{ "id": "…", "vehicleId": "…", "url": "https://…", "isPrimary": true, … }],
  "createdAt": "…", "updatedAt": "…", "deletedAt": null
} }
```

`PATCH /vehicles/:id` **no acepta `status`**: el cambio de estado tiene su propio endpoint porque
está sujeto a la máquina de estados.

```jsonc
// PATCH /vehicles/:id/status
{ "status": "in_inventory" }   // solo: in_transit | in_inventory | in_repair | unavailable
```

`GET /vehicles/summary` para el tablero:

```jsonc
{ "data": {
  "byStatus": { "in_transit": 3, "in_inventory": 12, "reserved": 2, "sold": 40, "in_repair": 1, "unavailable": 0 },
  "total": 58,
  "available": 12
} }
```

**Imágenes.** El backend solo guarda la **URL**: no recibe archivos ni hace subidas. Sube el archivo
a donde corresponda (ImageKit, S3, Cloudinary) y manda aquí la URL resultante. Si usas ImageKit,
[§5.12](#512-firma-de-subidas) explica cómo obtener la firma que exige su subida directa.

```jsonc
// POST /vehicles/:id/images
{ "url": "https://cdn.ejgh.do/v1/frente.jpg", "isPrimary": false }
```

La **primera** imagen queda como principal aunque mandes `isPrimary: false`. Al borrar la principal,
el backend promueve otra automáticamente: un vehículo con imágenes nunca se queda sin portada.

### 5.5 Clientes

| Método | Ruta | Permiso |
|---|---|---|
| `GET` | `/clients` | `clients:read` |
| `GET` | `/clients/:id` | `clients:read` |
| `POST` | `/clients` | `clients:write` |
| `PATCH` | `/clients/:id` | `clients:write` |
| `DELETE` | `/clients/:id` | `clients:delete` |

Filtros: `search` (nombre, razón social, documento, teléfono, correo), `clientType`, `city`, `isActive`.

```jsonc
// POST /clients — persona
{ "clientType": "individual", "documentTypeId": "…", "documentNumber": "402-1234567-8",
  "firstName": "Hidekel", "lastName": "Reyes", "companyName": null,
  "email": null, "phone": "809-555-0101", "address": null, "city": "Santiago", "isActive": true }

// POST /clients — empresa
{ "clientType": "company", "documentTypeId": "…", "documentNumber": "131-99999-1",
  "firstName": null, "lastName": null, "companyName": "Transporte del Cibao SRL",
  "phone": "809-555-0102" }
```

La respuesta añade `documentTypeName`. Ver §7 para la regla de identidad según `clientType`.

### 5.6 Proveedores

| Método | Ruta | Permiso |
|---|---|---|
| `GET` | `/suppliers` | `suppliers:read` |
| `GET` | `/suppliers/:id` | `suppliers:read` |
| `POST` | `/suppliers` | `suppliers:write` |
| `PATCH` | `/suppliers/:id` | `suppliers:write` |
| `DELETE` | `/suppliers/:id` | `suppliers:delete` |

Filtros: `search` (nombre, contacto, documento, correo), `country`, `isActive`.

```jsonc
{ "name": "Japan Auto Export KK", "contactName": null, "documentNumber": null,
  "email": null, "phone": null, "address": null, "country": "Japon", "isActive": true }
```

### 5.7 Compras

| Método | Ruta | Permiso |
|---|---|---|
| `GET` | `/purchases` | `purchases:read` |
| `GET` | `/purchases/:id` | `purchases:read` |
| `POST` | `/purchases` | `purchases:write` |
| `PATCH` | `/purchases/:id` | `purchases:write` |
| `PATCH` | `/purchases/:id/status` | `purchases:write` |
| `DELETE` | `/purchases/:id` | `purchases:delete` |

Filtros: `search` (número, factura, proveedor), `supplierId`, `status`, `dateFrom`, `dateTo`.

```jsonc
// POST /purchases — encabezado + items en una sola llamada (transacción)
{
  "supplierId": "…", "currencyId": "<USD>",
  "purchaseNumber": null,          // opcional: si lo omites se genera COM-2026-000001
  "invoiceNumber": "INV-9981",
  "purchaseDate": "2026-02-10",
  "exchangeRate": 60.5,
  "status": "pending",             // pending | in_transit | received | cancelled
  "notes": null,
  "items": [
    { "vehicleId": "…", "unitCost": 11000, "freightCost": 900, "insuranceCost": 150, "otherCosts": 400 },
    { "vehicleId": "…", "unitCost": 9500,  "freightCost": 900 }
  ]
}
```

`freightCost`, `insuranceCost` y `otherCosts` son opcionales (0 por defecto). La compra debe llevar
**al menos un item**.

```jsonc
// Respuesta — el detalle incluye los items resueltos y el total
{ "data": {
  "id": "…", "purchaseNumber": "COM-2026-000001", "supplierName": "Japan Auto Export KK",
  "currencyCode": "USD", "exchangeRate": 60.5, "purchaseDate": "2026-02-10",
  "status": "pending", "createdByName": "Administrador General",
  "items": [{ "id": "…", "vehicleId": "…", "chassisNumber": "JT2…", "brandName": "Toyota",
              "modelName": "Corolla Cross", "year": 2024,
              "unitCost": 11000, "freightCost": 900, "insuranceCost": 150, "otherCosts": 400, … }],
  "totalCost": 22850
} }
```

```jsonc
// PATCH /purchases/:id/status
{ "status": "received" }
```

Marcar `received` es el evento que **ingresa la mercancía**: todos los vehículos de la compra que
sigan `in_transit` pasan a `in_inventory` en la misma transacción.

`PATCH /purchases/:id` solo edita el encabezado (`supplierId`, `currencyId`, `invoiceNumber`,
`purchaseDate`, `exchangeRate`, `notes`) y **solo mientras la compra está abierta** (`pending` o
`in_transit`).

### 5.8 Gastos

| Método | Ruta | Permiso |
|---|---|---|
| `GET` | `/expenses/vehicle-cost/:vehicleId` | `reports:read` |
| `GET` | `/expenses` | `expenses:read` |
| `GET` | `/expenses/:id` | `expenses:read` |
| `POST` | `/expenses` | `expenses:write` |
| `PATCH` | `/expenses/:id` | `expenses:write` |
| `DELETE` | `/expenses/:id` | `expenses:delete` |

Filtros: `search` (descripción, categoría, chasis), `categoryId`, `vehicleId`, `generalOnly`,
`paymentMethodId`, `dateFrom`, `dateTo`.

`?generalOnly=true` deja solo gastos de empresa; `?generalOnly=false`, solo gastos de vehículo.

```jsonc
// POST /expenses
{ "categoryId": "…", "vehicleId": "…",     // null = gasto general de la empresa
  "currencyId": "…", "paymentMethodId": "…",
  "description": "Nacionalizacion y aduana",
  "amount": 145000,
  "exchangeRate": 1,                        // pesos por unidad de la moneda; 1 si ya es DOP
  "expenseDate": "2026-02-20" }
```

La respuesta añade `categoryName`, `categoryScope`, `currencyCode`, `paymentMethodName`,
`vehicleChassisNumber` y `createdByName`.

**`GET /expenses/vehicle-cost/:vehicleId`** — el costo real y el margen de una unidad, consolidado en
pesos:

```jsonc
{ "data": {
  "vehicleId": "…", "reportingCurrency": "DOP",
  "purchaseCurrencyCode": "USD", "purchaseExchangeRate": 60.5,
  "purchaseCost": 11000, "freightCost": 900, "insuranceCost": 150, "otherPurchaseCosts": 400,
  "importSubtotal": 12450, "importSubtotalConverted": 753225,
  "expensesByCurrency": [
    { "currencyCode": "DOP", "total": 145000, "totalConverted": 145000 },
    { "currencyCode": "USD", "total": 300,    "totalConverted": 18300 }
  ],
  "expensesTotalConverted": 163300,
  "totalCostConverted": 916525,
  "listPrice": 1850000,
  "saleCurrencyCode": "DOP", "soldPrice": 1800000, "soldPriceConverted": 1800000,
  "margin": 883475, "marginPercentage": 96.39
} }
```

**Solo los campos con sufijo `Converted` son sumables entre sí.** Los demás están en la moneda
original de cada documento; si los sumas, mezclas pesos con dólares.

`margin` y `soldPrice*` son `null` mientras el vehículo no se haya vendido.

### 5.9 Cotizaciones

| Método | Ruta | Permiso |
|---|---|---|
| `POST` | `/quotations/expire-overdue` | `quotations:write` |
| `GET` | `/quotations` | `quotations:read` |
| `GET` | `/quotations/:id` | `quotations:read` |
| `POST` | `/quotations` | `quotations:write` |
| `PATCH` | `/quotations/:id` | `quotations:write` |
| `PATCH` | `/quotations/:id/status` | `quotations:write` |
| `DELETE` | `/quotations/:id` | `quotations:delete` |

Filtros: `search` (número, chasis, cliente), `clientId`, `vehicleId`, `status`, `dateFrom`, `dateTo`
(sobre `validUntil`).

```jsonc
// POST /quotations — el número se genera solo (COT-2026-000001)
{ "clientId": "…", "vehicleId": "…", "currencyId": "…",
  "quotedPrice": 1800000, "validUntil": "2026-04-30", "notes": null }

// PATCH /quotations/:id — solo precio, moneda, vigencia y notas
{ "quotedPrice": 1750000, "validUntil": "2026-05-15" }

// PATCH /quotations/:id/status
{ "status": "approved" }   // solo: approved | rejected | expired
```

`converted` **no se puede asignar a mano**: lo pone el sistema al crear la reserva o la venta que
nace de la cotización.

La respuesta añade `clientName`, `vehicleChassisNumber`, `vehicleBrandName`, `vehicleModelName`,
`vehicleYear`, `currencyCode` y `createdByName`.

`POST /quotations/expire-overdue` → `{ "data": { "expired": 4 } }`. Mantenimiento; el vencimiento
también se respeta en tiempo real al intentar convertir.

### 5.10 Reservas

| Método | Ruta | Permiso |
|---|---|---|
| `POST` | `/reservations/expire-overdue` | `reservations:write` |
| `GET` | `/reservations` | `reservations:read` |
| `GET` | `/reservations/:id` | `reservations:read` |
| `POST` | `/reservations` | `reservations:write` |
| `PATCH` | `/reservations/:id` | `reservations:write` |
| `POST` | `/reservations/:id/cancel` | `reservations:write` |

Filtros: `search`, `clientId`, `vehicleId`, `status`, `dateFrom`, `dateTo` (sobre `reservationDate`).

```jsonc
// POST /reservations — número automático (RES-2026-000001)
{ "quotationId": "…",          // o null si se reserva sin cotizar antes
  "clientId": "…", "vehicleId": "…",
  "depositAmount": 100000,
  "reservationDate": "2026-03-01",
  "expirationDate": "2026-03-31" }

// PATCH /reservations/:id — prórroga o ajuste del depósito
{ "expirationDate": "2026-04-15", "depositAmount": 150000 }
```

Crear la reserva **pasa el vehículo a `reserved`** y marca la cotización como `converted`, todo en
una transacción. `POST /reservations/:id/cancel` hace lo inverso: la reserva queda `cancelled` y el
vehículo vuelve a `in_inventory`.

Las reservas **no se borran**; se cancelan.

`POST /reservations/expire-overdue` → `{ "data": { "expired": 2, "releasedVehicles": 2 } }`.

### 5.11 Ventas y pagos

| Método | Ruta | Permiso |
|---|---|---|
| `GET` | `/sales/summary` | `reports:read` |
| `GET` | `/sales` | `sales:read` |
| `GET` | `/sales/:id` | `sales:read` |
| `POST` | `/sales` | `sales:write` |
| `PATCH` | `/sales/:id` | `sales:write` |
| `POST` | `/sales/:id/complete` | `sales:write` |
| `POST` | `/sales/:id/cancel` | `sales:write` |
| `DELETE` | `/sales/:id` | `sales:delete` |
| `GET` | `/sales/:id/payments` | `payments:read` |
| `POST` | `/sales/:id/payments` | `payments:write` |

Filtros del listado: `search`, `clientId`, `vehicleId`, `salespersonId`, `status`, `dateFrom`, `dateTo`.
El de `summary` acepta `clientId`, `salespersonId`, `status`, `dateFrom`, `dateTo` (sin `search` ni
`vehicleId`).

```jsonc
// POST /sales — número automático (VEN-2026-000001)
{
  "reservationId": "…",   // o null
  "quotationId": "…",     // o null
  "clientId": "…", "vehicleId": "…", "currencyId": "…",
  "salePrice": 1800000,
  "exchangeRate": 1,
  "saleDate": "2026-03-05",
  "salespersonId": "…",
  "initialPayment": {     // opcional; sirve para registrar el depósito de la reserva
    "paymentMethodId": "…", "amount": 100000,
    "paymentDate": "2026-03-01", "referenceNumber": "Deposito reserva"
  }
}
```

La venta nace en estado `in_process`. En la misma transacción el vehículo pasa a `sold` y la reserva
y la cotización quedan `converted`.

```jsonc
// GET /sales/:id — incluye el estado de cuenta completo
{ "data": {
  "id": "…", "saleNumber": "VEN-2026-000001", "status": "in_process",
  "clientName": "Hidekel Reyes",
  "vehicleChassisNumber": "JT2…", "vehicleBrandName": "Toyota",
  "vehicleModelName": "Corolla Cross", "vehicleYear": 2024,
  "currencyCode": "DOP", "salePrice": 1800000, "exchangeRate": 1, "saleDate": "2026-03-05",
  "salespersonName": "Ana Vendedora",
  "reservationNumber": "RES-2026-000001", "quotationNumber": "COT-2026-000001",
  "payments": [{ "id": "…", "amount": 100000, "paymentDate": "2026-03-01",
                 "paymentMethodName": "Efectivo", "currencyCode": "DOP",
                 "referenceNumber": "Deposito reserva", "receivedByName": "Ana Vendedora", … }],
  "totalPaid": 100000,
  "pendingBalance": 1700000
} }
```

```jsonc
// POST /sales/:id/payments
{ "paymentMethodId": "…", "currencyId": "…", "amount": 1700000,
  "paymentDate": "2026-03-05", "referenceNumber": "Transferencia 4471" }

// 201
{ "data": { "payment": { … }, "totalPaid": 1800000, "pendingBalance": 0, "fullyPaid": true } }
```

Usa `fullyPaid` para habilitar el botón de completar la venta. **Registrar el último pago no cierra
la venta sola**: quedar saldada y entregar la unidad son dos momentos distintos del negocio.

`GET /sales/:id/payments` devuelve el estado de cuenta suelto:

```jsonc
{ "data": { "payments": [ … ], "salePrice": 1800000, "totalPaid": 1800000, "pendingBalance": 0 } }
```

`GET /sales/summary`:

```jsonc
{ "data": { "reportingCurrency": "DOP", "totalSales": 12,
            "totalAmount": 21500000, "totalCollected": 18300000, "pendingBalance": 3200000 } }
```

Los totales están consolidados en pesos con la tasa de cada venta, así que ventas en dólares y en
pesos son sumables entre sí.

### 5.12 Firma de subidas

| Método | Ruta | Permiso |
|---|---|---|
| `GET` | `/uploads/imagekit-auth` | `vehicles:write` |

El backend **sigue sin recibir archivos**: el navegador los sube directamente a ImageKit. Pero esa
subida directa exige tres parámetros que solo puede calcular el servidor, porque se derivan de la
clave **privada** de la cuenta, que nunca debe llegar al cliente.

```jsonc
// GET /uploads/imagekit-auth → 200
{ "data": {
  "token": "013041a2-a52f-4cd6-86f4-8eebc9071a48",  // identificador de la subida
  "expire": 1786561568,                              // epoch en segundos
  "signature": "6c5e1f45…",                          // HMAC-SHA1 de (token + expire)
  "publicKey": "public_xxx"                          // solo si está configurada
} }
```

Pide la firma **justo antes de cada subida**: es de un solo uso y caduca (40 minutos por defecto,
configurable con `IMAGEKIT_AUTH_EXPIRY_SECONDS`, máximo una hora). La respuesta viaja con
`Cache-Control: no-store`.

Exige `vehicles:write` porque hoy las subidas son fotos de unidades. Sin ese candado, cualquiera con
la URL podría pedir firmas ilimitadas y subir archivos a la cuenta de la empresa.

Si el servidor no tiene `IMAGEKIT_PRIVATE_KEY` en su entorno, la ruta responde `500 INTERNAL_ERROR`
con un mensaje explícito: es un fallo de despliegue, no del cliente. El frontend detecta esa
situación por configuración propia y cae a su modo "pegar URL".

### 5.12 Facturación electrónica (e-CF)

| Método | Ruta | Permiso |
|---|---|---|
| `GET` | `/invoices` | `invoices:read` |
| `GET` | `/invoices/:id` | `invoices:read` |
| `GET` | `/invoices/by-sale/:saleId` | `invoices:read` |
| `POST` | `/invoices` | `invoices:write` |
| `POST` | `/invoices/:id/issue` | `invoices:issue` |
| `POST` | `/invoices/:id/reject` | `invoices:issue` |
| `POST` | `/invoices/:id/retry` | `invoices:write` |
| `POST` | `/invoices/:id/cancel` | `invoices:write` |
| `POST` | `/invoices/:id/credit-notes` | `credit-notes:write` |
| `POST` | `/invoices/:id/credit-notes/:creditNoteId/issue` | `invoices:issue` |
| `POST` | `/invoices/:id/credit-notes/:creditNoteId/reject` | `invoices:issue` |

**No hay `DELETE` en todo el módulo**: un comprobante fiscal no se borra. Su ciclo de vida se
gobierna con `status`.

El backend **no habla con la DGII**. La firma digital y el envío los resuelve un PSFE homologado;
estos endpoints registran el *resultado* de ese proceso. `POST /:id/issue` significa «la DGII aceptó
este comprobante y devolvió este NCF».

Filtros del listado: `search` (NCF, número de venta, cliente, documento), `status`, `ncfType`,
`clientId`, `saleId`, `dateFrom`, `dateTo` (sobre `issuedAt`).

```jsonc
// POST /invoices — nace pendiente y SIN NCF
{ "saleId": "…", "ncfType": "E31" }   // E31 | E32 | E44 | E45 (E34 es solo para notas)
```

```jsonc
// POST /invoices/:id/issue — registra la aceptación de la DGII
{ "ncfNumber": "E310000000001", "dgiiTrackId": "TRK-001", "xmlUrl": "https://…/cf.xml" }

// POST /invoices/:id/reject
{ "reason": "Falta el RNC del receptor" }
```

```jsonc
// GET /invoices/:id
{ "data": {
  "id": "…", "saleId": "…", "ncfType": "E31", "ncfNumber": "E310000000001",
  "status": "issued", "issuedAt": "2026-03-05T14:00:00.000Z",
  "dgiiTrackId": "TRK-001", "xmlUrl": null, "rejectionReason": null,
  "saleNumber": "VEN-2026-000001", "salePrice": 1800000, "currencyCode": "DOP",
  "saleDate": "2026-03-05", "saleStatus": "completed",
  "clientName": "Hidekel Reyes", "clientDocumentNumber": "402-1234567-8",
  "vehicleChassisNumber": "JT2CC24A1R0100001", "createdByName": "Administrador General",
  "creditNotes": [ … ],
  "creditedAmount": 300000,
  "netAmount": 1500000
} }
```

`creditedAmount` suma **solo las notas emitidas**; `netAmount` es lo que sigue vigente de la venta.

```jsonc
// POST /invoices/:id/credit-notes
{ "reason": "Devolucion parcial del vehiculo", "amount": 300000 }

// POST /invoices/:id/credit-notes/:creditNoteId/issue
{ "ncfNumber": "E340000000001", "dgiiTrackId": null, "xmlUrl": null }
```

Ambos endpoints de notas devuelven **la factura completa actualizada**, no la nota: es lo que la
pantalla necesita repintar.

#### Formato del NCF

`E` + tipo (2 dígitos) + secuencia (10 dígitos) → `E310000000001`. El backend lo normaliza a
mayúsculas y valida tres cosas: el formato, que el tipo coincida con el declarado en la factura
(una nota de crédito siempre es `E34`), y que no esté repetido **ni en facturas ni en notas** — la
DGII usa un solo espacio de numeración.

---

### 5.13 Reportes

**Todos son `GET`**: por debajo son vistas SQL de solo lectura, no hay nada que escribir.

| Método | Ruta | Permiso | Devuelve |
|---|---|---|---|
| `GET` | `/reports/vehicle-profitability` | `reports:read` + `expenses:read` | paginado |
| `GET` | `/reports/accounts-receivable` | `reports:read` + `sales:read` | paginado |
| `GET` | `/reports/sales-monthly` | `reports:read` | arreglo |
| `GET` | `/reports/sales-by-salesperson` | `reports:read` | arreglo |
| `GET` | `/reports/expenses-monthly` | `reports:read` | arreglo |
| `GET` | `/reports/inventory-status` | `reports:read` | arreglo |
| `GET` | `/reports/fiscal-documents` | `reports:read` | arreglo |

Los agregados piden solo `reports:read`, que tienen los cuatro roles. Los **dos de detalle** exigen
además el permiso de lectura del módulo del que sacan la información, para que un reporte no sea una
puerta lateral a datos que el rol no ve por su propio módulo: en la práctica, `ventas` **no** puede
abrir rentabilidad (expone el costo y el margen unidad por unidad) e `inventario` **no** puede abrir
cuentas por cobrar (expone cliente, teléfono y saldo). Ambos devuelven **403** con el detalle de qué
permiso falta, así que el menú debe ocultar la opción según el rol.

Los dos primeros crecen con la operación (una fila por vehículo / por venta), así que se paginan
igual que cualquier listado y traen `meta`. Los agregados devuelven el arreglo completo: su tamaño
lo acota el rango de fechas, no el volumen de datos.

#### Monedas

Cada importe viaja **dos veces**: en la moneda del documento (`currencyCode`) y convertido a pesos
con la tasa registrada en ese documento, con el sufijo `Converted`. **Solo se pueden sumar entre sí
los `Converted`**; sumar `totalAmount` de una fila en USD con otra en DOP no significa nada. Es el
mismo criterio de costo histórico que usa el resto del sistema (ver §7).

#### Rangos de fecha

`dateFrom` / `dateTo` son `YYYY-MM-DD` inclusivos. En los reportes **mensuales** el backend lleva
cada extremo al mes al que pertenece: `dateFrom=2026-03-15` incluye marzo completo. Un mes parcial
no existe en estos reportes, así que la UI puede mandar la fecha que tenga a mano sin normalizarla.

#### `GET /reports/vehicle-profitability`

Costo real contra precio de venta, unidad por unidad. Filtros: `search` (chasis, marca o modelo),
`status`, `vehicleId`, `sold` (`true` solo vendidos, `false` solo en stock), `dateFrom`, `dateTo`
(sobre la fecha de venta), más `page` / `pageSize`.

```jsonc
{ "data": [{
  "vehicleId": "…", "chassisNumber": "JT2CC24A1R0100001",
  "brandName": "Toyota", "modelName": "Corolla Cross", "year": 2023,
  "status": "sold", "isActive": true,
  "listPrice": 1800000,
  "purchaseCurrencyCode": "USD", "purchaseExchangeRate": 61.5,
  "importSubtotal": 12247,             // compra + flete + seguro + otros, en USD
  "importSubtotalConverted": 753225,   // …lo mismo en DOP
  "expensesTotalConverted": 185500,    // gastos imputados a la unidad
  "totalCostConverted": 938725,        // costo real
  "saleId": "…", "saleNumber": "VEN-2026-000001", "saleStatus": "completed",
  "saleDate": "2026-07-10", "saleCurrencyCode": "DOP",
  "soldPrice": 1800000, "soldPriceConverted": 1800000,
  "margin": 861275, "marginPercentage": 91.75
}], "meta": { … } }
```

Un vehículo sin vender aparece igual, con todo lo de la venta en `null` (incluidos `margin` y
`marginPercentage`). `marginPercentage` también es `null` cuando el costo es cero: no está definido.
Una venta **cancelada** no cuenta: la unidad vuelve a figurar como no vendida.

#### `GET /reports/accounts-receivable`

Saldo pendiente por venta. Filtros: `search` (número de venta, cliente o chasis), `clientId`,
`salespersonId`, `onlyPending`, `minDaysOutstanding`, `dateFrom`, `dateTo`, `page`, `pageSize`.

**Por defecto solo devuelve ventas con saldo.** Para ver también las saldadas hay que pedir
`?onlyPending=false`. Las canceladas nunca aparecen: no generan derecho de cobro.

```jsonc
{ "data": [{
  "saleId": "…", "saleNumber": "VEN-2026-000002", "saleDate": "2026-08-06",
  "saleStatus": "in_process",
  "clientId": "…", "clientName": "Transporte del Cibao SRL", "clientPhone": "809-555-1004",
  "vehicleId": "…", "chassisNumber": "JT2RV23B2S0100002",
  "salespersonId": "…", "salespersonName": "Administrador General",
  "currencyCode": "DOP", "exchangeRate": 1,
  "salePrice": 2100000, "totalPaid": 700000,
  "pendingBalance": 1400000, "pendingBalanceConverted": 1400000,
  "daysOutstanding": 8
}], "meta": { … } }
```

`daysOutstanding` son los días transcurridos desde la fecha de la venta — útil para pintar la
antigüedad de la deuda.

#### `GET /reports/sales-monthly` y `GET /reports/sales-by-salesperson`

Ventas **completadas** por mes y moneda; el segundo abre además por vendedor y sirve de ranking
(dentro de cada mes viene ordenado de mayor a menor). Una venta en proceso todavía puede caerse, así
que no cuenta como ingreso del período. Filtros: `dateFrom`, `dateTo`, `currency` (código ISO), y
`salespersonId` en el segundo.

```jsonc
// GET /reports/sales-monthly
{ "data": [
  { "month": "2026-07-01", "currencyCode": "DOP", "salesCount": 2,
    "totalAmount": 3900000, "totalAmountConverted": 3900000 }
] }

// GET /reports/sales-by-salesperson — mismas columnas + vendedor
{ "data": [
  { "month": "2026-07-01", "salespersonId": "…", "salespersonName": "Administrador General",
    "currencyCode": "DOP", "salesCount": 1, "totalAmount": 1800000, "totalAmountConverted": 1800000 }
] }
```

`month` es siempre el **día 1 del mes** (`YYYY-MM-01`), no un rango: es una fecha para que ordene y
se compare como tal.

#### `GET /reports/expenses-monthly`

Gastos por mes, categoría, alcance y moneda. Filtros: `dateFrom`, `dateTo`, `currency`,
`categoryId`, `scope` (`general` | `vehicle`).

```jsonc
{ "data": [
  { "month": "2026-06-01", "categoryId": "…", "categoryName": "Transporte interno",
    "scope": "vehicle", "currencyCode": "USD", "expenseCount": 1,
    "totalAmount": 300, "totalAmountConverted": 18300 }
] }
```

`scope` es el del **gasto**, no el de su categoría: `vehicle` si quedó imputado a una unidad
concreta, `general` si fue de la operación.

#### `GET /reports/inventory-status`

Conteo de vehículos activos por estado. Sin filtros y sin paginación.

```jsonc
{ "data": [
  { "status": "in_transit", "vehicleCount": 2 },
  { "status": "in_inventory", "vehicleCount": 3 },
  { "status": "reserved", "vehicleCount": 1 },
  { "status": "sold", "vehicleCount": 4 },
  { "status": "in_repair", "vehicleCount": 1 },
  { "status": "unavailable", "vehicleCount": 1 }
] }
```

Devuelve **siempre los seis estados**, incluidos los que están en cero: el tablero no cambia de
forma según el día.

#### `GET /reports/fiscal-documents`

Comprobantes fiscales por mes, tipo y estado — el control de qué se emitió y qué quedó pendiente o
rechazado ante la DGII. Filtros: `dateFrom`, `dateTo`, `currency`, `documentKind`
(`invoice` | `credit_note`), `ncfType`, `status`.

```jsonc
{ "data": [
  { "month": "2026-08-01", "documentKind": "invoice", "ncfType": "E31", "status": "issued",
    "currencyCode": "DOP", "documentCount": 2,
    "totalAmount": 3900000, "totalAmountConverted": 3900000 },
  { "month": "2026-08-01", "documentKind": "credit_note", "ncfType": "E34", "status": "issued",
    "currencyCode": "DOP", "documentCount": 1,
    "totalAmount": 100000, "totalAmountConverted": 100000 }
] }
```

Facturas y notas de crédito conviven en el mismo reporte porque ante la DGII las dos son e-CF; se
distinguen por `documentKind`. La nota de crédito siempre es `E34`. El mes es el de **emisión**, y
mientras el comprobante siga sin emitirse (pendiente o rechazado) se usa el de registro, que es
cuando interesa saber qué quedó sin resolver en el período. El importe de una factura es el de su
venta; el de una nota de crédito, el suyo propio.

---

## 6. Estados y transiciones

La interfaz debe ofrecer **solo** las acciones que el backend acepta. Estas son las máquinas.

### Vehículo (`status`)

| Valor | Etiqueta sugerida |
|---|---|
| `in_transit` | En tránsito |
| `in_inventory` | En inventario |
| `reserved` | Reservado |
| `sold` | Vendido |
| `in_repair` | En taller |
| `unavailable` | No disponible |

```
                     ┌──────────── unavailable ◄────────┐
                     │              ▲   │               │
                     ▼              │   ▼               │
   in_transit ──► in_inventory ◄──────► in_repair       │
                     │    ▲                             │
                     │    │ (reserva cancelada/vencida) │
                     ▼    │                             │
                  reserved ┴──────────────────────────────
                     │
                     ▼
                   sold ──(solo al cancelar la venta)──► in_inventory
```

**`reserved` y `sold` no se asignan a mano.** El endpoint de cambio de estado los rechaza como
origen y como destino. Se derivan de crear o cancelar una reserva o una venta. En el selector de
estado ofrece únicamente: `in_transit`, `in_inventory`, `in_repair`, `unavailable`, y filtra además
por las transiciones válidas desde el estado actual.

Cuando una transición no es válida, el 422 trae en `details` las permitidas:

```jsonc
{ "error": { "code": "BUSINESS_RULE_VIOLATION",
             "message": "No se puede pasar un vehiculo de \"in_repair\" a \"in_transit\"…",
             "details": { "from": "in_repair", "to": "in_transit",
                          "allowed": ["in_inventory", "unavailable"] } } }
```

### Compra (`status`)

```
pending ──► in_transit ──► received   (final)
   │            │
   └────────────┴────────► cancelled  (final)
```

### Cotización (`status`)

```
pending ──► approved ──► converted  (final, lo pone el sistema)
   │  \        │  \
   │   \       │   └──► expired     (final)
   │    └──────┴──────► rejected    (final)
   └───────────────────► expired
```

Asignables a mano: `approved`, `rejected`, `expired`.

### Reserva (`status`)

```
active ──► converted  (final, al concretarse la venta)
   │  \
   │   └─► cancelled  (final, el cliente desiste)
   └─────► expired    (final, venció el plazo)
```

### Documento fiscal (`status` de `invoices` y `credit_notes`)

```
   pending ──► issued ──► cancelled   (anulado por nota de crédito total)
      │  ▲        │
      ▼  │        ▼
   rejected ──► cancelled
```

- `pending` — creado en el sistema, aún no aceptado por la DGII. Sin NCF.
- `issued` — la DGII lo aceptó. **Inmutable**: ya tiene NCF y fecha de emisión.
- `rejected` — la DGII lo rechazó; `rejectionReason` dice por qué. Se corrige y se reintenta
  (`/retry`, que lo devuelve a `pending`).
- `cancelled` — anulado. Terminal.

`/cancel` solo sirve para descartar un comprobante que **aún no** fue aceptado. Una factura `issued`
únicamente llega a `cancelled` cuando las notas de crédito cubren su importe completo, y eso lo hace
el sistema solo al emitir la última nota.

### Venta (`status`)

```
in_process ──► completed ──► cancelled
     │                          ▲
     └──────────────────────────┘
```

`completed` exige que la venta esté totalmente pagada. `cancelled` devuelve el vehículo a inventario.

---

## 7. Reglas de negocio que la UI debe anticipar

Validarlas en el cliente evita viajes al servidor; el backend las verifica igual.

### Cliente: identidad según el tipo

- `clientType: "individual"` → **`firstName` y `lastName` obligatorios**.
- `clientType: "company"` → **`companyName` obligatorio**.

Si no se cumple: `422 BUSINESS_RULE_VIOLATION`. Cambia los campos del formulario al alternar el tipo.

### Gasto: la categoría manda

Cada categoría tiene un `scope`:

- `scope: "vehicle"` → **exige** `vehicleId`.
- `scope: "general"` → **prohíbe** `vehicleId` (debe ir en `null`).

Al elegir la categoría, muestra u oculta el selector de vehículo. Sin esta regla, el costo real por
unidad se contaminaría con gastos de la empresa.

### Tasa de cambio coherente

Un documento **en pesos** debe llevar `exchangeRate: 1`. Cualquier otro valor da 422. Aplica a
compras, ventas y gastos. Lo natural en la UI: si la moneda elegida es DOP, fija la tasa en 1 y
deshabilita el campo.

### El pago va en la moneda de la venta

`POST /sales/:id/payments` exige que `currencyId` coincida con el de la venta. Fija ese campo al
valor de la venta en lugar de dejarlo elegir. Si el cliente paga en otra divisa, la conversión la
hace la caja al recibir.

### Disponibilidad del vehículo

| Acción | Estados admitidos |
|---|---|
| Cotizar | cualquiera **menos** `sold` |
| Reservar | solo `in_inventory` |
| Vender | `in_inventory` o `reserved` |

Se puede cotizar una unidad en tránsito: la empresa vende antes de que llegue al país.

Filtra los selectores de vehículo por estado según la operación (`?status=in_inventory`).

### Un vehículo, una venta vigente

Un vehículo no puede tener dos ventas vigentes a la vez (`409 CONFLICT`). Si la venta anterior se
**cancela**, el vehículo vuelve a estar disponible y se puede vender de nuevo **sin borrar nada**:
ambas ventas conviven en el historial.

Lo mismo con las compras: un vehículo pertenece a una sola compra (`409 CONFLICT`).

### Facturación: qué bloquea qué

- Una venta **cancelada** no se factura.
- Una venta tiene **un solo comprobante** (409 si se intenta un segundo).
- Una factura solo admite notas de crédito si está `issued`: una pendiente todavía no existe para la
  DGII, y una anulada ya no tiene importe que corregir.
- La suma de las notas **no puede superar** el importe de la venta. Las notas *pendientes* también
  consumen disponible, para que no se preparen dos que juntas se pasen.
- **Una venta facturada no se puede cancelar.** Primero hay que anular el comprobante emitiendo
  notas de crédito que cubran su importe; entonces la factura pasa a `cancelled` y la venta ya se
  puede cancelar. En la interfaz conviene guiar ese orden: el error explica el paso que falta.

### Cobros y cierre

- Un abono no puede superar el saldo pendiente → 422.
- Una venta solo se completa si `pendingBalance` es 0 → 422 si no.
- Una venta `cancelled` no admite pagos.
- El precio de venta no puede bajarse por debajo de lo ya cobrado.

### Qué se puede editar y qué no

| Entidad | Editable mientras… |
|---|---|
| Compra | esté en `pending` o `in_transit` |
| Cotización | esté en `pending` o `approved` |
| Reserva | esté `active` |
| Venta | esté `in_process` |

### Borrados

Todos son **lógicos** salvo lo indicado; el registro desaparece de los listados pero conserva su
historia.

| Entidad | Se bloquea el borrado si… |
|---|---|
| Cliente | tiene cotizaciones, reservas o ventas → desactívalo en su lugar |
| Vehículo | está `sold` o `reserved` |
| Proveedor | tiene compras registradas |
| Compra | ya está `received` |
| Cotización | ya está `converted` |
| Venta | no está `cancelled` |
| Usuario | es el propio usuario autenticado |

Marcas y modelos no tienen borrado: solo `isActive: false`.

### Números de documento

`purchaseNumber`, `quotationNumber`, `reservationNumber` y `saleNumber` **los genera el backend** con
el formato `PREFIJO-AÑO-NNNNNN` (`COM-`, `COT-`, `RES-`, `VEN-`), reiniciando la secuencia cada año.
No los pidas en el formulario. La única excepción es `purchaseNumber`, que puedes enviar si la
empresa maneja su propia numeración.

---

## 8. Estructura del backend

Solo lo necesario para orientarte cuando algo no esté claro en este documento.

```
src/
├── domain/          Reglas de negocio puras: entidades, máquinas de estado, errores
├── application/     Casos de uso (un archivo por operación)
├── infrastructure/  PostgreSQL (Kysely), bcrypt, JWT, logs
├── presentation/    HTTP: controladores, rutas y esquemas Zod
└── main/            Arranque y cableado de dependencias
```

Dónde mirar según la duda:

| Necesitas saber… | Archivo |
|---|---|
| Qué campos acepta exactamente un endpoint | `src/presentation/http/<módulo>/<módulo>.schemas.ts` |
| Qué rutas y permisos existen | `src/presentation/http/<módulo>/<módulo>.routes.ts` |
| Qué devuelve un endpoint | `src/domain/<módulo>/<entidad>.entity.ts` (interfaces `…WithDetails`) |
| Por qué el backend rechazó algo | `src/domain/<módulo>/<entidad>.errors.ts` |
| Transiciones de estado válidas | `src/domain/<módulo>/<entidad>.entity.ts` (constantes `…_TRANSITIONS`) |
| El mapa completo de permisos | `src/domain/users/permissions.ts` |
| Reglas de conversión de moneda | `src/domain/shared/money.ts` |
| Cómo se calcula un reporte | `src/infrastructure/database/migrations/007_report_views.ts` (son vistas SQL) |

Los esquemas Zod son la **fuente de verdad** de lo que acepta cada endpoint: si este documento y un
schema discrepan, gana el schema.

### CORS

Configurado por la variable `CORS_ORIGINS` del backend (por defecto `*` en desarrollo). En producción
hay que listar el origen del frontend explícitamente, separado por comas.

### Notas para desarrollo

- El backend **no sirve archivos estáticos ni recibe subidas**: las imágenes se guardan como URL. Lo
  único que aporta al proceso es la firma de [§5.12](#512-firma-de-subidas), que es un cálculo sobre
  una clave de configuración; el archivo nunca pasa por aquí.
- El log del servidor imprime una línea por petición con método, ruta, código y tiempo, incluyendo el
  código de error de negocio. Útil para depurar el cliente contra la consola del backend.
- Con `LOG_LEVEL=debug` se ve además cada consulta SQL.
