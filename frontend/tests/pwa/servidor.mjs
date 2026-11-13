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
  configFile: false, envFile: false, logLevel: 'error',
  resolve: { alias: { '@': path.join(root, 'src') } },
  define: {
    'import.meta.env': JSON.stringify({ VITE_API_URL: '/api' }),
    'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
  },
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
const creacionesOffline = new Map();
const fallosOffline = { a: {}, b: {} };
// HU-26 (plan editable con version) y HU-30 (listas de equipo) en memoria, por cuenta.
const planId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const contactoId = account => `${account}ccccccc-cccc-4ccc-8ccc-cccccccccccc`;
const planes = Object.fromEntries(Object.keys(users).map(account => [account, {
  id: planId, lugarInicio: 'Inicio del plan', lugarFin: 'Destino del plan',
  coordenadasInicio: '-9.04500, -77.60800', coordenadasFin: '-9.01050, -77.60420',
  horaInicio: '2099-11-15T12:00:00Z', horaRetornoEstimada: '2099-11-15T18:00:00Z',
  minutosTolerancia: 30, estado: 'programada', version: 1, creadoEn: '2026-11-04T12:00:00Z',
  idsContactos: [contactoId(account)], nombresAcompanantes: ['Acompañante ficticio'],
}]));
const equipos = { a: [], b: [] };
const conIds = items => items.map(item => ({ ...item, id: item.id ?? crypto.randomUUID() }));
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
    if (url.pathname === '/__tests__/hu49' && req.method === 'POST') {
      const datos = await readJson(req);
      if (!Object.hasOwn(users, datos.cuenta)) return json(res,400,{});
      fallosOffline[datos.cuenta] = datos;
      return json(res,200,{});
    }
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
      if (url.pathname === '/api/usuario/listas-equipo') {
        if (req.method === 'POST') {
          const data = await readJson(req);
          const ahora = new Date().toISOString();
          const lista = { id: crypto.randomUUID(), senderistaId: users[account].id, nombre: data.nombre,
            items: conIds(data.items ?? []), creadoEn: ahora, actualizadoEn: ahora };
          equipos[account].push(lista);
          return json(res, 201, { lista });
        }
        return json(res, 200, { listas: equipos[account] });
      }
      if (url.pathname.startsWith('/api/usuario/listas-equipo/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/usuario/listas-equipo/'.length));
        const indice = equipos[account].findIndex(lista => lista.id === id);
        if (indice < 0) return json(res, 404, { mensaje: 'Lista no encontrada' });
        if (req.method === 'DELETE') {
          equipos[account].splice(indice, 1);
          res.writeHead(204, { 'Cache-Control': 'private, max-age=3600' });
          return res.end();
        }
        if (req.method === 'PUT') {
          const data = await readJson(req);
          equipos[account][indice] = { ...equipos[account][indice], nombre: data.nombre,
            items: conIds(data.items ?? []), actualizadoEn: new Date().toISOString() };
        }
        return json(res, 200, { lista: equipos[account][indice] });
      }
      if (url.pathname === '/api/expediciones/activa') return json(res, 200, { expedicion: null });
      if (url.pathname === '/api/expediciones/borradores/sincronizar' && req.method === 'POST') {
        const datos = await readJson(req);
        const clave = `${account}:${datos.borradorId}`;
        const previa = creacionesOffline.get(clave);
        if (previa) return JSON.stringify(previa.datos) === JSON.stringify(datos)
          ? json(res,200,{expedicion:previa.expedicion,repetido:true})
          : json(res,409,{mensaje:'Identificador reutilizado',codigo:'BORRADOR_REUTILIZADO'});
        if (fallosOffline[account].contacto) {
          fallosOffline[account].contacto=false;
          return json(res,400,{mensaje:'El contacto ya no está disponible. Revisa los contactos.',codigo:'CONTACTOS_INVALIDOS'});
        }
        if (Date.parse(datos.horaInicio) <= Date.now()) return json(res,400,{mensaje:'Fecha vencida',codigo:'FECHAS_INVALIDAS'});
        const expedicion = { ...datos, id:crypto.randomUUID(), estado:'programada',version:1 };
        creacionesOffline.set(clave,{datos,expedicion});created.push({account,...datos});
        if (fallosOffline[account].perderRespuesta) {
          // Enviar cabeceras y parte del cuerpo evita que Chromium repita
          // silenciosamente un POST cuya conexión se cerró antes de responder.
          fallosOffline[account].perderRespuesta=false;
          res.writeHead(201,{'Content-Type':'application/json','Cache-Control':'no-store'});
          res.flushHeaders();res.write('{"expedicion":');setTimeout(()=>res.destroy(),80);return;
        }
        return json(res,201,{expedicion,repetido:false});
      }
      if (url.pathname === `/api/expediciones/${planId}`) {
        if (req.method === 'PUT') {
          const { versionEsperada, operacionId: _operacionId, ...campos } = await readJson(req);
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
