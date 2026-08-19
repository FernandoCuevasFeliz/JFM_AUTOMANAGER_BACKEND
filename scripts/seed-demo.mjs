/**
 * Datos de demostración para JFM AutoManager.
 *
 * Crea un juego completo de datos para poder recorrer la aplicación: un usuario
 * por rol, catálogo de marcas y modelos, proveedores, clientes, vehículos en
 * todos los estados, compras, gastos en dos monedas, y el ciclo comercial
 * entero (cotizaciones, reservas, ventas y pagos).
 *
 * Trabaja contra la API HTTP y NO contra la base de datos a propósito: así cada
 * registro atraviesa las mismas reglas de negocio que usaría una persona desde
 * el frontend (máquinas de estado, correlativos, transacciones). Un INSERT
 * directo podría dejar, por ejemplo, un vehículo en `sold` sin venta asociada.
 *
 * Uso:
 *   API_URL=http://localhost:3000 \
 *   ADMIN_EMAIL=admin@ejghautoimport.com ADMIN_PASSWORD='Admin123*' \
 *   node scripts/seed-demo.mjs
 *
 * Es abortable: si detecta que los datos ya existen, no hace nada (salvo
 * --force). No es idempotente, así que ejecutarlo dos veces con --force crearía
 * duplicados.
 */

const API = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '') + '/api/v1';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@ejghautoimport.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin123*';
const FORCE = process.argv.includes('--force');

/** Contraseñas de demostración. Documentadas en DEMO.md. */
const DEMO_PASSWORD = {
  ventas: 'Ventas2026',
  inventario: 'Inventario2026',
  contabilidad: 'Contabilidad2026',
};

let token = '';
const created = { usuarios: [], vehiculos: [], ventas: [] };

async function call(method, path, body, { as = token, expect } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(as ? { authorization: `Bearer ${as}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;

  if (expect !== undefined && res.status !== expect) {
    throw new Error(
      `${method} ${path} -> ${res.status} (esperaba ${expect})\n${JSON.stringify(payload, null, 2)}`,
    );
  }
  return { status: res.status, data: payload?.data, error: payload?.error };
}

const post = (p, b, as) => call('POST', p, b, { expect: 201, as }).then((r) => r.data);
const patch = (p, b) => call('PATCH', p, b, { expect: 200 }).then((r) => r.data);
const get = (p) => call('GET', p, undefined, { expect: 200 }).then((r) => r.data);

function log(seccion, detalle = '') {
  console.log(`  ${seccion}${detalle ? ': ' + detalle : ''}`);
}

/** Fecha civil relativa a hoy, en el formato YYYY-MM-DD que espera la API. */
function dia(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log(`\nSembrando datos de demostración en ${API}\n`);

  // --- Sesión de administrador ---------------------------------------------
  const login = await call(
    'POST',
    '/auth/login',
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    { as: '' },
  );
  if (login.status !== 200) {
    throw new Error(
      `No se pudo iniciar sesión como ${ADMIN_EMAIL}. ¿Corrió el seed del administrador?\n` +
        JSON.stringify(login.error, null, 2),
    );
  }
  token = login.data.accessToken;
  log('Sesión de administrador iniciada');

  // --- Salvaguarda contra duplicados ---------------------------------------
  const existentes = await get('/users?search=ventas@ejghautoimport.com');
  if (existentes.length > 0 && !FORCE) {
    console.log(
      '\nLos datos de demostración ya parecen existir (usuario de ventas encontrado).\n' +
        'No se hizo nada. Use --force para crearlos igualmente (generará duplicados).\n',
    );
    return;
  }

  // --- Catálogos base -------------------------------------------------------
  const cat = await get('/catalogs');
  const moneda = Object.fromEntries(cat.currencies.map((c) => [c.code, c.id]));
  const doc = Object.fromEntries(cat.documentTypes.map((d) => [d.name, d.id]));
  const pago = Object.fromEntries(cat.paymentMethods.map((p) => [p.name, p.id]));
  const catVeh = cat.expenseCategories.filter((c) => c.scope === 'vehicle');
  const catGen = cat.expenseCategories.filter((c) => c.scope === 'general');
  const DOP = moneda.DOP;
  const USD = moneda.USD;

  // --- Usuarios, uno por rol ------------------------------------------------
  const roles = Object.fromEntries((await get('/users/roles')).map((r) => [r.name, r.id]));
  const personal = [
    ['ventas', 'Ana', 'Vendedora', '809-555-0201'],
    ['inventario', 'Luis', 'Almacen', '809-555-0202'],
    ['contabilidad', 'Sofia', 'Contable', '809-555-0203'],
  ];
  for (const [rol, nombre, apellido, tel] of personal) {
    const u = await post('/users', {
      roleId: roles[rol],
      firstName: nombre,
      lastName: apellido,
      email: `${rol}@ejghautoimport.com`,
      password: DEMO_PASSWORD[rol],
      phone: tel,
      isActive: true,
    });
    created.usuarios.push({ rol, email: u.email, password: DEMO_PASSWORD[rol] });
  }
  log('Usuarios', `${personal.length} (uno por rol) + el administrador existente`);

  // --- Marcas y modelos -----------------------------------------------------
  const catalogo = {
    Toyota: ['Corolla Cross', 'RAV4', 'Hilux'],
    Honda: ['CR-V', 'Civic'],
    Hyundai: ['Tucson', 'Elantra'],
    Kia: ['Sportage'],
    Nissan: ['Frontier'],
  };
  const modelo = {};
  const marca = {};
  for (const [nombreMarca, modelos] of Object.entries(catalogo)) {
    const m = await post('/vehicle-brands', { name: nombreMarca });
    marca[nombreMarca] = m.id;
    for (const nombreModelo of modelos) {
      const mm = await post('/vehicle-models', { brandId: m.id, name: nombreModelo });
      modelo[`${nombreMarca} ${nombreModelo}`] = mm.id;
    }
  }
  log('Catálogo', `${Object.keys(marca).length} marcas, ${Object.keys(modelo).length} modelos`);

  // --- Proveedores ----------------------------------------------------------
  const proveedores = {};
  for (const [nombre, pais, contacto] of [
    ['Japan Auto Export KK', 'Japon', 'Kenji Tanaka'],
    ['Korea Motors Trading', 'Corea del Sur', 'Ji-woo Park'],
    ['Gulf Coast Auto Traders', 'Estados Unidos', 'Mike Sullivan'],
  ]) {
    const p = await post('/suppliers', {
      name: nombre,
      country: pais,
      contactName: contacto,
      email: null,
      phone: null,
      address: null,
      documentNumber: null,
      isActive: true,
    });
    proveedores[nombre] = p.id;
  }
  log('Proveedores', String(Object.keys(proveedores).length));

  // --- Clientes -------------------------------------------------------------
  const clientes = [];
  for (const c of [
    ['individual', 'Cedula', '402-1234567-8', 'Hidekel', 'Reyes', null, 'Santiago'],
    ['individual', 'Cedula', '001-9876543-2', 'Maria', 'Jimenez', null, 'Santo Domingo'],
    ['individual', 'Cedula', '031-5551234-9', 'Carlos', 'Fermin', null, 'La Vega'],
    ['individual', 'Pasaporte', 'X8812345', 'Rosa', 'Pena', null, 'Puerto Plata'],
    ['company', 'RNC', '131-00112-3', null, null, 'Transporte del Cibao SRL', 'Santiago'],
    ['company', 'RNC', '131-99887-5', null, null, 'Constructora Duarte SA', 'Santo Domingo'],
  ]) {
    const [tipo, tipoDoc, numDoc, nombre, apellido, empresa, ciudad] = c;
    const cli = await post('/clients', {
      clientType: tipo,
      documentTypeId: doc[tipoDoc],
      documentNumber: numDoc,
      firstName: nombre,
      lastName: apellido,
      companyName: empresa,
      email: null,
      phone: `809-555-${String(1000 + clientes.length).slice(-4)}`,
      address: null,
      city: ciudad,
      isActive: true,
    });
    clientes.push(cli);
  }
  log('Clientes', `${clientes.length} (4 personas, 2 empresas)`);

  // --- Vehículos ------------------------------------------------------------
  // Todos nacen `in_transit` o directamente en el estado que no depende del
  // ciclo comercial; `reserved` y `sold` los produce después la operación real.
  const specs = [
    ['Toyota', 'Corolla Cross', 2024, 'JT2CC24A1R0100001', 'Blanco', 15, 1_850_000, 'in_transit'],
    ['Toyota', 'RAV4', 2023, 'JT2RV23B2S0100002', 'Gris', 22_000, 2_150_000, 'in_transit'],
    ['Honda', 'CR-V', 2024, 'JHCRV24C3T0100003', 'Negro', 8_500, 2_050_000, 'in_transit'],
    ['Hyundai', 'Tucson', 2023, 'KMHTU23D4U0100004', 'Azul', 31_000, 1_690_000, 'in_transit'],
    ['Kia', 'Sportage', 2024, 'KNASP24E5V0100005', 'Rojo', 12_000, 1_780_000, 'in_transit'],
    ['Nissan', 'Frontier', 2022, 'JN1FR22F6W0100006', 'Plata', 48_000, 1_450_000, 'in_transit'],
    ['Toyota', 'Hilux', 2023, 'JT2HL23G7X0100007', 'Blanco', 27_000, 2_380_000, 'in_transit'],
    ['Honda', 'Civic', 2022, 'JHCIV22H8Y0100008', 'Gris', 55_000, 1_180_000, 'in_repair'],
    ['Hyundai', 'Elantra', 2021, 'KMHEL21I9Z0100009', 'Negro', 72_000, 980_000, 'unavailable'],
    ['Toyota', 'Corolla Cross', 2025, 'JT2CC25J1A0100010', 'Azul', 0, 1_990_000, 'in_transit'],
    ['Kia', 'Sportage', 2025, 'KNASP25K2B0100011', 'Blanco', 0, 1_880_000, 'in_transit'],
    ['Nissan', 'Frontier', 2024, 'JN1FR24L3C0100012', 'Negro', 5_000, 1_920_000, 'in_transit'],
  ];
  const veh = [];
  for (const [mk, md, anio, chasis, color, km, precio, estado] of specs) {
    const v = await post('/vehicles', {
      brandId: marca[mk],
      modelId: modelo[`${mk} ${md}`],
      year: anio,
      chassisNumber: chasis,
      color,
      mileage: km,
      salePrice: precio,
      status: estado,
      engineNumber: null,
      transmissionType: 'automatica',
      fuelType: 'gasolina',
      notes: null,
      isActive: true,
    });
    veh.push(v);
    created.vehiculos.push({ chasis: v.chassisNumber, desc: `${mk} ${md} ${anio}` });
  }
  log('Vehículos', `${veh.length} creados`);

  // Imágenes de ejemplo en los tres primeros (la API guarda URLs, no archivos)
  for (const v of veh.slice(0, 3)) {
    await post(`/vehicles/${v.id}/images`, {
      url: `https://images.ejghautoimport.test/${v.chassisNumber}/frente.jpg`,
      isPrimary: true,
    });
    await post(`/vehicles/${v.id}/images`, {
      url: `https://images.ejghautoimport.test/${v.chassisNumber}/interior.jpg`,
      isPrimary: false,
    });
  }
  log('Imágenes', '2 por vehículo en los 3 primeros');

  // --- Compras --------------------------------------------------------------
  // Al marcarlas `received`, sus vehículos pasan solos a inventario.
  const compra1 = await post('/purchases', {
    supplierId: proveedores['Japan Auto Export KK'],
    currencyId: USD,
    invoiceNumber: 'JAE-2026-0091',
    purchaseDate: dia(-75),
    exchangeRate: 60.5,
    status: 'pending',
    notes: 'Lote de importación desde Nagoya',
    items: [
      { vehicleId: veh[0].id, unitCost: 11_000, freightCost: 900, insuranceCost: 150, otherCosts: 400 },
      { vehicleId: veh[1].id, unitCost: 13_500, freightCost: 950, insuranceCost: 180, otherCosts: 450 },
      { vehicleId: veh[2].id, unitCost: 12_800, freightCost: 900, insuranceCost: 170, otherCosts: 420 },
      { vehicleId: veh[6].id, unitCost: 15_200, freightCost: 1_000, insuranceCost: 200, otherCosts: 500 },
    ],
  });
  await patch(`/purchases/${compra1.id}/status`, { status: 'received' });

  const compra2 = await post('/purchases', {
    supplierId: proveedores['Korea Motors Trading'],
    currencyId: USD,
    invoiceNumber: 'KMT-2026-0044',
    purchaseDate: dia(-50),
    exchangeRate: 61.2,
    status: 'pending',
    notes: null,
    items: [
      { vehicleId: veh[3].id, unitCost: 10_400, freightCost: 850, insuranceCost: 140, otherCosts: 380 },
      { vehicleId: veh[4].id, unitCost: 11_200, freightCost: 850, insuranceCost: 150, otherCosts: 390 },
      { vehicleId: veh[5].id, unitCost: 8_900, freightCost: 800, insuranceCost: 120, otherCosts: 350 },
      { vehicleId: veh[11].id, unitCost: 12_100, freightCost: 880, insuranceCost: 160, otherCosts: 410 },
    ],
  });
  await patch(`/purchases/${compra2.id}/status`, { status: 'received' });

  // Esta queda en tránsito: sus vehículos siguen fuera del inventario.
  const compra3 = await post('/purchases', {
    supplierId: proveedores['Gulf Coast Auto Traders'],
    currencyId: USD,
    invoiceNumber: 'GCA-2026-0177',
    purchaseDate: dia(-12),
    exchangeRate: 60.9,
    status: 'pending',
    notes: 'En tránsito marítimo, llegada estimada en 3 semanas',
    items: [
      { vehicleId: veh[9].id, unitCost: 12_600, freightCost: 900, insuranceCost: 165, otherCosts: 430 },
      { vehicleId: veh[10].id, unitCost: 11_900, freightCost: 900, insuranceCost: 155, otherCosts: 415 },
    ],
  });
  await patch(`/purchases/${compra3.id}/status`, { status: 'in_transit' });
  log('Compras', `3 (${compra1.purchaseNumber} y ${compra2.purchaseNumber} recibidas, ${compra3.purchaseNumber} en tránsito)`);

  // --- Gastos ---------------------------------------------------------------
  const gastoVeh = (nombre) => (catVeh.find((c) => c.name.includes(nombre)) ?? catVeh[0]).id;
  const gastoGen = (nombre) => (catGen.find((c) => c.name.includes(nombre)) ?? catGen[0]).id;

  const gastos = [
    [gastoVeh('Nacionalizacion'), veh[0].id, DOP, 'Efectivo', 'Nacionalizacion y aduana', 145_000, 1, dia(-70)],
    [gastoVeh('Reparacion'), veh[0].id, DOP, 'Transferencia', 'Cambio de frenos y aceite', 28_500, 1, dia(-65)],
    [gastoVeh('Preparacion'), veh[0].id, DOP, 'Efectivo', 'Detailing y pulido', 12_000, 1, dia(-60)],
    [gastoVeh('Nacionalizacion'), veh[1].id, DOP, 'Cheque', 'Nacionalizacion y aduana', 168_000, 1, dia(-70)],
    [gastoVeh('Transporte'), veh[1].id, USD, 'Transferencia', 'Flete interno en origen', 300, 61.0, dia(-72)],
    [gastoVeh('Nacionalizacion'), veh[2].id, DOP, 'Transferencia', 'Nacionalizacion y aduana', 152_000, 1, dia(-68)],
    [gastoVeh('Matriculacion'), veh[2].id, DOP, 'Efectivo', 'Placas y matriculacion', 18_500, 1, dia(-40)],
    [gastoVeh('Reparacion'), veh[7].id, DOP, 'Efectivo', 'Reparacion de transmision', 62_000, 1, dia(-20)],
    [gastoGen('Alquiler'), null, DOP, 'Transferencia', 'Alquiler del local, mes corriente', 85_000, 1, dia(-30)],
    [gastoGen('Nomina'), null, DOP, 'Transferencia', 'Nomina del personal', 240_000, 1, dia(-30)],
    [gastoGen('Publicidad'), null, DOP, 'Tarjeta', 'Campana en redes sociales', 35_000, 1, dia(-25)],
    [gastoGen('Servicios'), null, DOP, 'Efectivo', 'Luz, agua e internet', 18_700, 1, dia(-28)],
  ];
  for (const [categoryId, vehicleId, currencyId, metodo, description, amount, exchangeRate, expenseDate] of gastos) {
    await post('/expenses', {
      categoryId,
      vehicleId,
      currencyId,
      paymentMethodId: pago[metodo],
      description,
      amount,
      exchangeRate,
      expenseDate,
    });
  }
  log('Gastos', `${gastos.length} (8 por vehículo, 4 generales; uno en USD)`);

  // --- Cotizaciones ---------------------------------------------------------
  const cot1 = await post('/quotations', {
    clientId: clientes[0].id, vehicleId: veh[0].id, currencyId: DOP,
    quotedPrice: 1_800_000, validUntil: dia(30), notes: 'Cliente interesado, pide financiamiento',
  });
  await patch(`/quotations/${cot1.id}/status`, { status: 'approved' });

  const cot2 = await post('/quotations', {
    clientId: clientes[1].id, vehicleId: veh[2].id, currencyId: DOP,
    quotedPrice: 2_000_000, validUntil: dia(25), notes: null,
  });
  await patch(`/quotations/${cot2.id}/status`, { status: 'approved' });

  const cot3 = await post('/quotations', {
    clientId: clientes[2].id, vehicleId: veh[3].id, currencyId: DOP,
    quotedPrice: 1_650_000, validUntil: dia(20), notes: 'Pendiente de respuesta',
  });

  const cot4 = await post('/quotations', {
    clientId: clientes[3].id, vehicleId: veh[4].id, currencyId: DOP,
    quotedPrice: 1_750_000, validUntil: dia(15), notes: null,
  });
  await patch(`/quotations/${cot4.id}/status`, { status: 'rejected' });

  const cot5 = await post('/quotations', {
    clientId: clientes[4].id, vehicleId: veh[1].id, currencyId: DOP,
    quotedPrice: 2_100_000, validUntil: dia(40), notes: 'Flota de la empresa',
  });
  await patch(`/quotations/${cot5.id}/status`, { status: 'approved' });
  log('Cotizaciones', '5 (3 aprobadas, 1 pendiente, 1 rechazada)');

  // --- Reservas -------------------------------------------------------------
  // Deja el vehículo 3 (Honda CR-V) en `reserved`.
  const res1 = await post('/reservations', {
    quotationId: cot2.id, clientId: clientes[1].id, vehicleId: veh[2].id,
    depositAmount: 150_000, reservationDate: dia(-10), expirationDate: dia(20),
  });
  log('Reservas', `1 activa (${res1.reservationNumber}), vehículo apartado`);

  // --- Ventas ---------------------------------------------------------------
  const admin = await get('/auth/me');

  // Venta 1: completada y totalmente pagada.
  const venta1 = await post('/sales', {
    reservationId: null, quotationId: cot1.id,
    clientId: clientes[0].id, vehicleId: veh[0].id, currencyId: DOP,
    salePrice: 1_800_000, exchangeRate: 1, saleDate: dia(-35), salespersonId: admin.id,
    initialPayment: {
      paymentMethodId: pago.Transferencia, amount: 800_000,
      paymentDate: dia(-35), referenceNumber: 'TRF-88213',
    },
  });
  await post(`/sales/${venta1.id}/payments`, {
    paymentMethodId: pago.Financiamiento, currencyId: DOP, amount: 1_000_000,
    paymentDate: dia(-30), referenceNumber: 'Prestamo Banco Popular',
  });
  await call('POST', `/sales/${venta1.id}/complete`, undefined, { expect: 200 });
  created.ventas.push({ num: venta1.saleNumber, estado: 'completada' });

  // Venta 2: en proceso, con saldo pendiente.
  const venta2 = await post('/sales', {
    reservationId: null, quotationId: cot5.id,
    clientId: clientes[4].id, vehicleId: veh[1].id, currencyId: DOP,
    salePrice: 2_100_000, exchangeRate: 1, saleDate: dia(-8), salespersonId: admin.id,
    initialPayment: {
      paymentMethodId: pago.Cheque, amount: 700_000,
      paymentDate: dia(-8), referenceNumber: 'CHQ-004521',
    },
  });
  created.ventas.push({ num: venta2.saleNumber, estado: 'en proceso, saldo pendiente' });

  // Venta 3: se cancela para dejar visible que el vehículo vuelve a venderse
  // sin borrar el historial (índice único parcial).
  const venta3 = await post('/sales', {
    reservationId: null, quotationId: null,
    clientId: clientes[5].id, vehicleId: veh[11].id, currencyId: DOP,
    salePrice: 1_900_000, exchangeRate: 1, saleDate: dia(-18), salespersonId: admin.id,
    initialPayment: null,
  });
  await call('POST', `/sales/${venta3.id}/cancel`, undefined, { expect: 200 });
  created.ventas.push({ num: venta3.saleNumber, estado: 'cancelada (vehículo de vuelta en inventario)' });

  // Venta 4: FLOTILLA. Tres vehículos en un solo documento, con una devolución
  // parcial y su reembolso. Es el caso que el modelo de un vehículo por venta
  // no podía representar: antes había que abrir tres ventas y cancelar una
  // entera para devolver una unidad.
  const flotilla = await post('/sales', {
    reservationId: null, quotationId: null,
    clientId: clientes[5].id, currencyId: DOP,
    exchangeRate: 1, saleDate: dia(-12), salespersonId: admin.id,
    // veh[11] es el que acaba de liberar la venta cancelada: se revende sin
    // borrar el documento anulado, que es lo que permite el índice único parcial.
    items: [
      { vehicleId: veh[6].id, salePrice: 2_380_000 },
      { vehicleId: veh[3].id, salePrice: 1_690_000 },
      { vehicleId: veh[11].id, salePrice: 1_920_000 },
    ],
    initialPayment: {
      paymentMethodId: pago.Transferencia, amount: 3_000_000,
      paymentDate: dia(-12), referenceNumber: 'TRF-FLOTA-9001',
    },
  });

  // El cliente devuelve una de las tres unidades: la venta sigue viva con las
  // otras dos y su importe baja solo porque la línea deja de sumar.
  const lineaDevuelta = flotilla.items.find((i) => i.vehicleId === veh[3].id);
  await call('POST', `/sales/${flotilla.id}/items/${lineaDevuelta.id}/return`, {
    reason: 'El cliente redujo la flotilla a dos unidades',
    destination: 'in_inventory',
  }, { expect: 200 });

  // Y se le reintegra la parte proporcional de lo que había pagado.
  await post(`/sales/${flotilla.id}/refunds`, {
    saleItemId: lineaDevuelta.id,
    refundMethodId: pago.Transferencia, currencyId: DOP,
    amount: 800_000, exchangeRate: 1,
    refundDate: dia(-9),
    reason: 'Reintegro por la unidad devuelta',
  });
  created.ventas.push({
    num: flotilla.saleNumber,
    estado: '3 vehículos, 1 devuelto y reembolsado',
  });

  log('Ventas', '4 (1 completada, 1 en proceso, 1 cancelada, 1 flotilla con devolución) con 4 pagos y 1 reembolso');

  // --- Facturacion electronica (e-CF) --------------------------------------
  // El backend puede no tener aun el modulo desplegado; en ese caso se omite
  // esta seccion en lugar de abortar toda la siembra.
  const sondeo = await call('GET', '/invoices?page=1&pageSize=1');
  if (sondeo.status === 404) {
    log('Facturacion', 'OMITIDA (el backend desplegado no expone /invoices todavia)');
  } else {
  // Comprobantes en los cuatro estados posibles, para poder recorrer el modulo
  // fiscal completo desde la interfaz.

  // 1. Factura EMITIDA sobre la venta completada.
  const fac1 = await post('/invoices', { saleId: venta1.id, ncfType: 'E31' });
  await call('POST', `/invoices/${fac1.id}/issue`, {
    ncfNumber: 'E310000000001',
    dgiiTrackId: 'DGII-TRK-000001',
    xmlUrl: 'https://ecf.ejghautoimport.test/E310000000001.xml',
  }, { expect: 200 });

  // 2. Factura EMITIDA con una nota de credito PARCIAL (descuento posventa).
  const fac2 = await post('/invoices', { saleId: venta2.id, ncfType: 'E31' });
  await call('POST', `/invoices/${fac2.id}/issue`, {
    ncfNumber: 'E310000000002',
    dgiiTrackId: 'DGII-TRK-000002',
    xmlUrl: null,
  }, { expect: 200 });
  const nota1 = await post(`/invoices/${fac2.id}/credit-notes`, {
    reason: 'Descuento comercial acordado tras la entrega',
    amount: 100_000,
  });
  await call('POST', `/invoices/${fac2.id}/credit-notes/${nota1.id}/issue`, {
    ncfNumber: 'E340000000001',
    dgiiTrackId: 'DGII-TRK-000003',
    xmlUrl: null,
  }, { expect: 200 });

  // 3. Factura RECHAZADA por la DGII, lista para corregir y reintentar.
  const venta4 = await post('/sales', {
    reservationId: null, quotationId: null,
    clientId: clientes[5].id, vehicleId: veh[5].id, currencyId: DOP,
    salePrice: 1_450_000, exchangeRate: 1, saleDate: dia(-5), salespersonId: admin.id,
    initialPayment: null,
  });
  const fac3 = await post('/invoices', { saleId: venta4.id, ncfType: 'E31' });
  await call('POST', `/invoices/${fac3.id}/reject`, {
    reason: 'El RNC del receptor no corresponde a un contribuyente activo',
  }, { expect: 200 });

  // 4. Factura PENDIENTE, todavia sin enviar a la DGII.
  const venta5 = await post('/sales', {
    reservationId: null, quotationId: null,
    clientId: clientes[3].id, vehicleId: veh[4].id, currencyId: DOP,
    salePrice: 1_780_000, exchangeRate: 1, saleDate: dia(-2), salespersonId: admin.id,
    initialPayment: null,
  });
  const fac4 = await post('/invoices', { saleId: venta5.id, ncfType: 'E32' });

  created.ventas.push({ num: venta4.saleNumber, estado: 'facturada, e-CF rechazado por la DGII' });
  created.ventas.push({ num: venta5.saleNumber, estado: 'facturada, e-CF pendiente de envio' });
  log(
    'Facturacion',
    `4 comprobantes (${fac1.ncfType} emitido, 1 emitido con nota de credito, 1 rechazado, 1 pendiente) + 1 nota de credito`,
  );
  }

  // --- Resumen --------------------------------------------------------------
  const inv = await get('/vehicles/summary');
  const resumenVentas = await get(`/sales/summary?dateFrom=${dia(-365)}&dateTo=${dia(1)}`);

  console.log('\n─────────────────────────────────────────────');
  console.log('Inventario por estado:', JSON.stringify(inv.byStatus));
  console.log(
    `Ventas: ${resumenVentas.totalSales} · facturado ${resumenVentas.totalAmount.toLocaleString('es-DO')} ` +
      `· cobrado ${resumenVentas.totalCollected.toLocaleString('es-DO')} ${resumenVentas.reportingCurrency}`,
  );
  const resFacturas = await call('GET', '/invoices?page=1&pageSize=50');
  if (resFacturas.status === 200) {
    const porEstado = resFacturas.data.reduce(
      (acc, f) => ({ ...acc, [f.status]: (acc[f.status] ?? 0) + 1 }),
      {},
    );
    console.log('Comprobantes fiscales:', JSON.stringify(porEstado));
  }

  console.log('\nUsuarios creados:');
  for (const u of created.usuarios) {
    console.log(`  ${u.rol.padEnd(14)} ${u.email.padEnd(34)} ${u.password}`);
  }
  console.log(`  admin          ${ADMIN_EMAIL.padEnd(34)} (la que ya tenía)`);
  console.log('\nListo. Ver DEMO.md para el detalle de qué puede hacer cada rol.\n');
}

main().catch((error) => {
  console.error('\nFalló la siembra de datos:\n');
  console.error(error.message);
  process.exit(1);
});
