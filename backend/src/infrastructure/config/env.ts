import { config } from 'dotenv';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// override: true → backend/.env tiene prioridad sobre PORT del sistema (evita 5010 vs 3000)
config({ path: path.resolve(__dirname, '../../../.env'), override: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  MEDICAL_ENCRYPTION_KEY: z.string().min(32),
  CRON_INTERVAL_MS: z.coerce.number().default(60_000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('TrekSafe Alertas <alertas@treksafe.pe>'),
  BREVO_API_KEY: z.string().default(''),
  MAIL_DEV_FALLBACK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Env = {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  databaseUrl?: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  medicalEncryptionKey: string;
  cronIntervalMs: number;
  corsOrigin: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  brevoApiKey: string;
  mailDevFallback: boolean;
};

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('[env] Invalid configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Missing or invalid environment variables. Check backend/.env');
  }

  const e = parsed.data;
  cached = {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    apiPrefix: e.API_PREFIX,
    supabaseUrl: e.SUPABASE_URL,
    supabaseServiceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY,
    databaseUrl: e.DATABASE_URL?.replace(/\s/g, ''),
    jwtSecret: e.JWT_SECRET,
    jwtExpiresIn: e.JWT_EXPIRES_IN,
    medicalEncryptionKey: e.MEDICAL_ENCRYPTION_KEY,
    cronIntervalMs: e.CRON_INTERVAL_MS,
    corsOrigin: e.CORS_ORIGIN,
    smtpHost: e.SMTP_HOST,
    smtpPort: e.SMTP_PORT,
    smtpSecure: e.SMTP_SECURE,
    smtpUser: e.SMTP_USER,
    smtpPass: e.SMTP_PASS,
    smtpFrom: e.SMTP_FROM,
    brevoApiKey: e.BREVO_API_KEY,
    mailDevFallback: e.MAIL_DEV_FALLBACK,
  };

  return cached;
}
