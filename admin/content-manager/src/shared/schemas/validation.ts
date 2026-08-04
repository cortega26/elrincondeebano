import { z } from 'zod';

export const validationSeveritySchema = z.enum(['error', 'warning', 'info']);

export type ValidationSeverity = z.infer<typeof validationSeveritySchema>;

export const validationIssueSchema = z.object({
  severity: validationSeveritySchema,
  file: z.string(),
  entity_type: z.enum([
    'product',
    'category',
    'subcategory',
    'nav_group',
    'bundle',
    'featured',
    'media',
  ]),
  entity_id: z.string().optional(),
  field: z.string().optional(),
  code: z.string(),
  message: z.string(),
  action: z.enum(['fix', 'review', 'retry']).optional(),
});

export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const validationResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(validationIssueSchema),
  summary: z.object({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    info: z.number().int().nonnegative(),
  }),
  inspected_at: z.string(),
});

export type ValidationResult = z.infer<typeof validationResultSchema>;

export function createIssue(
  severity: ValidationSeverity,
  file: string,
  entity_type: ValidationIssue['entity_type'],
  code: string,
  message: string,
  opts?: { entity_id?: string; field?: string; action?: ValidationIssue['action'] }
): ValidationIssue {
  return {
    severity,
    file,
    entity_type,
    code,
    message,
    entity_id: opts?.entity_id,
    field: opts?.field,
    action: opts?.action,
  };
}

export function summarizeValidation(
  issues: ValidationIssue[],
  inspectedAt?: string
): ValidationResult {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const info = issues.filter((i) => i.severity === 'info').length;

  return {
    valid: errors === 0,
    issues,
    summary: { errors, warnings, info },
    inspected_at: inspectedAt ?? new Date().toISOString(),
  };
}
