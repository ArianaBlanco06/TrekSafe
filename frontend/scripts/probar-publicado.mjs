import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const modo = process.argv[2] ?? 'aceptacion';
if (!['lectura', 'aceptacion'].includes(modo)) throw new Error('Modo publicado inválido.');
const resultado = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)),
  'test', '--config', 'playwright.publicado.config.ts', ...process.argv.slice(3)], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, TREKSAFE_PUBLICADO_MODO: modo,
    DEBUG: '', PWDEBUG: '0', PLAYWRIGHT_NO_COPY_PROMPT: '1' }, stdio: 'inherit',
});
process.exit(resultado.status ?? 1);
