# Diccionario de datos

## 1. Alcance

Este documento describe el esquema PostgreSQL de **JFM AutoManager** utilizado por los modulos de seguridad, catalogos, clientes, proveedores, inventario, compras, gastos, cotizaciones, reservas, ventas, pagos y reportes.

Se excluyen deliberadamente:

- Las tablas internas de control de migraciones.
- Las tablas y vistas del modulo de facturacion electronica.

### Leyenda

| Marca | Significado |
|---|---|
| PK | Clave primaria |
| FK | Clave foranea |
| UQ | Valor o combinacion unica |
| NN | No permite `NULL` |
| BL | Borrado logico mediante `deleted_at` |

Todos los identificadores principales son `UUID` generados con `gen_random_uuid()`. Las columnas `created_at` y `updated_at` usan `TIMESTAMPTZ` y toman `now()` por defecto. Las tablas con `updated_at` poseen un trigger que actualiza este campo al modificar el registro.

## 2. Tipos enumerados

| Tipo | Valores | Uso |
|---|---|---|
| `client_type_enum` | `individual`, `company` | Tipo de cliente |
| `vehicle_status_enum` | `in_transit`, `in_inventory`, `reserved`, `sold`, `in_repair`, `unavailable` | Estado de una unidad |
| `purchase_status_enum` | `pending`, `in_transit`, `received`, `cancelled` | Estado de compra/importacion |
| `expense_scope_enum` | `general`, `vehicle` | Alcance de una categoria de gasto |
| `quotation_status_enum` | `pending`, `approved`, `rejected`, `expired`, `converted` | Estado de cotizacion |
| `reservation_status_enum` | `active`, `expired`, `converted`, `cancelled` | Estado de reserva |
| `sale_status_enum` | `in_process`, `completed`, `cancelled` | Estado de venta |
| `sale_item_status_enum` | `active`, `returned` | Estado de una unidad vendida |
| `audit_action_enum` | `insert`, `update`, `delete` | Accion auditada |

## 3. Catalogos y seguridad

### `roles`

Define los roles asignables a los usuarios.

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador del rol |
| `name` | `VARCHAR(50)` | NN, UQ | Nombre tecnico del rol |
| `description` | `VARCHAR(255)` | Opcional | Descripcion funcional |
| `is_active` | `BOOLEAN` | NN, defecto `TRUE` | Disponibilidad del rol |
| `created_at` | `TIMESTAMPTZ` | NN | Fecha de creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Ultima modificacion |

### `role_permissions`

Relacion muchos-a-muchos entre roles y capacidades del sistema.

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `role_id` | `UUID` | PK compuesta, FK -> `roles.id`, `CASCADE` | Rol autorizado |
| `permission` | `VARCHAR(80)` | PK compuesta | Permiso con formato `recurso:accion` |
| `created_at` | `TIMESTAMPTZ` | NN | Fecha de asignacion |

### `users`

Usuarios autenticables del sistema. Implementa BL.

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador del usuario |
| `role_id` | `UUID` | NN, FK -> `roles.id`, `RESTRICT` | Rol vigente |
| `first_name` | `VARCHAR(100)` | NN | Nombres |
| `last_name` | `VARCHAR(100)` | NN | Apellidos |
| `email` | `VARCHAR(150)` | NN, UQ | Correo de inicio de sesion |
| `password_hash` | `VARCHAR(255)` | NN | Hash de la contrasena |
| `phone` | `VARCHAR(30)` | Opcional | Telefono |
| `is_active` | `BOOLEAN` | NN, defecto `TRUE` | Habilita el acceso |
| `last_login_at` | `TIMESTAMPTZ` | Opcional | Ultimo acceso correcto |
| `created_at` | `TIMESTAMPTZ` | NN | Fecha de creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Ultima modificacion |
| `deleted_at` | `TIMESTAMPTZ` | Opcional, BL | Fecha de eliminacion logica |

Indice: `role_id`.

### `refresh_tokens`

Sesiones renovables de usuario. El token real nunca se almacena.

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador de sesion |
| `user_id` | `UUID` | NN, FK -> `users.id`, `CASCADE` | Usuario propietario |
| `token_hash` | `VARCHAR(255)` | NN, UQ | SHA-256 del refresh token |
| `expires_at` | `TIMESTAMPTZ` | NN | Vencimiento |
| `revoked_at` | `TIMESTAMPTZ` | Opcional | Revocacion o cierre de sesion |
| `user_agent` | `VARCHAR(255)` | Opcional | Navegador o dispositivo |
| `ip_address` | `VARCHAR(45)` | Opcional | IPv4 o IPv6 de origen |
| `created_at` | `TIMESTAMPTZ` | NN | Fecha de creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Ultima modificacion |

Indices: `user_id`, `expires_at`.

### `audit_logs`

Bitacora inmutable de operaciones relevantes.

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador del evento |
| `user_id` | `UUID` | FK -> `users.id`, `SET NULL` | Usuario responsable |
| `table_name` | `VARCHAR(100)` | NN | Tabla afectada |
| `record_id` | `UUID` | Opcional | Registro afectado |
| `action` | `audit_action_enum` | NN | Operacion ejecutada |
| `old_data` | `JSONB` | Opcional | Estado anterior |
| `new_data` | `JSONB` | Opcional | Estado posterior |
| `ip_address` | `VARCHAR(45)` | Opcional | IP del actor |
| `created_at` | `TIMESTAMPTZ` | NN | Fecha del evento |
| `updated_at` | `TIMESTAMPTZ` | NN | Ultima modificacion |

Indices: `(table_name, record_id)`, `user_id`, `created_at`.

## 4. Catalogos operativos

### `document_types`

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `name` | `VARCHAR(50)` | NN, UQ | Cedula, pasaporte, RNC, etc. |
| `is_active` | `BOOLEAN` | NN, defecto `TRUE` | Disponibilidad |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |

### `currencies`

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `code` | `CHAR(3)` | NN, UQ | Codigo ISO, por ejemplo `DOP` o `USD` |
| `name` | `VARCHAR(50)` | NN | Nombre de la moneda |
| `symbol` | `VARCHAR(5)` | NN | Simbolo monetario |
| `is_active` | `BOOLEAN` | NN, defecto `TRUE` | Disponibilidad |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |

### `payment_methods`

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `name` | `VARCHAR(50)` | NN, UQ | Efectivo, transferencia, tarjeta, etc. |
| `is_active` | `BOOLEAN` | NN, defecto `TRUE` | Disponibilidad |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |

### `vehicle_brands`

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `name` | `VARCHAR(80)` | NN, UQ | Nombre de la marca |
| `is_active` | `BOOLEAN` | NN, defecto `TRUE` | Disponibilidad |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |

### `vehicle_models`

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `brand_id` | `UUID` | NN, FK -> `vehicle_brands.id`, `RESTRICT` | Marca propietaria |
| `name` | `VARCHAR(80)` | NN | Nombre del modelo |
| `is_active` | `BOOLEAN` | NN, defecto `TRUE` | Disponibilidad |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |

Restriccion UQ: `(brand_id, name)`. Indice: `brand_id`.

### `expense_categories`

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `name` | `VARCHAR(100)` | NN, UQ | Nombre de la categoria |
| `scope` | `expense_scope_enum` | NN, defecto `general` | Determina si exige o prohibe un vehiculo |
| `is_active` | `BOOLEAN` | NN, defecto `TRUE` | Disponibilidad |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |

## 5. Terceros

### `clients`

Clientes individuales o empresariales. Implementa BL.

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `client_type` | `client_type_enum` | NN, defecto `individual` | Persona o empresa |
| `document_type_id` | `UUID` | NN, FK -> `document_types.id`, `RESTRICT` | Tipo de documento |
| `document_number` | `VARCHAR(30)` | NN | Numero de documento |
| `first_name` | `VARCHAR(100)` | Opcional | Nombres de persona |
| `last_name` | `VARCHAR(100)` | Opcional | Apellidos de persona |
| `company_name` | `VARCHAR(150)` | Opcional | Razon social |
| `email` | `VARCHAR(150)` | Opcional | Correo |
| `phone` | `VARCHAR(30)` | NN | Telefono principal |
| `address` | `VARCHAR(255)` | Opcional | Direccion |
| `city` | `VARCHAR(100)` | Opcional | Ciudad |
| `is_active` | `BOOLEAN` | NN, defecto `TRUE` | Disponibilidad |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |
| `deleted_at` | `TIMESTAMPTZ` | Opcional, BL | Eliminacion logica |

Restriccion UQ: `(document_type_id, document_number)`. Indices: `phone`, `(last_name, first_name)`.

### `suppliers`

Proveedores de vehiculos y servicios de importacion. Implementa BL.

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `name` | `VARCHAR(150)` | NN | Nombre comercial |
| `contact_name` | `VARCHAR(100)` | Opcional | Persona de contacto |
| `document_number` | `VARCHAR(30)` | Opcional | Registro fiscal o comercial |
| `email` | `VARCHAR(150)` | Opcional | Correo |
| `phone` | `VARCHAR(30)` | Opcional | Telefono |
| `address` | `VARCHAR(255)` | Opcional | Direccion |
| `country` | `VARCHAR(80)` | Opcional | Pais |
| `is_active` | `BOOLEAN` | NN, defecto `TRUE` | Disponibilidad |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |
| `deleted_at` | `TIMESTAMPTZ` | Opcional, BL | Eliminacion logica |

## 6. Inventario

### `vehicles`

Unidad fisica controlada por numero de chasis. Implementa BL. La marca se
obtiene mediante `vehicle_models.brand_id`, evitando almacenar una segunda
referencia que pueda contradecir al modelo seleccionado.

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `model_id` | `UUID` | NN, FK -> `vehicle_models.id`, `RESTRICT` | Modelo |
| `year` | `SMALLINT` | NN, `1900..2100` | Ano de fabricacion/modelo |
| `chassis_number` | `VARCHAR(30)` | NN, UQ | VIN o numero de chasis |
| `color` | `VARCHAR(40)` | Opcional | Color exterior |
| `mileage` | `INTEGER` | Opcional, `>= 0` | Kilometraje |
| `engine_number` | `VARCHAR(50)` | Opcional | Numero de motor |
| `transmission_type` | `VARCHAR(20)` | Opcional | Tipo de transmision |
| `fuel_type` | `VARCHAR(20)` | Opcional | Combustible |
| `sale_price` | `NUMERIC(12,2)` | Opcional | Precio sugerido de venta |
| `status` | `vehicle_status_enum` | NN, defecto `in_transit` | Estado operativo |
| `notes` | `TEXT` | Opcional | Caracteristicas y observaciones |
| `is_active` | `BOOLEAN` | NN, defecto `TRUE` | Disponibilidad administrativa |
| `created_at` | `TIMESTAMPTZ` | NN | Registro |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |
| `deleted_at` | `TIMESTAMPTZ` | Opcional, BL | Eliminacion logica |

Indices: `status`, `model_id`.

### `vehicle_images`

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `vehicle_id` | `UUID` | NN, FK -> `vehicles.id`, `CASCADE` | Vehiculo |
| `url` | `VARCHAR(500)` | NN | URL publica de la imagen |
| `is_primary` | `BOOLEAN` | NN, defecto `FALSE` | Indica la portada |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |

Indice: `vehicle_id`.

## 7. Compras e importaciones

### `purchases`

Cabecera de una compra o lote importado. Implementa BL.

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `supplier_id` | `UUID` | NN, FK -> `suppliers.id`, `RESTRICT` | Proveedor |
| `currency_id` | `UUID` | NN, FK -> `currencies.id`, `RESTRICT` | Moneda del documento |
| `purchase_number` | `VARCHAR(30)` | NN, UQ | Correlativo `COM-AAAA-NNNNNN` |
| `invoice_number` | `VARCHAR(50)` | Opcional | Referencia del proveedor |
| `purchase_date` | `DATE` | NN | Fecha de compra |
| `exchange_rate` | `NUMERIC(10,4)` | NN, defecto `1` | Pesos por unidad de moneda |
| `status` | `purchase_status_enum` | NN, defecto `pending` | Estado de la compra |
| `created_by` | `UUID` | NN, FK -> `users.id`, `RESTRICT` | Usuario que registro |
| `notes` | `TEXT` | Opcional | Observaciones |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |
| `deleted_at` | `TIMESTAMPTZ` | Opcional, BL | Eliminacion logica |

Indices: `supplier_id`, `purchase_date`.

### `purchase_items`

Detalle de vehiculos incluidos en una compra.

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `purchase_id` | `UUID` | NN, FK -> `purchases.id`, `CASCADE` | Compra |
| `vehicle_id` | `UUID` | NN, UQ, FK -> `vehicles.id`, `RESTRICT` | Vehiculo; solo puede comprarse una vez |
| `unit_cost` | `NUMERIC(12,2)` | NN, `>= 0` | Precio de adquisicion |
| `freight_cost` | `NUMERIC(12,2)` | NN, defecto `0` | Flete |
| `insurance_cost` | `NUMERIC(12,2)` | NN, defecto `0` | Seguro de transporte |
| `other_costs` | `NUMERIC(12,2)` | NN, defecto `0` | Otros costos de importacion |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |

Indice: `purchase_id`.

## 8. Gastos

### `expenses`

Gasto general o imputado a un vehiculo. Implementa BL.

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `category_id` | `UUID` | NN, FK -> `expense_categories.id`, `RESTRICT` | Categoria |
| `vehicle_id` | `UUID` | FK -> `vehicles.id`, `RESTRICT` | Unidad asociada; depende de `scope` |
| `currency_id` | `UUID` | NN, FK -> `currencies.id`, `RESTRICT` | Moneda |
| `payment_method_id` | `UUID` | NN, FK -> `payment_methods.id`, `RESTRICT` | Medio de pago |
| `description` | `VARCHAR(255)` | NN | Concepto |
| `amount` | `NUMERIC(12,2)` | NN, `> 0` | Importe |
| `exchange_rate` | `NUMERIC(10,4)` | NN, defecto `1`, `> 0` | Tasa hacia DOP |
| `expense_date` | `DATE` | NN | Fecha del gasto |
| `created_by` | `UUID` | NN, FK -> `users.id`, `RESTRICT` | Usuario responsable |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |
| `deleted_at` | `TIMESTAMPTZ` | Opcional, BL | Eliminacion logica |

Indices: `vehicle_id`, `expense_date`, `category_id`.

## 9. Ciclo comercial

### `quotations`

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `quotation_number` | `VARCHAR(30)` | NN, UQ | Correlativo `COT-AAAA-NNNNNN` |
| `client_id` | `UUID` | NN, FK -> `clients.id`, `RESTRICT` | Cliente |
| `vehicle_id` | `UUID` | NN, FK -> `vehicles.id`, `RESTRICT` | Vehiculo cotizado |
| `currency_id` | `UUID` | NN, FK -> `currencies.id`, `RESTRICT` | Moneda |
| `quoted_price` | `NUMERIC(12,2)` | NN, `>= 0` | Precio ofertado |
| `valid_until` | `DATE` | NN | Vigencia |
| `status` | `quotation_status_enum` | NN, defecto `pending` | Estado comercial |
| `created_by` | `UUID` | NN, FK -> `users.id`, `RESTRICT` | Usuario responsable |
| `notes` | `TEXT` | Opcional | Condiciones y observaciones |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |
| `deleted_at` | `TIMESTAMPTZ` | Opcional, BL | Eliminacion logica |

Indices: `client_id`, `vehicle_id`, `status`.

### `reservations`

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `reservation_number` | `VARCHAR(30)` | NN, UQ | Correlativo `RES-AAAA-NNNNNN` |
| `quotation_id` | `UUID` | FK -> `quotations.id`, `SET NULL` | Cotizacion de origen |
| `client_id` | `UUID` | NN, FK -> `clients.id`, `RESTRICT` | Cliente |
| `vehicle_id` | `UUID` | NN, FK -> `vehicles.id`, `RESTRICT` | Vehiculo reservado |
| `deposit_amount` | `NUMERIC(12,2)` | NN, `>= 0` | Deposito acordado |
| `reservation_date` | `DATE` | NN | Fecha de reserva |
| `expiration_date` | `DATE` | NN | Vencimiento |
| `status` | `reservation_status_enum` | NN, defecto `active` | Estado |
| `created_by` | `UUID` | NN, FK -> `users.id`, `RESTRICT` | Usuario responsable |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |
| `deleted_at` | `TIMESTAMPTZ` | Opcional, BL | Eliminacion logica |

Indices: `client_id`, `vehicle_id`, `status`. La aplicacion controla que un vehiculo no tenga mas de una reserva activa.

### `sales`

Cabecera de venta. El total se calcula sumando las lineas activas de `sale_items`.

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `sale_number` | `VARCHAR(30)` | NN, UQ | Correlativo `VEN-AAAA-NNNNNN` |
| `reservation_id` | `UUID` | FK -> `reservations.id`, `SET NULL` | Reserva de origen |
| `quotation_id` | `UUID` | FK -> `quotations.id`, `SET NULL` | Cotizacion de origen |
| `client_id` | `UUID` | NN, FK -> `clients.id`, `RESTRICT` | Comprador |
| `currency_id` | `UUID` | NN, FK -> `currencies.id`, `RESTRICT` | Moneda |
| `exchange_rate` | `NUMERIC(10,4)` | NN, defecto `1` | Tasa hacia DOP |
| `sale_date` | `DATE` | NN | Fecha de venta |
| `status` | `sale_status_enum` | NN, defecto `in_process` | Estado |
| `salesperson_id` | `UUID` | NN, FK -> `users.id`, `RESTRICT` | Vendedor responsable |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |
| `deleted_at` | `TIMESTAMPTZ` | Opcional, BL | Eliminacion logica |

Indices: `client_id`, `sale_date`, `salesperson_id`.

### `sale_items`

Vehiculos e importes de una venta.

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `sale_id` | `UUID` | NN, FK -> `sales.id`, `CASCADE` | Venta |
| `vehicle_id` | `UUID` | NN, FK -> `vehicles.id`, `RESTRICT` | Vehiculo vendido |
| `sale_price` | `NUMERIC(12,2)` | NN, `>= 0` | Precio acordado de la unidad |
| `status` | `sale_item_status_enum` | NN, defecto `active` | Vigente o devuelta |
| `returned_at` | `TIMESTAMPTZ` | Condicional | Fecha de devolucion |
| `return_reason` | `TEXT` | Condicional | Motivo de devolucion |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |

Reglas: una linea `returned` exige `returned_at` y `return_reason`; el indice unico parcial sobre `vehicle_id WHERE status = 'active'` impide vender simultaneamente una unidad en dos ventas. Indices: `sale_id`, `status`, `vehicle_id`.

### `sale_payments`

Dinero recibido por una venta.

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `sale_id` | `UUID` | NN, FK -> `sales.id`, `CASCADE` | Venta |
| `payment_method_id` | `UUID` | NN, FK -> `payment_methods.id`, `RESTRICT` | Medio de cobro |
| `currency_id` | `UUID` | NN, FK -> `currencies.id`, `RESTRICT` | Moneda; debe coincidir con la venta |
| `amount` | `NUMERIC(12,2)` | NN, `> 0` | Importe recibido |
| `payment_date` | `DATE` | NN | Fecha de cobro |
| `reference_number` | `VARCHAR(50)` | Opcional | Referencia bancaria o recibo |
| `received_by` | `UUID` | NN, FK -> `users.id`, `RESTRICT` | Usuario receptor |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |

Indice: `sale_id`.

### `refunds`

Dinero devuelto al cliente; se mantiene separado de los cobros.

| Campo | Tipo | Reglas | Descripcion |
|---|---|---|---|
| `id` | `UUID` | PK | Identificador |
| `sale_id` | `UUID` | NN, FK -> `sales.id`, `RESTRICT` | Venta |
| `sale_item_id` | `UUID` | FK -> `sale_items.id`, `RESTRICT` | Unidad devuelta; `NULL` para ajuste general |
| `refund_method_id` | `UUID` | NN, FK -> `payment_methods.id`, `RESTRICT` | Medio de devolucion |
| `currency_id` | `UUID` | NN, FK -> `currencies.id`, `RESTRICT` | Moneda |
| `amount` | `NUMERIC(12,2)` | NN, `> 0` | Importe devuelto |
| `exchange_rate` | `NUMERIC(10,4)` | NN, defecto `1` | Tasa del dia del reembolso |
| `refund_date` | `DATE` | NN | Fecha |
| `reason` | `TEXT` | NN | Justificacion |
| `processed_by` | `UUID` | NN, FK -> `users.id`, `RESTRICT` | Usuario responsable |
| `created_at` | `TIMESTAMPTZ` | NN | Creacion |
| `updated_at` | `TIMESTAMPTZ` | NN | Modificacion |

Indices: `sale_id`, `sale_item_id`, `refund_date`.

## 10. Vistas de reporte

Las vistas son de solo lectura y consolidan importes en DOP usando las tasas historicas guardadas.

| Vista | Finalidad | Datos principales |
|---|---|---|
| `vw_sale_totals` | Totales vigentes e historicos por venta | Total activo, total originalmente vendido, unidades activas y devueltas |
| `vw_vehicle_profitability` | Rentabilidad por unidad | Compra, gastos, costo total, venta, margen y porcentaje |
| `vw_accounts_receivable` | Cuentas por cobrar | Cliente, vendedor, vehiculos, cobrado, reembolsado, saldo y antiguedad |
| `vw_sales_summary_monthly` | Ventas mensuales | Documentos, unidades e importes por moneda |
| `vw_sales_by_salesperson` | Rendimiento comercial | Ventas, unidades e importes por vendedor y mes |
| `vw_returns_summary_monthly` | Devoluciones parciales | Unidades devueltas, valor y reembolsos |
| `vw_expenses_summary_monthly` | Gastos mensuales | Categoria, alcance, moneda, cantidad e importes |
| `vw_inventory_status_summary` | Estado del inventario | Cantidad de vehiculos por estado |

## 11. Relaciones principales

```text
roles 1 -- N users
roles N -- N permissions              mediante role_permissions
users 1 -- N refresh_tokens
users 1 -- N audit_logs

vehicle_brands 1 -- N vehicle_models
vehicle_models 1 -- N vehicles
vehicles 1 -- N vehicle_images

suppliers 1 -- N purchases
purchases 1 -- N purchase_items
vehicles 1 -- 0..1 purchase_items
vehicles 1 -- N expenses

clients 1 -- N quotations
vehicles 1 -- N quotations
quotations 1 -- N reservations
clients 1 -- N reservations
vehicles 1 -- N reservations

clients 1 -- N sales
sales 1 -- N sale_items
vehicles 1 -- N sale_items             solo una linea activa simultanea
sales 1 -- N sale_payments
sales 1 -- N refunds
sale_items 1 -- N refunds
```

## 12. Reglas transversales

- El borrado de usuarios, clientes, proveedores, vehiculos, compras, gastos, cotizaciones, reservas y ventas es logico cuando existe `deleted_at`.
- Las FK historicas usan normalmente `RESTRICT` para impedir la perdida de trazabilidad.
- Los detalles dependientes usan `CASCADE`, por ejemplo imagenes, partidas de compra, lineas de venta y cobros.
- Los montos documentales permanecen en la moneda indicada por `currency_id`; `exchange_rate` permite consolidarlos a DOP.
- Una compra solo puede contener una vez cada vehiculo.
- Una unidad solo puede estar en una linea de venta activa a la vez.
- Los pagos no pueden superar el saldo de la venta y usan la misma moneda de la venta.
- Los reembolsos reducen el cobro neto, pero no se guardan como pagos negativos.
- Las categorias de gasto con alcance `vehicle` exigen `vehicle_id`; las de alcance `general` lo prohiben.
