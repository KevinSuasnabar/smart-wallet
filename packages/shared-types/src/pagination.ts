import { z } from 'zod';

export const zCursor = z.string().min(1).optional();

export const zLimit = z.coerce
  .number()
  .int()
  .min(1)
  .max(100)
  .default(50);

export function zPaginatedResponse<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().optional(),
  });
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
}
