import { z } from 'zod';
import { booleanQuery, requiredString } from '../shared/common.schemas';

export const listCatalogsQuerySchema = z.object({ includeInactive: booleanQuery });

export const createExpenseCategorySchema = z.object({
  name: requiredString(100, 'El nombre de la categoria'),
  scope: z.enum(['general', 'vehicle']),
});

export type ListCatalogsQuery = z.infer<typeof listCatalogsQuerySchema>;
export type CreateExpenseCategoryBody = z.infer<typeof createExpenseCategorySchema>;
