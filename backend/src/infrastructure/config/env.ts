import { config } from 'dotenv';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Los secretos/configuración del proceso desplegado tienen prioridad sobre archivos locales.
export function inicializarEntorno(): void {
  config({ path: path.resolve(__dirname, '../../../.env'), override: false });
  cached = null;
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  MEDICAL_ENCRYPTION_KEY: z.string().min(32),
  CRON_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).default(60_000),
  CRON_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  OUTBOX_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(4).default(1),
  WORKER_HEARTBEAT_MAX_AGE_MS: z.coerce.number().int().min(90000).max(86400000).default(180000),
  OUTBOX_PENDING_MAX_AGE_MS: z.coerce.number().int().min(60000).max(86400000).default(600000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  PUBLIC_APP_URL: z.string().url().optional(),
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
    .default('false')
    .transform((v) => v === 'true'),
}).superRefine((env, contexto) => {
  if (env.NODE_ENV === 'production' && env.MAIL_DEV_FALLBACK) {
    contexto.addIssue({ code: 'custom', path: ['MAIL_DEV_FALLBACK'], message: 'Debe ser false en producción' });
  }
  if (env.PUBLIC_APP_URL) {
    const origen = new URL(env.PUBLIC_APP_URL);
    if (!['https:', 'http:'].includes(origen.protocol) || origen.username || origen.password ||
      origen.pathname !== '/' || origen.search || origen.hash ||
      (env.NODE_ENV === 'production' && origen.protocol !== 'https:')) {
      contexto.addIssue({ code: 'custom', path: ['PUBLIC_APP_URL'], message: 'Debe ser un origen web sin credenciales, ruta ni parámetros; HTTPS en producción' });
    }
  }
  if (env.NODE_ENV === 'production' && env.CRON_ENABLED && !env.PUBLIC_APP_URL) {
    contexto.addIssue({ code: 'custom', path: ['PUBLIC_APP_URL'], message: 'Origen HTTPS explícito requerido para el worker publicado' });
  }
  if (env.WORKER_HEARTBEAT_MAX_AGE_MS <= Math.max(
    env.CRON_INTERVAL_MS + 30000,
    // Consulta y heartbeat: 10s cada uno. Por ítem: tres RPC10s + transporte30s.
    env.OUTBOX_INTERVAL_MS + 20000 + env.OUTBOX_BATCH_SIZE * 60000,
  )) {
    contexto.addIssue({ code: 'custom', path: ['WORKER_HEARTBEAT_MAX_AGE_MS'], message: 'Debe superar intervalo y duración máxima del ciclo' });
  }
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
  cronEnabled: boolean;
  outboxIntervalMs: number;
  outboxBatchSize: number;
  workerHeartbeatMaxAgeMs: number;
  outboxPendingMaxAgeMs: number;
  corsOrigin: string;
  publicAppUrl?: string;
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
    cronEnabled: e.CRON_ENABLED,
    outboxIntervalMs: e.OUTBOX_INTERVAL_MS,
    outboxBatchSize: e.OUTBOX_BATCH_SIZE,
    workerHeartbeatMaxAgeMs: e.WORKER_HEARTBEAT_MAX_AGE_MS,
    outboxPendingMaxAgeMs: e.OUTBOX_PENDING_MAX_AGE_MS,
    corsOrigin: e.CORS_ORIGIN,
    publicAppUrl: e.PUBLIC_APP_URL,
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
