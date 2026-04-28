// @ts-check
import { z } from 'zod';

const isoDateOrNull = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), {
    message: 'must be an ISO 8601 date string',
  })
  .nullable();

/** Schema for creating a new campaign. */
export const campaignCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required and must be a non-empty string'),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case (e.g., my-campaign-123)')
      .optional(),
    description: z.string().optional(),
    rewardPerAction: z
      .number({ required_error: 'rewardPerAction is required' })
      .finite()
      .min(0, 'rewardPerAction must be a non-negative number'),
    active: z.boolean().optional(),
    featured: z.boolean().optional(),
    hidden: z.boolean().optional(),
    hiddenReason: z.string().nullable().optional(),
    startDate: isoDateOrNull.optional(),
    endDate: isoDateOrNull.optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) < new Date(data.endDate);
      }
      return true;
    },
    {
      message: 'startDate must be before endDate',
      path: ['startDate'],
    },
  );

/** Schema for partially updating a campaign (all fields optional). */
export const campaignUpdateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name must be a non-empty string').optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case (e.g., my-campaign-123)')
      .optional(),
    description: z.string().optional(),
    rewardPerAction: z.number().finite().min(0, 'rewardPerAction must be a non-negative number').optional(),
    active: z.boolean().optional(),
    featured: z.boolean().optional(),
    hidden: z.boolean().optional(),
    hiddenReason: z.string().nullable().optional(),
    startDate: isoDateOrNull.optional(),
    endDate: isoDateOrNull.optional(),
  })
  .refine(
    (data) => {
      // In a partial update, we only check if both are provided in the update.
      // If only one is provided, we can't easily check against the DB value here.
      // But we can check if both are present in the payload.
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) < new Date(data.endDate);
      }
      return true;
    },
    {
      message: 'startDate must be before endDate',
      path: ['startDate'],
    },
  );


/** Schema for paginated list query parameters. */
export const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(50).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().positive().optional(),
    active: z.enum(['true', 'false']).optional(),
    q: z.string().optional(),
  })
  .passthrough();

/** Schema for the indexer cursor update body. */
export const cursorBodySchema = z.object({
  cursor: z.string().trim().min(1, 'cursor is required and must be a non-empty string'),
});

/**
 * Formats Zod validation errors as human-readable strings with field paths.
 * @param {import('zod').ZodError} error
 * @returns {string[]}
 */
export function formatZodErrors(error) {
  return error.errors.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
