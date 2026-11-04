// Comprobacion opcional de limites entre ramas, sin Git ni SQL. No sustituye
// una integracion aprobada: copia codigo a test-results, usando commits fijados.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sources = JSON.parse(await readFile(path.join(root, 'frontend/tests/compatibilidad/origenes.json'), 'utf8'));
const parent = path.join(root, 'frontend/test-results/compatibilidad');
await mkdir(parent, { recursive: true });
const workspace = await mkdtemp(path.join(parent, 'integracion-'));
console.log(`Copia aislada: ${workspace}`);
for (const project of ['frontend', 'backend']) {
  const dest = path.join(workspace, project);
  await mkdir(dest);
  await cp(path.join(root, project, 'src'), path.join(dest, 'src'), { recursive: true });
  for (const file of ['package.json', 'tsconfig.json']) await cp(path.join(root, project, file), path.join(dest, file));
  await symlink(path.join(root, project, 'node_modules'), path.join(dest, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir');
}
async function remote(sha, file) {
  const response = await fetch(`https://raw.githubusercontent.com/${sources.repo}/${sha}/${file}`);
  assert.ok(response.ok, `No se pudo leer ${file}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
const originalValidator = await remote(sources.hu29.sha, 'frontend/src/lib/plantillasCuentaLogica.ts');
assert.deepEqual(await readFile(path.join(root, 'frontend/src/lib/plantillasCuentaLogica.ts')), originalValidator,
  'El validador debe coincidir con la version original revisada de HU-29');
const originalAdapter = await remote(sources.hu29.sha, 'frontend/src/lib/cachePlantillasCuenta.ts');
assert.deepEqual(await readFile(path.join(root, 'frontend/tests/compatibilidad/hu29/cachePlantillasCuenta.ts')), originalAdapter);
await writeFile(path.join(workspace, 'frontend/src/lib/cachePlantillasCuenta.ts'), originalAdapter);
await writeFile(path.join(workspace, 'frontend/src/lib/plantillasCuentaLogica.test.ts'),
  await remote(sources.hu29.sha, 'frontend/src/lib/plantillasCuentaLogica.test.ts'));
const fingerprints = [];
// Solo TypeScript previamente listado. Nunca se descargan .env ni migraciones.
for (let index = 0; index < sources.hu30.files.length; index += 6) {
  const batch = sources.hu30.files.slice(index, index + 6);
  const results = await Promise.allSettled(batch.map(async file => {
    assert.match(file, /^(frontend|backend)\/src\/.+\.tsx?$/);
    const target = path.resolve(workspace, file);
    assert.ok(target.startsWith(workspace + path.sep));
    const content = await remote(sources.hu30.sha, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
    fingerprints.push({ file, sha256: createHash('sha256').update(content).digest('hex') });
  }));
  for (const result of results) if (result.status === 'rejected') throw result.reason;
}
await writeFile(path.join(workspace, 'origenes.json'), JSON.stringify({ ...sources, fingerprints }, null, 2));

const env = { ...process.env, NODE_ENV: 'test', SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-integracion-sin-base',
  JWT_SECRET: 'secreto-ficticio-compatibilidad-000000000000000',
  MEDICAL_ENCRYPTION_KEY: 'clave-medica-ficticia-compatibilidad-000000000000',
  CRON_ENABLED: 'false', BREVO_API_KEY: '', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' };
delete env.HU30_TEST_DATABASE_URL;
delete env.DATABASE_URL;
for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('PG')) delete env[key];
const runFile = promisify(execFile);
async function check(name, project, args) {
  try {
    const { stdout, stderr } = await runFile(process.execPath, args, {
      cwd: path.join(workspace, project), env, windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024,
    });
    await writeFile(path.join(workspace, `${name}.log`), stdout + stderr);
    console.log(`${name}: aprobado`);
    console.log(stdout.split('\n').filter(line => /^# (tests|pass|fail|skipped)/.test(line)).join('\n'));
  } catch (error) {
    await writeFile(path.join(workspace, `${name}.log`), (error.stdout || '') + (error.stderr || '') + error.message);
    throw new Error(`${name} fallo. Revisar ${workspace}/${name}.log`);
  }
}
await check('typecheck-backend-integrado', 'backend', ['node_modules/typescript/bin/tsc', '--noEmit']);
await check('typecheck-frontend-integrado', 'frontend', ['node_modules/typescript/bin/tsc', '--noEmit']);
await check('backend-integrado', 'backend', ['--import', 'tsx', '--test', 'src/**/*.test.ts']);
// Ejecutar el comando npm exacto de HU-30 cuando se invoca este runner con npm.
const equipoArgs = process.env.npm_execpath
  ? [process.env.npm_execpath, 'run', 'test:equipo']
  : ['node_modules/tsx/dist/cli.mjs', '--tsconfig', 'tsconfig.json', '--test', 'src/**/*.test.ts', 'src/**/*.test.tsx'];
await check('hu29-hu30-tsx', 'frontend', equipoArgs);
console.log('Comprobacion terminada. No se ejecutaron SQL ni Git; no se iniciaron main.ts ni el cron real.');
