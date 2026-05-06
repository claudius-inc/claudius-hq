/**
 * Zod schemas for /api/acp/* request bodies. Centralized so the constraints
 * (name format, price range, description length) live in one place.
 *
 * Note on idempotency: all the offering write paths upsert by `name`, so
 * accidental retries with the same body produce no duplicate state. Explicit
 * Idempotency-Key support would only be valuable for non-upsert side effects
 * (which we don't have here). If we add a "delete + recreate" path later,
 * revisit.
 */

import { z } from "zod";

export const OfferingNameSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9_]+$/, "must be snake_case (lowercase, digits, underscore)");

export const PriceSchema = z.number().nonnegative().max(100);

export const DescriptionSchema = z.string().max(500);

const RequirementsSchema = z.union([
  z.string().max(8000),
  z.record(z.string(), z.unknown()),
]);

export const CreateOfferingBodySchema = z.object({
  name: OfferingNameSchema,
  description: DescriptionSchema.optional(),
  price: PriceSchema,
  category: z.string().max(40).optional(),
  handlerPath: z.string().max(80).optional(),
  requirements: RequirementsSchema.optional(),
  deliverable: z.string().max(8000).optional(),
  requiredFunds: z.boolean().optional(),
  publish: z.boolean().optional(),
});

export const BulkSyncBodySchema = z.object({
  offerings: z
    .array(
      z.object({
        name: OfferingNameSchema,
        description: DescriptionSchema.optional(),
        price: PriceSchema,
        category: z.string().max(40).optional(),
        isActive: z.union([z.number().int().min(0).max(1), z.boolean()]).optional(),
        handlerPath: z.string().max(80).optional(),
        requirements: RequirementsSchema.optional(),
        deliverable: z.string().max(8000).optional(),
        requiredFunds: z.union([z.number().int().min(0).max(1), z.boolean()]).optional(),
      })
    )
    .min(1)
    .max(50),
});

export const PatchOfferingBodySchema = z.object({
  name: OfferingNameSchema,
  listedOnAcp: z.boolean().optional(),
  price: PriceSchema.optional(),
  description: DescriptionSchema.optional(),
  isActive: z.union([z.number().int().min(0).max(1), z.boolean()]).optional(),
  jobCount: z.number().int().nonnegative().optional(),
  totalRevenue: z.number().nonnegative().optional(),
  doNotRelist: z.union([z.number().int().min(0).max(1), z.boolean()]).optional(),
  category: z.string().max(40).optional(),
});

export const PublishBodySchema = z.object({ name: OfferingNameSchema });

export const SyncBodySchema = z.object({
  offerings: z
    .array(
      z.object({
        name: OfferingNameSchema,
        description: DescriptionSchema.optional(),
        price: PriceSchema.optional(),
        isListed: z.boolean(),
        jobCount: z.number().int().nonnegative().optional(),
        totalRevenue: z.number().nonnegative().optional(),
        category: z.string().max(40).optional(),
      })
    )
    .min(1)
    .max(50),
});

/**
 * Format a ZodError as a single-line string suitable for an HTTP error body.
 */
export function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}
