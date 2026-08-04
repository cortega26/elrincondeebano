import { z } from 'zod';

export const productReferenceSchema = z.object({
  category: z.string(),
  name: z.string(),
});

export type ProductReference = z.infer<typeof productReferenceSchema>;

export const storefrontBundleSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  items: z.array(productReferenceSchema),
  bundlePrice: z.number().nonnegative().optional(),
});

export type StorefrontBundle = z.infer<typeof storefrontBundleSchema>;

export const storefrontTrustItemSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const storefrontCompanionRuleSchema = z.object({
  sourceCategories: z.array(z.string()),
  targets: z.array(productReferenceSchema),
});

export const storefrontExperienceSchema = z.object({
  trustBar: z.object({
    highlights: z.array(storefrontTrustItemSchema),
    statusItems: z.array(storefrontTrustItemSchema),
  }),
  home: z.object({
    primaryCategories: z.array(z.string()),
    secondaryCategories: z.array(z.string()),
    fallbackQuickPicks: z.array(productReferenceSchema),
    featuredStaples: z.array(productReferenceSchema),
  }),
  bundles: z.array(storefrontBundleSchema),
  companionRules: z.array(storefrontCompanionRuleSchema),
});

export type StorefrontExperience = z.infer<typeof storefrontExperienceSchema>;
