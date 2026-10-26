import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce
    .number({ error: 'page must be a number' })
    .int('page must be an integer')
    .min(1, 'page must be at least 1')
    .default(1),
  limit: z.coerce
    .number({ error: 'limit must be a number' })
    .int('limit must be an integer')
    .min(1, 'limit must be at least 1')
    .max(MAX_PAGE_SIZE, `limit must not exceed ${MAX_PAGE_SIZE}`)
    .default(DEFAULT_PAGE_SIZE),
});

export const paginationMetaSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total_records: z.number().int(),
  total_pages: z.number().int(),
  has_next_page: z.boolean(),
  has_previous_page: z.boolean(),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export function buildPaginationMeta(page: number, limit: number, totalRecords: number): PaginationMeta {
  const totalPages = Math.ceil(totalRecords / limit);
  return {
    page,
    limit,
    total_records: totalRecords,
    total_pages: totalPages,
    has_next_page: page < totalPages,
    has_previous_page: page > 1,
  };
}

export const toOffset = (page: number, limit: number): number => (page - 1) * limit;
