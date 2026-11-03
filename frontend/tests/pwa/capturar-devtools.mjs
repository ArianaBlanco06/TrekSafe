// Evidencia opcional en Edge/Windows del panel REAL Application > Cache storage.
// Solo fixtures locales. Ejecutar despues de build y sin otro servidor en 4174.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.resolve(root, '../docs/fixes/evidencias-67');
const base = 'http://127.0.0.1:4174';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = spawn(process.execPath, [path.join(root, 'tests/pwa/servidor.mjs')], {
  cwd: root, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'],
});
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    assert.ok(server.exitCode === null && attempt < 100, 'No inicio el servidor de evidencia');
    try { if ((await fetch(`${base}/__tests__/listo`)).ok) break; } catch {}
    await delay(100);
  }
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--auto-open-devtools-for-tabs', '--lang=en-US', '--window-size=1500,1000'] });
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 850 } })).newPage();
  await page.goto(`${base}/__tests__/vacio`);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/__tests__/legacy-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.evaluate(() => fetch('/api/usuario/ficha-medica', {
    headers: { Authorization: 'Bearer fixture-a' },
  }).then(response => response.json()));
  await delay(3000); // El frontend interno de DevTools debe terminar de iniciar.
  const rootCdp = await browser.newBrowserCDPSession();
  const target = (await rootCdp.send('Target.getTargets')).targetInfos.find(t => t.url.startsWith('devtools://'));
  assert.ok(target, 'Edge no abrio el frontend de DevTools');
  const { sessionId } = await rootCdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let id = 0;
  const pending = new Map();
  rootCdp.on('Target.receivedMessageFromTarget', event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  function command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const nextId = ++id;
      const timer = setTimeout(() => { pending.delete(nextId); reject(new Error(`DevTools: ${method}`)); }, 10000);
      pending.set(nextId, message => {
        clearTimeout(timer);
        message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
      });
      rootCdp.send('Target.sendMessageToTarget', {
        sessionId, message: JSON.stringify({ id: nextId, method, params }),
      }).catch(reject);
    });
  }
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  const deepItems = `const walk=root=>[...root.querySelectorAll('*')].flatMap(e=>[
    ...(e.shadowRoot?walk(e.shadowRoot):[]),...(e.matches('[role=treeitem]')?[e]:[])]);`;
  async function clickTreeItem(matcher, arrow = false) {
    const rect = await evaluate(`(()=>{${deepItems}
      const item=walk(document).find(e=>${matcher});
      if(!item) throw new Error('Elemento no encontrado');
      item.scrollIntoView(); const r=item.getBoundingClientRect();
      return {x:r.x,y:r.y,width:r.width,height:r.height}; })()`);
    assert.ok(rect.height > 0, 'Elemento de arbol oculto');
    const point = { x: rect.x + (arrow ? 8 : Math.min(60, rect.width / 2)), y: rect.y + rect.height / 2 };
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  }
  async function capture(file, name) {
    await evaluate(`(async()=>{const UI=await import('./ui/legacy/legacy.js');
      await UI.InspectorView.InspectorView.instance().showPanel('resources');
    })()`);
    const expanded = await evaluate(`(()=>{${deepItems}
      return walk(document).find(e=>e.title==='Cache storage')?.getAttribute('aria-expanded'); })()`);
    if (expanded !== 'true') await clickTreeItem("e.title==='Cache storage'", true);
    await delay(500);
    await clickTreeItem(`(e.title+' '+e.textContent).includes(${JSON.stringify(name)})`);
    await delay(500);
    const screenshot = await command('Page.captureScreenshot');
    await writeFile(path.join(output, file), Buffer.from(screenshot.data, 'base64'));
    console.log(`Captura DevTools: ${file}`);
  }
  await capture('01-antes-worker-vulnerable.png', 'treksafe-api');
  await page.goto(`${base}/iniciar-sesion`);
  await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js'));
  await page.waitForLoadState('networkidle');
  // El relevo del worker anterior provoca una recarga automatica de VitePWA.
  await delay(1000);
  await page.goto(`${base}/iniciar-sesion`);
  async function login(account) {
    await page.getByLabel('Correo electrónico', { exact: true }).fill(`cuenta-${account}@example.invalid`);
    await page.getByLabel('Contraseña', { exact: true }).fill('Fixture123!');
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await page.waitForURL(`${base}/senderista`);
    await page.waitForLoadState('networkidle');
    await page.goto(`${base}/senderista/perfil/medica`);
    await page.getByPlaceholder('Ej: Penicilina').waitFor();
    await page.waitForFunction(value => document.querySelector('input[placeholder="Ej: Penicilina"]').value === value,
      `alergia-privada-${account}`);
  }
  await login('a');
  const precache = await page.evaluate(async () => (await caches.keys()).find(name => name.startsWith('workbox-precache')));
  assert.ok(precache);
  assert.equal(await page.evaluate(() => caches.has('treksafe-api')), false);
  await capture('02-cuenta-a-api-sin-cache.png', precache);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.waitForURL(`${base}/iniciar-sesion`);
  await page.waitForFunction(async () => (await caches.keys()).every(name => !name.startsWith('treksafe-')));
  await capture('03-logout-solo-assets-publicos.png', precache);
  await login('b');
  await capture('04-cuenta-b-aislada.png', precache);
  await page.screenshot({ path: path.join(output, '05-cuenta-b-interfaz.png') });
  const inventory = await page.evaluate(async () => {
    const result = [];
    for (const name of await caches.keys()) result.push({ name,
      requests: (await (await caches.open(name)).keys()).map(request => request.url) });
    return result;
  });
  assert.ok(inventory.every(cache => cache.requests.every(url => !new URL(url).pathname.startsWith('/api/'))));
  await writeFile(path.join(output, 'inventario-cuenta-b.json'), JSON.stringify({
    fecha: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }),
    navegador: await browser.version(), cuentas: 'Dos cuentas ficticias, mismo contexto de navegador', inventory,
  }, null, 2) + '\n');
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    const exit = once(server, 'exit');
    server.kill();
    await exit;
  }
}
