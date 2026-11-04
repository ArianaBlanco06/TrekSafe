// API ficticia para probar el worker REAL del build, sin interceptar fetch desde
// Playwright, sin Supabase, sin .env y sin importar el backend o su cron.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dist = path.join(root, 'dist');
await readFile(path.join(dist, 'sw.js')); // Exige un build PWA previo.
const bundle = await build({
  configFile: false, logLevel: 'error',
  resolve: { alias: { '@': path.join(root, 'src') } },
  define: { 'import.meta.env': JSON.stringify({ VITE_API_URL: '/api' }) },
  build: { write: false, minify: false,
    lib: { entry: path.join(root, 'tests/pwa/probe.ts'), formats: ['es'], fileName: 'probe' } },
});
const output = Array.isArray(bundle) ? bundle.flatMap(result => result.output) : bundle.output;
const probe = output.find(asset => asset.type === 'chunk').code;
const users = {
  a: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', correoElectronico: 'cuenta-a@example.invalid', rol: 'senderista' },
  b: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', correoElectronico: 'cuenta-b@example.invalid', rol: 'senderista' },
};
const created = [];
const planId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const contactoId = account => `${account}ccccccc-cccc-4ccc-8ccc-cccccccccccc`;
const plantillaCuenta = account => ({
  id: `${account}eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee`, nombre: `Plantilla personal ${account.toUpperCase()}`,
  lugarInicio: 'Cebollapampa', lugarFin: 'Laguna 69', coordenadasInicio: null,
  coordenadasFin: '-9.01050, -77.60420', minutosTolerancia: 30,
  idsContactos: [contactoId(account)], nombresAcompanantes: [`Acompañante ficticio ${account.toUpperCase()}`],
  version: 1, creadoEn: '2026-11-04T12:00:00Z', actualizadoEn: '2026-11-04T12:00:00Z',
});
const planes = Object.fromEntries(Object.keys(users).map(account => [account, {
  id: planId, lugarInicio: 'Inicio del plan', lugarFin: 'Destino del plan',
  coordenadasInicio: '-9.04500, -77.60800', coordenadasFin: '-9.01050, -77.60420',
  horaInicio: '2099-11-15T12:00:00Z', horaRetornoEstimada: '2099-11-15T18:00:00Z',
  minutosTolerancia: 30, estado: 'programada', version: 1, creadoEn: '2026-11-04T12:00:00Z',
  idsContactos: [contactoId(account)], nombresAcompanantes: ['Acompañante ficticio'],
}]));
const equipos = { a: [], b: [] };
const contentTypes = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const json = (res, status, body) => {
  // Intencionalmente cacheable: el cliente/worker deben impedir persistencia.
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=3600' });
  res.end(JSON.stringify(body));
};
const readJson = async req => {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:4174');
    if (url.pathname === '/__tests__/listo') return json(res, 200, { listo: true });
    if (url.pathname === '/__tests__/vacio') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<!doctype html><title>Entorno de pruebas</title>');
    }
    if (url.pathname === '/__tests__/legacy-sw.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Service-Worker-Allowed': '/', 'Cache-Control': 'no-store' });
      return res.end(`self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
        self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
        self.addEventListener('fetch', e => {
          if (e.request.method !== 'GET' || !new URL(e.request.url).pathname.startsWith('/api/')) return;
          e.respondWith((async () => { const cache=await caches.open('treksafe-api');
            try { const response=await fetch(e.request); await cache.put(e.request,response.clone()); return response; }
            catch { return (await cache.match(e.request)) || Response.error(); }
          })());
        });`);
    }
    if (url.pathname === '/__tests__/probe.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      return res.end(probe);
    }
    if (url.pathname === '/__tests__/creadas') return json(res, 200, created);
    if (url.pathname === '/api/auth/iniciar-sesion') {
      const data = await readJson(req);
      const account = Object.keys(users).find(key => users[key].correoElectronico === data.correoElectronico);
      return account && data.contrasena === 'Fixture123!'
        ? json(res, 200, { token: `fixture-${account}`, usuario: users[account] })
        : json(res, 401, { mensaje: 'Credenciales inválidas' });
    }
    if (url.pathname.startsWith('/api/') || url.pathname === '/externo/perfil') {
      const account = req.headers.authorization === 'Bearer fixture-a' ? 'a'
        : req.headers.authorization === 'Bearer fixture-b' ? 'b' : null;
      if (!account) return json(res, 401, { mensaje: 'Sesión inválida' });
      if (url.pathname === '/api/prueba-lenta') {
        if (url.searchParams.get('fase') === 'cuerpo') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.write('{"privado":');
          await new Promise(resolve => setTimeout(resolve, 800));
          return res.end(JSON.stringify(`dato-${account}`) + '}');
        }
        await new Promise(resolve => setTimeout(resolve, 800));
        return json(res, Number(url.searchParams.get('status') || 200), { privado: `dato-${account}` });
      }
      if (url.pathname === '/api/usuario/ficha-medica') return json(res, 200, { fichaMedica: {
        tipoSangre: account === 'a' ? 'A+' : 'B+', alergias: `alergia-privada-${account}`,
        condiciones: `condicion-${account}`, medicamentos: '', consentimientoFirmado: true,
      } });
      if (url.pathname === '/api/usuario/contactos') return json(res, 200, { contactos: [{
        id: contactoId(account), nombreCompleto: `Contacto privado ${account.toUpperCase()}`,
        parentesco: 'Amistad', telefono: account === 'a' ? '999111111' : '999222222',
        correoElectronico: `contacto-${account}@example.invalid`,
      }] });
      if (url.pathname === '/api/plantillas') return json(res, 200, { plantillas: [plantillaCuenta(account)] });
      if (url.pathname.endsWith('/borrador') && url.pathname.startsWith('/api/plantillas/')) {
        const p = plantillaCuenta(account);
        return json(res, 200, { borrador: { ...p, origen: 'plantilla', origenId: p.id,
          descripcionOrigen: `Plantilla «${p.nombre}»`, cantidadContactosNoVigentes: 0,
          horaInicio: null, horaRetornoEstimada: null, requiereFechasNuevas: true } });
      }
      if (url.pathname === '/api/usuario/listas-equipo') {
        if (req.method === 'POST') {
          const data = await readJson(req);
          const lista = { id: crypto.randomUUID(), senderistaId: users[account].id, ...data,
            items: data.items.map(item => ({ ...item, id: crypto.randomUUID() })),
            creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString() };
          equipos[account].push(lista);
          return json(res, 201, { lista });
        }
        return json(res, 200, { listas: equipos[account] });
      }
      if (url.pathname === '/api/expediciones/activa') return json(res, 200, { expedicion: null });
      if (url.pathname === `/api/expediciones/${planId}`) {
        if (req.method === 'PUT') {
          const data = await readJson(req);
          const { versionEsperada, operacionId: _operacionId, ...campos } = data;
          if (versionEsperada !== planes[account].version) return json(res, 409, { mensaje: 'Versión obsoleta' });
          planes[account] = { ...planes[account], ...campos, version: versionEsperada + 1 };
        }
        return json(res, 200, { expedicion: planes[account] });
      }
      if (url.pathname === '/api/expediciones' && req.method === 'POST') {
        const data = await readJson(req);
        created.push({ account, ...data });
        return json(res, 201, { expedicion: { id: crypto.randomUUID(), estado: 'programada', version: 1, ...data } });
      }
      if (url.pathname === '/api/expediciones') return json(res, 200, { expediciones: [] });
      if (url.pathname.startsWith('/api/rescate/')) return json(res, 200, { alertas: [], privado: `rescate-${account}` });
      return json(res, 200, { privado: `dato-${account}` });
    }
    const target = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`);
    if (target !== dist && !target.startsWith(`${dist}${path.sep}`)) return json(res, 403, {});
    let body;
    let ext = path.extname(target);
    try { body = await readFile(target); } catch {
      body = await readFile(path.join(dist, 'index.html'));
      ext = '.html';
    }
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (error) {
    json(res, 500, { mensaje: error.message });
  }
});
server.listen(4174, '127.0.0.1');
