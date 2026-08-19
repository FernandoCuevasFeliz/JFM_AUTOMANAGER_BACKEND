# JFM AutoManager — Guía de la demostración

Usuarios, contraseñas y qué puede hacer cada rol. Pensado para recorrer el sistema y comprobar que
los permisos se comportan como deben.

> **Credenciales de demostración.** Son públicas por diseño: sirven para probar. Antes de que el
> sistema maneje datos reales de EJGH AUTO IMPORT, cambia todas las contraseñas y borra los usuarios
> que no correspondan a personas reales.

**API desplegada:** `https://jfm-automanager-backend.onrender.com/api/v1`

> El plan gratuito de Render duerme el servicio por inactividad: la primera petición tras un rato
> puede tardar ~50 segundos. Las siguientes son inmediatas.

---

## 1. Usuarios

| Rol | Correo | Contraseña |
|---|---|---|
| **admin** | `admin@ejghautoimport.com` | `Admin123*` |
| **ventas** | `ventas@ejghautoimport.com` | `Ventas2026` |
| **inventario** | `inventario@ejghautoimport.com` | `Inventario2026` |
| **contabilidad** | `contabilidad@ejghautoimport.com` | `Contabilidad2026` |

Las cuatro fueron verificadas contra el despliegue: las cuatro devuelven `200` en
`POST /auth/login`.

```bash
curl -X POST https://jfm-automanager-backend.onrender.com/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"ventas@ejghautoimport.com","password":"Ventas2026"}'
```

La respuesta trae `accessToken` (para las peticiones), `refreshToken` (para renovar sin volver a
escribir la contraseña) y **`permissions`**, el array que la interfaz debe usar para decidir qué
mostrar.

---

## 2. Qué puede hacer cada rol

Leyenda: ✅ puede · ❌ recibe `403 FORBIDDEN`

| Acción | admin | ventas | inventario | contabilidad |
|---|:--:|:--:|:--:|:--:|
| **Usuarios** |
| Ver y administrar usuarios | ✅ | ❌ | ❌ | ❌ |
| **Catálogos** |
| Ver monedas, tipos de documento, métodos de pago | ✅ | ✅ | ✅ | ✅ |
| Crear marcas, modelos y categorías de gasto | ✅ | ❌ | ✅ | ❌ |
| **Inventario** |
| Ver vehículos | ✅ | ✅ | ✅ | ✅ |
| Crear y editar vehículos | ✅ | ❌ | ✅ | ❌ |
| Cambiar el estado de un vehículo | ✅ | ❌ | ✅ | ❌ |
| Eliminar vehículos | ✅ | ❌ | ✅ | ❌ |
| **Clientes** |
| Ver clientes | ✅ | ✅ | ✅ | ✅ |
| Crear y editar clientes | ✅ | ✅ | ❌ | ❌ |
| Eliminar clientes | ✅ | ❌ | ❌ | ❌ |
| **Proveedores y compras** |
| Ver proveedores y compras | ✅ | ❌ | ✅ | ✅ |
| Registrar compras y recibir mercancía | ✅ | ❌ | ✅ | ❌ |
| **Gastos** |
| Ver gastos | ✅ | ❌ | ✅ | ✅ |
| Registrar y editar gastos | ✅ | ❌ | ❌ | ✅ |
| **Ciclo comercial** |
| Ver cotizaciones, reservas y ventas | ✅ | ✅ | ❌ | ✅ |
| Crear cotizaciones y reservas | ✅ | ✅ | ❌ | ❌ |
| Registrar ventas y cobros | ✅ | ✅ | ❌ | ❌ |
| Añadir o quitar vehículos de una venta | ✅ | ✅ | ❌ | ❌ |
| Devolver un vehículo vendido | ✅ | ✅ | ❌ | ❌ |
| Registrar cobros | ✅ | ✅ | ❌ | ✅ |
| Registrar reembolsos | ✅ | ✅ | ❌ | ✅ |
| Eliminar ventas | ✅ | ❌ | ❌ | ❌ |
| **Facturación (e-CF)** |
| Ver comprobantes | ✅ | ✅ | ❌ | ✅ |
| Crear y anular comprobantes | ✅ | ❌ | ❌ | ✅ |
| Registrar emisión/rechazo de la DGII | ✅ | ❌ | ❌ | ✅ |
| Emitir notas de crédito | ✅ | ❌ | ❌ | ✅ |
| **Reportes** |
| Resúmenes mensuales (ventas, vendedores, devoluciones, gastos, inventario, comprobantes) | ✅ | ✅ | ✅ | ✅ |
| Rentabilidad por vehículo (costo real y margen) | ✅ | ❌ | ✅ | ✅ |
| Cuentas por cobrar (saldo por venta) | ✅ | ✅ | ❌ | ✅ |

La fuente de verdad es `src/domain/users/permissions.ts`. Un rol que no aparezca ahí **no tiene
ningún permiso**: crear un rol nuevo en la tabla no otorga acceso hasta declararlo en el código.

---

## 3. Pruebas rápidas de permisos

Cada bloque debe dar el código indicado. Si alguno no coincide, hay un fallo de RBAC.

```bash
API=https://jfm-automanager-backend.onrender.com/api/v1
login() { curl -s -X POST $API/auth/login -H 'content-type: application/json' \
  -d "{\"email\":\"$1@ejghautoimport.com\",\"password\":\"$2\"}" | jq -r .data.accessToken; }

VENTAS=$(login ventas Ventas2026)
INVENTARIO=$(login inventario Inventario2026)
CONTA=$(login contabilidad Contabilidad2026)
```

```bash
# ventas SÍ lee inventario, NO lo modifica
curl -s -o /dev/null -w '%{http_code}\n' $API/vehicles -H "authorization: Bearer $VENTAS"   # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/vehicles -H "authorization: Bearer $VENTAS" \
  -H 'content-type: application/json' -d '{}'                                                # 403
```

```bash
# inventario NO ve el ciclo comercial ni administra usuarios
curl -s -o /dev/null -w '%{http_code}\n' $API/sales -H "authorization: Bearer $INVENTARIO"   # 403
curl -s -o /dev/null -w '%{http_code}\n' $API/users -H "authorization: Bearer $INVENTARIO"   # 403
```

```bash
# contabilidad registra gastos; ventas no
curl -s -o /dev/null -w '%{http_code}\n' $API/expenses -H "authorization: Bearer $CONTA"     # 200
curl -s -o /dev/null -w '%{http_code}\n' $API/expenses -H "authorization: Bearer $VENTAS"    # 403
```

```bash
# devolver un vehículo mueve inventario e importe: es sales:write, no payments:write.
# contabilidad emite la nota de crédito; ventas ejecuta la devolución.
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/sales/$SALE/items/$ITEM/return \
  -H "authorization: Bearer $CONTA" -H 'content-type: application/json' \
  -d '{"reason":"prueba"}'                                                                        # 403
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/sales/$SALE/refunds \
  -H "authorization: Bearer $INVENTARIO" -H 'content-type: application/json' -d '{}'              # 403
```

```bash
# los resúmenes son para todos, el detalle sensible no:
# ventas no ve márgenes, inventario no ve saldos de clientes
curl -s -o /dev/null -w '%{http_code}\n' $API/reports/sales-monthly -H "authorization: Bearer $INVENTARIO"          # 200
curl -s -o /dev/null -w '%{http_code}\n' $API/reports/vehicle-profitability -H "authorization: Bearer $VENTAS"      # 403
curl -s -o /dev/null -w '%{http_code}\n' $API/reports/accounts-receivable -H "authorization: Bearer $INVENTARIO"    # 403
curl -s -o /dev/null -w '%{http_code}\n' $API/reports/accounts-receivable -H "authorization: Bearer $CONTA"         # 200
curl -s -o /dev/null -w '%{http_code}\n' $API/reports/returns-monthly -H "authorization: Bearer $VENTAS"            # 200
```

---

## 4. Datos cargados

Lo que deja `scripts/seed-demo.mjs` sobre una base recién migrada, verificado ejecutándolo:

| Recurso | Cantidad |
|---|---|
| Vehículos | 12 |
| Clientes | 6 |
| Proveedores | 3 |
| Compras | 3 |
| Gastos | 12 |
| Cotizaciones | 5 |
| Reservas | 1 |
| Ventas | 5 |

> El despliegue de Render sigue corriendo un commit anterior y todavía muestra las cifras viejas
> (14 vehículos, 4 ventas, sin flotilla ni devoluciones). Las de esta tabla son las que tendrá en
> cuanto se vuelva a desplegar y sembrar.

**Inventario por estado** — hay al menos un vehículo en cada uno, para poder ver todas las
transiciones:

| Estado | Unidades |
|---|---|
| `in_transit` (en tránsito) | 2 |
| `in_inventory` (disponible) | 1 |
| `reserved` (apartado) | 1 |
| `sold` (vendido) | 6 |
| `in_repair` (en taller) | 1 |
| `unavailable` (no disponible) | 1 |

**Ventas:** 5 · facturado 11 430 000 DOP · cobrado 5 500 000.

Hay ventas en varios estados (completada, en proceso con saldo, cancelada) para ejercitar los
cobros, el cierre y la reventa tras cancelación. Una de ellas es una **venta de flotilla**: tres
vehículos en un solo documento, con uno devuelto y su reembolso registrado. Sirve para ver de un
vistazo lo que el modelo de un vehículo por venta no podía representar.

---

## 5. Recorrido sugerido

1. **Entra como `inventario`.** Mira `GET /vehicles/summary` (el tablero) y prueba
   `PATCH /vehicles/:id/status`. Verás que solo acepta `in_transit`, `in_inventory`, `in_repair` y
   `unavailable`: `reserved` y `sold` los produce el ciclo comercial, no un cambio manual.
2. **Cambia a `ventas`.** Crea una cotización sobre un vehículo `in_inventory`, apruébala,
   conviértela en reserva (el vehículo pasa a `reserved` solo) y luego en venta (pasa a `sold`).
   Registra un cobro parcial y comprueba que `POST /sales/:id/complete` da `422` hasta saldarla.
3. **Sigue como `ventas` y abre la venta de flotilla** (la de tres vehículos). Añade una unidad más
   con `POST /sales/:id/items`, corrige su precio con `PATCH /sales/:id/items/:itemId` y devuelve una
   con `POST /sales/:id/items/:itemId/return`: el total de la venta baja solo, el vehículo vuelve a
   inventario y el resto de la venta no se toca. Registra el reembolso con `POST /sales/:id/refunds`
   y mira cómo el saldo pendiente vuelve a subir.
4. **Cambia a `contabilidad`.** Registra un gasto sobre un vehículo vendido y consulta
   `GET /expenses/vehicle-cost/:vehicleId`: verás el costo real consolidado en pesos y el margen.
5. **Vuelve a `admin`** para lo que los demás no pueden: administrar usuarios y eliminar registros.

---

## 6. Facturación electrónica

> **Todavía no está en el despliegue.** El módulo está terminado y probado en el repositorio, y las
> tablas ya existen en la base (migración `006_invoices` aplicada), pero el servicio de Render sigue
> corriendo el commit anterior: `GET /invoices` devuelve `404`.
>
> Para activarlo: confirma y sube los cambios, y lanza un despliegue en Render (el servicio tiene
> `autoDeploy` desactivado, así que no se actualiza solo).

Cuando esté desplegado, el recorrido es:

1. Como `contabilidad`, `POST /invoices` con la venta y el tipo de NCF → nace `pending`, **sin
   número**.
2. `POST /invoices/:id/issue` con el NCF que devolvió la DGII → pasa a `issued` y queda inmutable.
3. Si la DGII lo rechaza: `POST /invoices/:id/reject` con el motivo, corrige, y `POST /:id/retry`.
4. Para corregir o anular una factura emitida: `POST /invoices/:id/credit-notes` y luego
   `.../issue`. Cuando las notas cubren el importe completo, **la factura se anula sola**.
5. Comprueba las dos reglas que unen venta y comprobante:
   - `POST /sales/:id/cancel` sobre una venta facturada devuelve `422`: primero hay que anular el
     comprobante con notas de crédito que cubran su importe;
   - devolver un vehículo de una venta facturada también devuelve `422` hasta que exista una nota de
     crédito **por el importe de esa línea** (`POST /invoices/:id/credit-notes` con `saleItemId`).
     El importe de la factura no baja al devolver: lo que baja es su `netAmount`.

El script `scripts/seed-demo.mjs` ya incluye cuatro comprobantes de ejemplo (uno emitido, uno con
nota de crédito parcial, uno rechazado y uno pendiente); los creará en cuanto el módulo esté
desplegado.

---

## 7. Volver a sembrar

```bash
API_URL=https://jfm-automanager-backend.onrender.com \
ADMIN_EMAIL=admin@ejghautoimport.com ADMIN_PASSWORD='Admin123*' \
node scripts/seed-demo.mjs
```

El script se detiene si detecta que los datos ya existen. `--force` los crea igualmente, pero **no
es idempotente**: generaría duplicados. Para empezar de cero, vacía la base y vuelve a correr
`migrate` + `seed` + `seed-demo`.
