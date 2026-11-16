// Servidor exclusivo del runner aislado. Ejecuta createApp real, PostgREST
// nativo y el build PWA contra el cluster temporal; nunca ejecuta main/cron.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { closeSync, openSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config = JSON.parse(process.env.TREKSAFE_HU32_TEST_PG || 'null');
assert.ok(config?.host === '127.0.0.1' && config.user === 'treksafe_hu32_test'
  && config.database === 'postgres' && Number.isInteger(config.port) && config.port > 1024 && config.port !== 5432,
'Solo se admite el cluster temporal de HU-32');
const controlToken = process.env.TREKSAFE_HU32_CONTROL_TOKEN;
assert.ok(controlToken?.length >= 32 && process.send, 'Iniciar unicamente desde el runner con IPC y token de control');
const pool = new pg.Pool({ ...config, max: 4, application_name: 'hu32_integracion_control' });
const owner = '11111111-1111-4111-8111-111111111111';
const other = '33333333-3333-4333-8333-333333333333';
const plan = 'b1d0d5c0-8327-4af1-9cc1-2e83ae7e0320';
const contact = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const secret = 'secreto-exclusivo-cluster-temporal-hu32-000000000000';
const serviceKey = jwt.sign({ role: 'service_role' }, secret, { expiresIn: '1h' });
const app = express();
let backend;
let postgrest;
let stopping = false;
const safe = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const restPort = await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.on('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close(error => error ? reject(error) : resolve(port));
  });
});
const restUrl = `http://127.0.0.1:${restPort}`;

// El SDK Supabase conserva su ruta /rest/v1; PostgREST nativo sirve desde /.
// Solo se retira ese prefijo, sin simular consultas, joins, permisos o RPC.
app.use('/rest/v1', express.json({ limit: '100kb' }), safe(async (req, res) => {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers['content-length'];
  delete headers.connection;
  const upstream = await fetch(`${restUrl}${req.url}`, {
    method: req.method, headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
  });
  res.status(upstream.status);
  for (const name of ['content-type', 'content-range', 'preference-applied']) {
    if (upstream.headers.has(name)) res.setHeader(name, upstream.headers.get(name));
  }
  res.end(Buffer.from(await upstream.arrayBuffer()));
}));

// Operaciones de fixture, inaccesibles sin el nonce del runner y ausentes en
// la aplicacion de produccion. Todas usan parametros y tablas de esta base.
app.use('/__hu32__', express.json(), (req, res, next) => {
  if (req.header('x-hu32-control') !== controlToken) return res.sendStatus(403);
  next();
});
app.post('/__hu32__/reset', safe(async (_req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TRIGGER IF EXISTS hu32_integracion_fallo ON public.expediciones');
    await client.query('DROP FUNCTION IF EXISTS public.hu32_integracion_fallar()');
    await client.query('DELETE FROM public.expediciones WHERE senderista_id=ANY($1::uuid[])', [[owner, other]]);
    await client.query('DELETE FROM public.fichas_medicas WHERE senderista_id=ANY($1::uuid[])', [[owner, other]]);
    await client.query(`UPDATE public.usuarios SET hash_contrasena=(SELECT hash_contrasena FROM public.usuarios WHERE id=$1) WHERE id=$2`, [owner, other]);
    await client.query(`INSERT INTO public.contactos_emergencia(id,senderista_id,nombre_completo,parentesco,telefono,correo_electronico)
      VALUES($1,$2,'Contacto ficticio','Amistad','999999999','contacto@example.invalid') ON CONFLICT(id) DO NOTHING`, [contact, owner]);
    await client.query(`INSERT INTO public.expediciones(id,senderista_id,lugar_inicio,lugar_fin,coordenadas_inicio,
      coordenadas_fin,hora_inicio,hora_retorno_estimada,estado)
      VALUES($1,$2,'Cebollapampa','Laguna 69','-9.04500, -77.60800','-9.01050, -77.60420',
      '2099-11-15T12:00:00Z','2099-11-15T18:00:00Z','programada')`, [plan, owner]);
    await client.query('INSERT INTO public.vinculos_expedicion_contacto(expedicion_id,contacto_id) VALUES($1,$2)', [plan, contact]);
    await client.query(`INSERT INTO public.acompanantes_expedicion(expedicion_id,nombre_acompanante) VALUES($1,'Compañero ficticio')`, [plan]);
    await client.query('COMMIT');
    res.json({ planId: plan, contactId: contact });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}));
app.get('/__hu32__/snapshot/:id', safe(async (req, res) => {
  const result = await pool.query(`SELECT jsonb_build_object('plan',to_jsonb(e),'puntos',coalesce((
    SELECT jsonb_agg(to_jsonb(p) ORDER BY p.orden) FROM public.puntos_ruta p WHERE p.expedicion_id=e.id),'[]'::jsonb),
    'acompanantes',(SELECT jsonb_agg(to_jsonb(a)) FROM public.acompanantes_expedicion a WHERE a.expedicion_id=e.id),
    'contactos',(SELECT jsonb_agg(to_jsonb(v)) FROM public.vinculos_expedicion_contacto v WHERE v.expedicion_id=e.id)) AS value
    FROM public.expediciones e WHERE e.id=$1 AND e.senderista_id=ANY($2::uuid[])`, [req.params.id, [owner, other]]);
  res.json(result.rows[0]?.value ?? null);
}));
app.post('/__hu32__/estado', safe(async (req, res) => {
  assert.ok(['programada', 'en_progreso', 'alerta', 'completada'].includes(req.body.estado));
  const result = await pool.query(`UPDATE public.expediciones SET estado=$2,
    hora_inicio=CASE WHEN $3::boolean THEN clock_timestamp()-interval '1 second' ELSE hora_inicio END
    WHERE id=$1 AND senderista_id=$4 RETURNING id`, [req.body.id ?? plan, req.body.estado, req.body.salidaPasada === true, owner]);
  res.json({ modificadas: result.rowCount });
}));
app.post('/__hu32__/fallo', safe(async (req, res) => {
  await pool.query('DROP TRIGGER IF EXISTS hu32_integracion_fallo ON public.expediciones');
  await pool.query('DROP FUNCTION IF EXISTS public.hu32_integracion_fallar()');
  if (req.body.activar === true) {
    await pool.query(`CREATE FUNCTION public.hu32_integracion_fallar() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN RAISE EXCEPTION 'HU32_INTEGRACION_FALLO'; END; $f$;
      CREATE TRIGGER hu32_integracion_fallo BEFORE UPDATE ON public.expediciones FOR EACH ROW
      WHEN (NEW.id='${plan}'::uuid AND NEW.version>OLD.version) EXECUTE FUNCTION public.hu32_integracion_fallar();`);
  }
  res.json({ activo: req.body.activar === true });
}));

app.use((req, res, next) => req.path.startsWith('/api/') && backend ? backend(req, res, next) : next());
app.use(express.static(path.join(root, 'frontend/dist')));
app.get('*', (_req, res) => res.sendFile(path.join(root, 'frontend/dist/index.html')));
app.use((error, _req, res, _next) => {
  console.error('Error en entorno temporal HU-32:', error.message);
  res.status(500).json({ mensaje: 'Error en el entorno de pruebas' });
});
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}`;

async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  if (postgrest?.pid && postgrest.exitCode === null && postgrest.signalCode === null) {
    const exited = once(postgrest, 'exit');
    postgrest.kill();
    await exited;
  }
  await pool.end();
  if (process.connected) process.disconnect();
}
process.on('message', message => { if (message === 'stop') void shutdown(); });
process.on('disconnect', () => { void shutdown(); });

try {
  const restEnv = { ...process.env };
  for (const key of Object.keys(restEnv)) if (/^(PG|PGRST_)/i.test(key)) delete restEnv[key];
  Object.assign(restEnv, {
    PGRST_DB_URI: `postgres://${config.user}@127.0.0.1:${config.port}/postgres`,
    PGRST_DB_SCHEMAS: 'public', PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: secret,
    PGRST_SERVER_HOST: '127.0.0.1', PGRST_SERVER_PORT: String(restPort),
    PGRST_DB_CONFIG: 'false', PGRST_DB_POOL: '4',
  });
  const pathKey = Object.keys(restEnv).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
  restEnv[pathKey] = `${process.env.TREKSAFE_HU32_PG_BIN}${path.delimiter}${restEnv[pathKey] ?? ''}`;
  const log = openSync(process.env.TREKSAFE_HU32_POSTGREST_LOG, 'a');
  postgrest = spawn(process.env.TREKSAFE_HU32_POSTGREST_BIN, [], {
    env: restEnv, windowsHide: true, stdio: ['ignore', log, log],
  });
  closeSync(log);
  await once(postgrest, 'spawn');
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (postgrest.exitCode !== null) break;
    try { ready = (await fetch(restUrl, { headers: { Authorization: `Bearer ${serviceKey}` } })).ok; } catch {}
    if (ready) break;
    await delay(100);
  }
  assert.ok(ready, 'PostgREST no inicio: revisar el log del entorno temporal');

  // Cargar el modulo de configuracion antes de fijar valores ficticios. El
  // loader historico puede leer .env; se sustituyen TODOS sus campos antes de
  // llenar su cache y antes de importar repositorios o createApp.
  const { loadEnv } = await import(pathToFileURL(path.join(root, 'backend/dist/infrastructure/config/env.js')).href);
  Object.assign(process.env, {
    NODE_ENV: 'test', PORT: '0', API_PREFIX: '/api', SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    JWT_SECRET: secret, JWT_EXPIRES_IN: '1h', MEDICAL_ENCRYPTION_KEY: secret,
    CRON_INTERVAL_MS: '60000', CORS_ORIGIN: url, BREVO_API_KEY: '', SMTP_HOST: '', SMTP_USER: '',
    SMTP_PASS: '', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_FROM: 'pruebas@example.invalid', MAIL_DEV_FALLBACK: 'true',
  });
  delete process.env.DATABASE_URL;
  loadEnv();
  const { createApp } = await import(pathToFileURL(path.join(root, 'backend/dist/presentation/http/app.js')).href);
  backend = createApp();
  process.send({ type: 'ready', url });
} catch (error) {
  console.error(error.message);
  await shutdown();
  process.exitCode = 1;
}
