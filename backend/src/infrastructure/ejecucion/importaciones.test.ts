import assert from 'node:assert/strict';
import { it } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ejecutar = promisify(execFile);
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

it('importar entradas, composición y aplicación no carga .env, abre conexiones ni inicia trabajo', async () => {
  const entorno = { ...process.env };
  for (const key of Object.keys(entorno)) {
    if (
      /^(SUPABASE_|JWT_|MEDICAL_|SMTP_|BREVO_|CRON_|DATABASE_URL|DOTENV_)/.test(
        key,
      )
    )
      delete entorno[key];
  }
  const urls = [
    'api.ts',
    'worker.ts',
    'main.ts',
    'presentation/http/app.ts',
    'infrastructure/composicion/http.ts',
    'infrastructure/composicion/servicios.ts',
  ].map((file) => pathToFileURL(path.join(src, file)).href);
  const script = `
    import fs from 'node:fs';
    import net from 'node:net';
    let envReads = 0, fetches = 0, listens = 0, timers = 0;
    const read = fs.readFileSync;
    fs.readFileSync = function(file, ...args) {
      if (String(file).replaceAll('\\\\', '/').endsWith('/backend/.env')) envReads++;
      return read.call(this, file, ...args);
    };
    globalThis.fetch = async () => { fetches++; throw new Error('red no autorizada'); };
    net.Server.prototype.listen = function() { listens++; throw new Error('HTTP no autorizado'); };
    globalThis.setInterval = () => { timers++; throw new Error('timer no autorizado'); };
    const int = process.listenerCount('SIGINT'), term = process.listenerCount('SIGTERM');
    for (const url of ${JSON.stringify(urls)}) await import(url);
    console.log(JSON.stringify({envReads, fetches, listens, timers,
      signals: process.listenerCount('SIGINT') - int + process.listenerCount('SIGTERM') - term}));
  `;
  const { stdout, stderr } = await ejecutar(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', script],
    {
      cwd: path.resolve(src, '..'),
      env: entorno,
      windowsHide: true,
      timeout: 20_000,
    },
  );
  assert.equal(stderr, '');
  assert.deepEqual(JSON.parse(stdout.trim()), {
    envReads: 0,
    fetches: 0,
    listens: 0,
    timers: 0,
    signals: 0,
  });
});

it('aplicación y dominio no vuelven a depender de adaptadores o frameworks de infraestructura', () => {
  const archivos = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? archivos(path.join(dir, entry.name))
        : entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
          ? [path.join(dir, entry.name)]
          : [],
    );
  for (const file of [
    ...archivos(path.join(src, 'application')),
    ...archivos(path.join(src, 'domain')),
  ]) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g,
    )) {
      assert.doesNotMatch(
        match[1]!,
        /(?:infrastructure\/|@supabase|^express$|^nodemailer$|^pg$|^bcrypt$|^jsonwebtoken$)/,
        `Dependencia invertida en ${path.relative(src, file)}`,
      );
    }
  }
});
