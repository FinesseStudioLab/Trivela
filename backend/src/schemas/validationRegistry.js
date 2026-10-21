// @ts-check
import { z } from 'zod';

export const validationRegistry = {
  request: {
    pagination: z.object({
      limit: z.coerce.number().int().min(1).max(1000).default(10),
      offset: z.coerce.number().int().min(0).default(0),
      cursor: z.string().optional(),
    }),

    identifiers: z.object({
      id: z.string().trim().min(1),
      userId: z.string().trim().min(1),
      email: z.string().email('Invalid email format'),
      campaignId: z.string().trim().min(1),
    }),

    filters: z.object({
      status: z.enum(['active', 'inactive', 'archived']).optional(),
      category: z.string().optional(),
      search: z.string().max(255).optional(),
    }),
  },

  response: {
    error: z.object({
      error: z.string(),
      code: z.string(),
      details: z.array(z.object({
        field: z.string().optional(),
        message: z.string(),
        code: z.string().optional(),
      })).optional(),
    }),

    success: z.object({
      data: z.unknown(),
      meta: z.object({
        timestamp: z.string(),
        version: z.string().optional(),
      }).optional(),
    }),
  },

  auth: {
    credentials: z.object({
      email: z.string().email('Invalid email'),
      password: z.string().min(8, 'Password must be at least 8 characters'),
    }),

    token: z.object({
      token: z.string().min(1),
      expiresAt: z.string().datetime().optional(),
      type: z.enum(['Bearer', 'Basic']).default('Bearer'),
    }),
  },
};

export const createValidationSchema = (registry, path) => {
  const keys = path.split('.');
  let schema = registry;
  for (const key of keys) {
    schema = schema[key];
    if (!schema) throw new Error(`Schema not found at path: ${path}`);
  }
  return schema;
};
