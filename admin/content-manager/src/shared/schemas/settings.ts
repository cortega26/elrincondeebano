import { z } from 'zod';

export const managerSettingsSchema = z.object({
  repoRoot: z.string().min(1),
  dataDir: z.string().optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  port: z.number().int().positive().max(65535).default(3000),
  host: z.string().default('127.0.0.1'),
});

export type ManagerSettings = z.infer<typeof managerSettingsSchema>;

export const defaultSettings: ManagerSettings = {
  repoRoot: '',
  logLevel: 'info',
  port: 3000,
  host: '127.0.0.1',
};
