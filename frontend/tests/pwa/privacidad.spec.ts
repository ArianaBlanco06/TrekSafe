import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { cerrarAyudaInstalacion } from '../helpers/ayudaInstalacion.js';

const users = {
  a: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', correoElectronico: 'cuenta-a@example.invalid', rol: 'senderista' },
  b: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', correoElectronico: 'cuenta-b@example.invalid', rol: 'senderista' },
};

async function workerActivo(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  // Si aun no llego controllerchange, navegar antes de empezar el formulario.
  if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js'))).toBe(true);
}

// HU-26 usa registerType 'prompt': el worker nuevo espera hasta que se acepte
// expresamente el relevo. La prueba lo acepta solo cuando no hay formulario abierto.
async function aceptarActualizacion(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return !!(registration?.waiting?.scriptURL.endsWith('/sw.js') || registration?.active?.scriptURL.endsWith('/sw.js'));
  }).catch(() => false)).toBe(true);
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.postMessage({ type: 'SKIP_WAITING' }));
  await expect.poll(() => page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return !!r?.active?.scriptURL.endsWith('/sw.js') && r.active.state === 'activated';
  }).catch(() => false)).toBe(true);
  await page.waitForLoadState('networkidle');
}

async function login(page: Page, account: 'a' | 'b' = 'a') {
  await page.goto('/iniciar-sesion');
  await cerrarAyudaInstalacion(page);
  await page.getByLabel('Correo electrónico', { exact: true }).fill(users[account].correoElectronico);
  await page.getByLabel('Contraseña', { exact: true }).fill('Fixture123!');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL('/senderista');
  await workerActivo(page);
}

async function inventario(page: Page) {
  return page.evaluate(async () => {
    const result: Array<{ cache: string; url: string; body: string }> = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        // El cuerpo solo se adjunta para datos ficticios, no para assets grandes.
        const text = name.startsWith('treksafe-') ? await (await cache.match(request))!.text() : '';
        result.push({ cache: name, url: request.url, body: text });
      }
    }
    return result;
  });
}

async function evidencia(page: Page, info: TestInfo, name: string) {
  const cdp = await page.context().newCDPSession(page);
  const { caches } = await cdp.send('CacheStorage.requestCacheNames', { securityOrigin: new URL(page.url()).origin });
  const entries = [];
  for (const cache of caches) {
    entries.push({ ...cache, ...(await cdp.send('CacheStorage.requestEntries', { cacheId: cache.cacheId })) });
  }
  await cdp.detach();
  const inventoryPath = info.outputPath(`${name}-cache-storage.json`);
  await writeFile(inventoryPath, JSON.stringify({ devtoolsProtocol: entries, inventario: await inventario(page) }, null, 2));
  await info.attach(`${name}-cache-storage.json`, { path: inventoryPath, contentType: 'application/json' });
  const screenshotPath = info.outputPath(`${name}-pantalla.png`);
  await page.screenshot({ path: screenshotPath });
  await info.attach(`${name}-pantalla.png`, { path: screenshotPath, contentType: 'image/png' });
}

async function guardarOffline(page: Page) {
  await page.goto('/senderista/expedicion/nueva');
  await expect(page.getByRole('checkbox', { name: /Contacto privado A/ })).toBeVisible();
  await page.getByRole('checkbox', { name: /Contacto privado A/ }).check();
  await page.getByLabel('Ubicación inicial', { exact: true }).fill('Inicio privado A');
  await page.getByLabel('Destino / Nevado', { exact: true }).fill('Destino privado A');
  await page.getByLabel('Fecha y hora de salida', { exact: true }).fill('2099-11-15T08:00');
  await page.getByLabel('Retorno estimado', { exact: true }).fill('2099-11-15T18:00');
  await page.getByPlaceholder('Nombre completo', { exact: true }).fill('Acompañante ficticio A');
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Guardar borrador offline', exact: true }).click();
  await expect(page.getByText('Borrador guardado para sincronizar', { exact: false })).toBeVisible();
}

test('retira caches y almacenamiento legacy sin importar datos sin propietario', async ({ page }) => {
  await page.goto('/__tests__/vacio');
  await page.evaluate(async () => {
    for (const name of ['treksafe-api', 'treksafe-offline-v1']) {
      await (await caches.open(name)).put('/api/usuario/ficha-medica', new Response('privado-legacy'));
    }
    const mixed = await caches.open('cache-mixta');
    await mixed.put('/api/usuario/contactos', new Response('contactos-legacy'));
    await mixed.put('/asset-publico.svg', new Response('<svg/>'));
    for (const key of ['treksafe:contacts-cache', 'treksafe-route-templates', 'treksafe-expedition-drafts',
      'treksafe:sw-fallback:contacts-cache']) localStorage.setItem(key, '["privado-legacy"]');
    localStorage.setItem('treksafe:theme', 'dark');
  });
  await page.goto('/iniciar-sesion');
  await workerActivo(page);
  const data = await inventario(page);
  expect(data.some(entry => /\/api\//.test(entry.url))).toBe(false);
  expect(data.some(entry => entry.body.includes('privado-legacy'))).toBe(false);
  expect(data.some(entry => entry.url.endsWith('/asset-publico.svg'))).toBe(true);
  expect(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('privado-legacy')))).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('treksafe:theme'))).toBe('dark');
});

test('actualizacion desde worker vulnerable elimina la ficha cacheada', async ({ page, context }, info) => {
  await page.goto('/__tests__/vacio');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/__tests__/legacy-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.evaluate(() => fetch('/api/usuario/ficha-medica', { headers: { Authorization: 'Bearer fixture-a' } }).then(r => r.json()));
  expect((await inventario(page)).some(entry => entry.url.endsWith('/api/usuario/ficha-medica'))).toBe(true);
  await evidencia(page, info, 'antes-worker-vulnerable');
  await page.goto('/iniciar-sesion');
  await aceptarActualizacion(page);
  await workerActivo(page);
  await expect.poll(() => page.evaluate(() => caches.has('treksafe-api'))).toBe(false);
  await evidencia(page, info, 'despues-worker-corregido');
  await context.setOffline(true);
  const result = await page.evaluate(async () => {
    try { return (await fetch('/api/usuario/ficha-medica', { cache: 'no-store' })).status; }
    catch { return 'sin-red'; }
  });
  expect(result).toBe('sin-red');
});

test('medicina, contactos, expediciones y rescate nunca tienen fallback de cache', async ({ page, context }, info) => {
  await login(page);
  await page.goto('/senderista/perfil/medica');
  await expect(page.getByPlaceholder('Ej: Penicilina')).toHaveValue('alergia-privada-a');
  await page.goto('/senderista/perfil/contactos');
  await expect(page.getByText('Contacto privado A', { exact: true })).toBeVisible();
  const urls = ['/api/usuario/ficha-medica', '/api/usuario/contactos', '/api/expediciones',
    // HU-36: el historial de cambios del plan contiene datos personales.
    '/api/expediciones/dddddddd-dddd-4ddd-8ddd-dddddddddddd/cambios', '/api/rescate/alertas', '/externo/perfil'];
  for (const url of urls) {
    expect(await page.evaluate(async endpoint => (await fetch(endpoint, {
      cache: 'no-store', headers: { Authorization: 'Bearer fixture-a' },
    })).status, url)).toBe(200);
  }
  expect((await inventario(page)).some(entry => urls.some(url => entry.url.endsWith(url)))).toBe(false);
  expect(await page.evaluate(() => Object.values(localStorage).some(value => /alergia-privada|contacto-a@example/.test(value)))).toBe(false);
  await evidencia(page, info, 'cuenta-a-sin-respuestas-api');
  await context.setOffline(true);
  for (const url of urls) {
    expect(await page.evaluate(async endpoint => {
      try { return (await fetch(endpoint, { cache: 'no-store', headers: { Authorization: 'Bearer fixture-a' } })).status; }
      catch { return 'sin-red'; }
    }, url)).toBe('sin-red');
  }
});

test('shell, plantillas y borradores propios funcionan offline y se sincronizan tras revisión explícita', async ({ page, context, request }) => {
  await login(page);
  await guardarOffline(page);
  expect((await inventario(page)).some(entry => entry.url.endsWith('/expedition-drafts') && entry.body.includes('Destino privado A'))).toBe(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nueva expedición' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Destino privado A', exact: true })).toBeVisible();
  await expect(page.getByText('1 borrador(es) pendiente(s) de sincronización.')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Contacto privado A/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Destino privado A', exact: true }).click();
  await expect(page.getByLabel('Ubicación inicial', { exact: true })).toHaveValue('Inicio privado A');
  await context.setOffline(false);
  await page.getByRole('link', { name: 'Revisar cola de borradores' }).click();
  await page.getByRole('button', { name: 'Revisar borrador', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Contacto privado A/ })).toBeChecked();
  await page.getByLabel('He revisado los contactos de alerta para esta nueva expedición.').check();
  await page.getByLabel('He revisado las fechas de salida y retorno para este borrador.').check();
  await page.getByRole('button', { name: 'Confirmar y sincronizar borrador' }).click();
  await expect(page.getByText('Borrador sincronizado. Puedes abrir su expedición.')).toBeVisible();
  const created = await (await request.get('/__tests__/creadas')).json();
  expect(created.some((entry: { account: string; lugarFin: string }) => entry.account === 'a' && entry.lugarFin === 'Destino privado A')).toBe(true);
});

test('dos cuentas en el mismo navegador: logout elimina datos privados y conserva la PWA', async ({ page, context }, info) => {
  await login(page);
  await guardarOffline(page);
  await evidencia(page, info, 'cuenta-a-borrador-propio');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL('/iniciar-sesion');
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter(name => name.startsWith('treksafe-')))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('treksafe:offline')))).toEqual([]);
  await evidencia(page, info, 'logout-sin-datos-privados');
  await page.reload();
  await cerrarAyudaInstalacion(page);
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await context.setOffline(false);
  await login(page, 'b');
  await page.goto('/senderista/perfil/medica');
  await expect(page.getByPlaceholder('Ej: Penicilina')).toHaveValue('alergia-privada-b');
  await page.goto('/senderista/perfil/contactos');
  await expect(page.getByText('Contacto privado B', { exact: true })).toBeVisible();
  await page.goto('/senderista/expedicion/nueva');
  await expect(page.getByRole('checkbox', { name: /Contacto privado B/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Destino privado A', exact: true })).toHaveCount(0);
  const stored = JSON.stringify(await inventario(page));
  expect(stored).not.toMatch(/alergia-privada-a|Contacto privado A|Destino privado A|Acompañante ficticio A/);
  await evidencia(page, info, 'cuenta-b-aislada');
  await context.setOffline(true);
  await page.goto('/senderista/perfil/medica');
  await expect(page.getByPlaceholder('Ej: Penicilina')).toHaveValue('');
});

test('una respuesta antigua o un 401 tardio no contaminan ni cierran la nueva sesion', async ({ page }) => {
  await page.goto('/__tests__/vacio');
  const results = await page.evaluate(async accounts => {
    const modulePath = '/__tests__/probe.js';
    const probe = await import(modulePath);
    const results = [];
    for (const suffix of ['?status=200', '?status=401', '?fase=cuerpo']) {
      probe.sesion.guardarSesion('fixture-a', accounts.a);
      const pending = probe.api.peticionApi(`/prueba-lenta${suffix}`, {}, true)
        .then(() => 'filtracion', (error: { codigo: string }) => error.codigo);
      await new Promise(resolve => setTimeout(resolve, 100));
      await probe.sesion.limpiarSesion();
      probe.sesion.guardarSesion('fixture-b', accounts.b);
      results.push({ result: await pending, token: probe.sesion.getToken() });
    }
    return results;
  }, users);
  expect(results).toEqual(Array.from({ length: 3 }, () => ({ result: 'SESSION_CHANGED', token: 'fixture-b' })));
});

test('una escritura pendiente no repuebla la cache despues de logout o cambio de cuenta', async ({ page }) => {
  await page.goto('/__tests__/vacio');
  const result = await page.evaluate(async accounts => {
    const modulePath = '/__tests__/probe.js';
    const probe = await import(modulePath);
    probe.sesion.guardarSesion('fixture-a', accounts.a);
    const originalPut = Cache.prototype.put;
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const waiting = new Promise<void>(resolve => { started = resolve; });
    Cache.prototype.put = async function(request, response) {
      started();
      await gate;
      return originalPut.call(this, request, response);
    };
    try {
      const pending = probe.offline.writeOfflineJson('expedition-drafts', [{ privado: 'cuenta-a' }]);
      await waiting;
      await probe.sesion.limpiarSesion();
      probe.sesion.guardarSesion('fixture-b', accounts.b);
      release();
      await pending;
      return { cacheNames: await caches.keys(), data: await probe.offline.readOfflineJson('expedition-drafts', []),
        local: Object.values(localStorage) };
    } finally { Cache.prototype.put = originalPut; }
  }, users);
  expect(result.cacheNames.filter(name => name.startsWith('treksafe-'))).toEqual([]);
  expect(result.data).toEqual([]);
  expect(result.local.some(value => value.includes('cuenta-a'))).toBe(false);
});

test('fallback local sin Cache API mantiene aislamiento y se borra al expirar la sesion', async ({ page }) => {
  await page.goto('/__tests__/vacio');
  const result = await page.evaluate(async accounts => {
    const modulePath = '/__tests__/probe.js';
    const probe = await import(modulePath);
    const original = CacheStorage.prototype.open;
    CacheStorage.prototype.open = async function(name) {
      if (name.startsWith('treksafe-offline-v2-')) throw new Error('CacheStorage no disponible');
      return original.call(this, name);
    };
    try {
      probe.sesion.guardarSesion('fixture-a', accounts.a);
      await probe.offline.writeOfflineJson('route-templates', [{ lugarFin: 'Plantilla A' }]);
      const own = await probe.offline.readOfflineJson('route-templates', []);
      await probe.contactos.cachearContactos([{ nombreCompleto: 'Contacto A' }]);
      await probe.sesion.limpiarSesion();
      probe.sesion.guardarSesion('fixture-b', accounts.b);
      return { own, other: await probe.offline.readOfflineJson('route-templates', []),
        contacts: await probe.contactos.obtenerContactosCacheados(), local: Object.values(localStorage) };
    } finally { CacheStorage.prototype.open = original; }
  }, users);
  expect(result.own).toEqual([{ lugarFin: 'Plantilla A' }]);
  expect(result.other).toEqual([]);
  expect(result.contacts).toEqual([]);
  expect(result.local).toEqual([]);
});

test('una lectura tardía no deja un caché del ámbito invalidado', async ({ page }) => {
  await page.goto('/__tests__/vacio');
  const result=await page.evaluate(async account=>{
    const modulePath='/__tests__/probe.js';
    const probe=await import(modulePath);
    probe.sesion.guardarSesion('fixture-a',account);
    const original=caches.match;
    let release!:()=>void;let started!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const waiting=new Promise<void>(resolve=>{started=resolve;});
    caches.match=async(_request,options)=>{
      started();await gate;
      if(!options?.cacheName) throw new Error('Falta ámbito');
      const cache=await caches.open(options.cacheName);
      await cache.put('/__treksafe_offline__/expedition-drafts',new Response('[]'));
      return new Response('[{"dato":"cuenta-a"}]');
    };
    try{
      const pending=probe.offline.readOfflineJson('expedition-drafts',[]);
      await waiting;await probe.sesion.limpiarSesion();release();
      return {datos:await pending,caches:await caches.keys()};
    }finally{caches.match=original;}
  },users.a);
  expect(result.datos).toEqual([]);
  expect(result.caches.filter(name=>name.startsWith('treksafe-offline-v2-'))).toEqual([]);
});

test('expiracion 401 limpia borradores y contactos igual que el cierre manual', async ({ page }) => {
  await login(page);
  await guardarOffline(page);
  await page.context().setOffline(false);
  // Devolver 401 a traves del servidor de fixtures, sin reemplazar el worker.
  await page.evaluate(() => sessionStorage.setItem('treksafe:token', 'fixture-expirado'));
  await page.goto('/senderista/perfil/contactos');
  await expect(page).toHaveURL('/iniciar-sesion');
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter(name => name.startsWith('treksafe-')))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('treksafe:offline')))).toEqual([]);
});
