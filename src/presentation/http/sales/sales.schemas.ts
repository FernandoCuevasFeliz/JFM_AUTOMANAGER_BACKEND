import { z } from 'zod';
import {
  dateOnly,
  exchangeRate,
  money,
  nullableString,
  paginationQuery,
  positiveMoney,
  uuid,
} from '../shared/common.schemas';

const saleStatus = z.enum(['in_process', 'completed', 'cancelled']);

/**
 * Pago inicial opcional. Sirve para registrar de una vez el deposito que el
 * cliente dejo en la reserva: `reservations` guarda el monto pero no el metodo
 * de pago, asi que el metodo se informa aqui.
 */
const initialPaymentSchema = z.object({
  paymentMethodId: uuid,
  amount: positiveMoney,
  paymentDate: dateOnly,
  referenceNumber: nullableString(50),
});

/** Un vehiculo de la venta con su precio pactado. */
export const saleItemSchema = z.object({
  vehicleId: uuid,
  salePrice: money,
});

/**
 * Alta de una venta con uno o varios vehiculos.
 *
 * Acepta las dos formas: `items` (la actual) y el par `vehicleId`/`salePrice`
 * de una sola unidad, que es como se pedia antes de que existiera el detalle.
 * La forma antigua se normaliza aqui a una lista de una linea, de modo que ni
 * el caso de uso ni el resto del sistema tienen que conocer dos formatos. Es una
 * traduccion sin ambiguedad: un vehiculo con su precio es exactamente una linea.
 */
export const createSaleSchema = z
  .object({
    reservationId: uuid.nullable().optional().default(null),
    quotationId: uuid.nullable().optional().default(null),
    clientId: uuid,
    items: z.array(saleItemSchema).min(1).max(50).optional(),
    /** Forma antigua, un solo vehiculo. */
    vehicleId: uuid.optional(),
    salePrice: money.optional(),
    currencyId: uuid,
    exchangeRate: exchangeRate.default(1),
    saleDate: dateOnly,
    salespersonId: uuid,
    initialPayment: initialPaymentSchema.nullable().optional().default(null),
  })
  .superRefine((value, ctx) => {
    const tieneItems = value.items !== undefined;
    const tieneLegacy = value.vehicleId !== undefined && value.salePrice !== undefined;

    if (!tieneItems && !tieneLegacy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: 'Debe indicar los vehiculos de la venta en "items"',
      });
      return;
    }

    if (tieneItems && (value.vehicleId !== undefined || value.salePrice !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: 'Use "items" o el par "vehicleId"/"salePrice", pero no ambos',
      });
      return;
    }

    if (tieneItems) {
      const vistos = new Set<string>();
      value.items?.forEach((item, index) => {
        if (vistos.has(item.vehicleId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'vehicleId'],
            message: 'El vehiculo esta repetido en la venta',
          });
        }
        vistos.add(item.vehicleId);
      });
    }
  })
  .transform(({ vehicleId, salePrice, items, ...rest }) => ({
    ...rest,
    items:
      items ?? [{ vehicleId: vehicleId as string, salePrice: salePrice as number }],
  }));

/**
 * Correccion de la CABECERA. El precio no esta aqui a proposito: con varias
 * unidades por venta, "el precio" es la suma de las lineas y se corrige linea a
 * linea con `PATCH /sales/:id/items/:itemId`.
 */
export const updateSaleSchema = z
  .object({
    exchangeRate: exchangeRate.optional(),
    saleDate: dateOnly.optional(),
    salespersonId: uuid.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Debe enviar al menos un campo a modificar');

export const addSaleItemSchema = saleItemSchema;

export const updateSaleItemSchema = z.object({
  salePrice: money,
});

/**
 * Devolucion de una unidad. El destino se limita a los dos estados con sentido
 * para un vehiculo que vuelve: disponible o en taller. `sold` y `reserved` los
 * produce el ciclo comercial, no una devolucion.
 */
export const returnSaleItemSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  destination: z.enum(['in_inventory', 'in_repair']).default('in_inventory'),
});

export const registerPaymentSchema = z.object({
  paymentMethodId: uuid,
  currencyId: uuid,
  amount: positiveMoney,
  paymentDate: dateOnly,
  referenceNumber: nullableString(50),
});

/**
 * Reembolso. `saleItemId` en null es un reembolso general de la venta (un
 * ajuste pactado); con valor, el dinero devuelto por una unidad concreta.
 * Lleva su propia tasa: la del dia en que sale el dinero.
 */
export const registerRefundSchema = z.object({
  saleItemId: uuid.nullable().optional().default(null),
  refundMethodId: uuid,
  currencyId: uuid,
  amount: positiveMoney,
  exchangeRate: exchangeRate.default(1),
  refundDate: dateOnly,
  reason: z.string().trim().min(3).max(500),
});

export const listSalesQuerySchema = paginationQuery.extend({
  search: z.string().trim().optional(),
  clientId: uuid.optional(),
  vehicleId: uuid.optional(),
  salespersonId: uuid.optional(),
  status: saleStatus.optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
});

export const salesSummaryQuerySchema = z.object({
  clientId: uuid.optional(),
  salespersonId: uuid.optional(),
  status: saleStatus.optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
});

export type CreateSaleBody = z.infer<typeof createSaleSchema>;
export type UpdateSaleBody = z.infer<typeof updateSaleSchema>;
export type AddSaleItemBody = z.infer<typeof addSaleItemSchema>;
export type UpdateSaleItemBody = z.infer<typeof updateSaleItemSchema>;
export type ReturnSaleItemBody = z.infer<typeof returnSaleItemSchema>;
export type RegisterPaymentBody = z.infer<typeof registerPaymentSchema>;
export type RegisterRefundBody = z.infer<typeof registerRefundSchema>;
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;
export type SalesSummaryQuery = z.infer<typeof salesSummaryQuerySchema>;
