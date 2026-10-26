import { z } from 'zod';

/** Distinguishes "field missing" from "field has the wrong type" in validation messages. */
export const fieldError =
  (field: string, expectation: string) =>
  (issue: { input?: unknown }): string =>
    issue.input === undefined ? `${field} is required` : `${field} must be ${expectation}`;

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
    request_id: z.string(),
  })
  .describe('Error (see `error.code` for the reason)');

export const uuidSchema = (field: string) => z.uuid({ error: fieldError(field, 'a valid UUID') });

export const accountIdParamsSchema = z.object({
  accountId: uuidSchema('accountId'),
});

export const referenceIdSchema = z
  .string({ error: fieldError('reference_id', 'a string') })
  .trim()
  .min(1, 'reference_id must not be empty')
  .max(100, 'reference_id must be at most 100 characters')
  .meta({
    description: 'Client-supplied idempotency key, unique per account',
    example: 'salary-2026-10',
  });

export const descriptionSchema = z
  .string({ error: fieldError('description', 'a string') })
  .trim()
  .max(255, 'description must be at most 255 characters')
  .meta({ example: 'October salary' })
  .nullish()
  .transform((value) => (value ? value : null));
