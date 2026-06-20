// @ts-check
import { z } from 'zod';
import { DEFAULT_CATEGORIES } from './dal/sqliteCampaignRepository.js';

const isoDateOrNull = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), {
    message: 'must be an ISO 8601 date string',
  })
  .nullable();

const tagSchema = z.string().trim().min(1).max(32, 'Each tag must be at most 32 characters');

const tagsSchema = z.array(tagSchema).max(10, 'A campaign may have at most 10 tags').optional();

/**
 * @param {string[]} allowedCategories
 */
export function createCategorySchema(allowedCategories = DEFAULT_CATEGORIES) {
  return z
    .string()
    .trim()
    .refine((value) => allowedCategories.includes(value), {
      message: `category must be one of: ${allowedCategories.join(', ')}`,
    })
    .nullable()
    .optional();
}

const imageUrlSchema = z.string().url('imageUrl must be a valid URL').optional();

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
    referralBonusPoints: z
      .number()
      .int()
      .min(0, 'referralBonusPoints must be a non-negative integer')
      .optional(),
    startDate: isoDateOrNull.optional(),
    endDate: isoDateOrNull.optional(),
    contractId: z
      .string()
      .regex(/^C[A-Z2-7]{55}$/, 'contractId must be a valid Stellar contract ID (C...)')
      .nullable()
      .optional(),
    imageUrl: imageUrlSchema,
    tags: tagsSchema,
    category: createCategorySchema(),
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
    rewardPerAction: z
      .number()
      .finite()
      .min(0, 'rewardPerAction must be a non-negative number')
      .optional(),
    active: z.boolean().optional(),
    featured: z.boolean().optional(),
    hidden: z.boolean().optional(),
    hiddenReason: z.string().nullable().optional(),
    referralBonusPoints: z
      .number()
      .int()
      .min(0, 'referralBonusPoints must be a non-negative integer')
      .optional(),
    startDate: isoDateOrNull.optional(),
    endDate: isoDateOrNull.optional(),
    contractId: z
      .string()
      .regex(/^C[A-Z2-7]{55}$/, 'contractId must be a valid Stellar contract ID (C...)')
      .nullable()
      .optional(),
    imageUrl: imageUrlSchema,
    tags: tagsSchema,
    category: createCategorySchema(),
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

/** Schema for paginated list query parameters. */
export const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(50).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().positive().optional(),
    active: z.enum(['true', 'false']).optional(),
    q: z.string().optional(),
    tags: z.string().optional(),
    category: z.string().optional(),
  })
  .passthrough();

/** Schema for creating an API key. */
export const apiKeyCreateSchema = z.object({
  label: z.string().trim().max(128).optional(),
  expiresAt: isoDateOrNull.optional(),
});

/** Schema for the indexer cursor update body. */
export const cursorBodySchema = z.object({
  cursor: z.string().trim().min(1, 'cursor is required and must be a non-empty string'),
});

/** Schema for creating a campaign variant. */
export const variantCreateSchema = z.object({
  variantKey: z
    .string()
    .regex(/^[a-z0-9_]+$/, 'variantKey must be lowercase alphanumeric with underscores')
    .min(1)
    .max(50),
  name: z.string().trim().min(1, 'Name is required and must be a non-empty string'),
  description: z.string().optional(),
  trafficWeight: z
    .number()
    .int()
    .min(0, 'trafficWeight must be between 0 and 100')
    .max(100, 'trafficWeight must be between 0 and 100'),
  isControl: z.boolean().optional(),
  active: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

/** Schema for updating a campaign variant. */
export const variantUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  trafficWeight: z.number().int().min(0).max(100).optional(),
  isControl: z.boolean().optional(),
  active: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

/** Schema for assigning a user to a variant. */
export const variantAssignSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
  sticky: z.boolean().optional(),
});

/** Schema for tracking a variant result. */
export const variantResultSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
  metricName: z.string().trim().min(1, 'metricName is required'),
  metricValue: z.number().finite('metricValue must be a valid number'),
  metadata: z.record(z.unknown()).optional(),
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
