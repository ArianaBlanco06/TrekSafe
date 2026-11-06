import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BorradorPlan } from '../application/creacion-plan/CreadorPlan.js';
import { loadEnv } from '../infrastructure/config/env.js';

type Paso = { nombre: string; resultado: 'aprobado' };
export type ContextoInterfazHu28Dev = {
  origenWeb: string;
  origenId: string;
  destinoOriginal: string;
  cuentas: { id: string; correo: string }[];
  contrasena: string;
  directorioEvidencia: string;
  fechas: { salida: string; retorno: string };
};
type Opciones = {
  permitirDev: true;
  carpetaSalida: string;
  verificarInterfaz: (contexto: ContextoInterfazHu28Dev) => Promise<{ nuevaId: string; capturas: string[] }>;
  informar?: (mensaje: string) => void;
};

/** Prueba optativa contra DEV. No se ejecuta al importar ni forma parte de npm test. */
export async function validarHu28Dev(opciones: Opciones) {
  const env = loadEnv();
  assert.equal(opciones.permitirDev, true);
  assert.equal(process.env.HU28_DEV_RUN, '1', 'Esta prueba requiere HU28_DEV_RUN=1.');
  assert.equal(env.nodeEnv, 'development', 'Solo se admite la configuración de desarrollo.');
  assert.equal(env.cronEnabled, false, 'Mantén CRON_ENABLED=false.');
  assert.equal(env.apiPrefix, '/api', 'El build de pruebas debe usar /api.');
  assert.ok(!env.brevoApiKey && !(env.smtpHost && env.smtpUser && env.smtpPass), 'Usa correo simulado.');
  const origenSupabase = new URL(env.supabaseUrl);
  assert.ok(origenSupabase.protocol === 'https:' && origenSupabase.hostname.endsWith('.supabase.co'));

  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const directorioEvidencia = path.resolve(opciones.carpetaSalida);
  const salidaPermitida = path.join(raiz, 'frontend/test-results') + path.sep;
  assert.ok(directorioEvidencia.toLowerCase().startsWith(salidaPermitida.toLowerCase()));
  const frontend = path.join(raiz, 'frontend/dist');
  await access(path.join(frontend, 'index.html'));
  await mkdir(directorioEvidencia, { recursive: true });

  const ejecucion = randomUUID();
  const cuentas = ['A', 'B'].map((letra) => ({ id: randomUUID(), letra,
    correo: `hu28-${ejecucion}-${letra.toLowerCase()}@example.invalid` }));
  const [a, b] = cuentas;
  const contactoA = randomUUID();
  const contactoBorrado = randomUUID();
  const contactoB = randomUUID();
  const origenId = randomUUID();
  const origenB = randomUUID();
  const destinoOriginal = `Laguna 69 HU28 DEV A ${ejecucion.slice(0, 8)}`;
  const contrasena = `Hu28!${randomUUID()}`;
  const fechas = { salida: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    retorno: new Date(Date.now() + 2 * 86_400_000 + 8 * 3_600_000).toISOString() };
  const pasos: Paso[] = [];
  const informe = {
    historia: 'HU-28', ejecucion, iniciadoEn: new Date().toISOString(), terminadoEn: '',
    entorno: 'Supabase DEV con API Express y PWA locales reales',
    proyecto: origenSupabase.hostname, node: process.version,
    resultado: 'pendiente', pasos, limpieza: 'pendiente',
    datosFicticios: { usuarios: cuentas.map(({ id, correo }) => ({ id, correo })), origenId, origenB,
      contactoA, contactoBorrado, contactoB },
    nuevaExpedicionId: '', capturas: [] as string[], error: '',
    pendientes: ['Integración de puntos intermedios con HU-32 y contrato HU-29', 'Aceptación y revisión de evidencia por el equipo'],
    huellasArchivos: {} as Record<string, string>,
  };
  for (const archivo of ['backend/src/application/creacion-plan/CreadorDesdeHistorial.ts',
    'backend/src/infrastructure/repositories/HistorialExpedicionesDAOSupabase.ts',
    'frontend/src/pages/PaginaCrearExpedicion.tsx', 'frontend/src/services/expedicion.ts']) {
    informe.huellasArchivos[archivo] = createHash('sha256').update(await readFile(path.join(raiz, archivo))).digest('hex');
  }
  // Nunca se escriben las claves de Supabase, el JWT ni la contraseña de las cuentas ficticias.
  const archivoInforme = path.join(directorioEvidencia, 'validacion.json');
  await writeFile(archivoInforme, JSON.stringify(informe, null, 2));
  const fetchAnterior = globalThis.fetch;
  let origenWeb = '';
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin !== origenSupabase.origin && url.origin !== origenWeb) {
      throw new Error('La prueba solo permite su Supabase configurado y su API local.');
    }
    return fetchAnterior(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(25_000) });
  };

  let servidor: Server | undefined;
  let fixturesIntentadas = false;
  const { getSupabaseAdmin } = await import('../infrastructure/database/supabase.js');
  const cliente = getSupabaseAdmin();
  async function consulta<T>(solicitud: PromiseLike<{ data: T; error: { code?: string } | null }>, nombre: string): Promise<T> {
    const respuesta = await solicitud;
    if (respuesta.error) throw new Error(`${nombre}: fallo de base (${respuesta.error.code || 'sin código'}).`);
    return respuesta.data;
  }
  function aprobado(nombre: string) {
    pasos.push({ nombre, resultado: 'aprobado' });
    opciones.informar?.(nombre);
  }
  const columnas = 'id,senderista_id,lugar_inicio,lugar_fin,coordenadas_inicio,coordenadas_fin,hora_inicio,hora_retorno_estimada,minutos_tolerancia,estado,version,creado_en,actualizado_en';
  async function snapshotOrigen() {
    const fila = await consulta(cliente.from('expediciones').select(columnas).eq('id', origenId).eq('senderista_id', a.id).single(), 'Consultar origen');
    const vinculos = await consulta(cliente.from('vinculos_expedicion_contacto').select('id,contacto_id').eq('expedicion_id', origenId).order('id'), 'Consultar vínculos');
    const acompanantes = await consulta(cliente.from('acompanantes_expedicion').select('id,nombre_acompanante').eq('expedicion_id', origenId).order('id'), 'Consultar acompañantes');
    return { fila, vinculos, acompanantes };
  }
  async function pedir(ruta: string, estado: number, token?: string, datos?: unknown) {
    const respuesta = await fetch(`${origenWeb}/api${ruta}`, {
      method: datos === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(datos === undefined ? {} : { body: JSON.stringify(datos) }),
    });
    assert.equal(respuesta.status, estado, `HTTP esperado ${estado} en ${ruta}; recibido ${respuesta.status}.`);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    return await respuesta.json() as Record<string, unknown>;
  }

  try {
    await consulta(cliente.from('expediciones').select('id,version').limit(1), 'Verificar esquema DEV');
    const { hashearContrasena } = await import('../infrastructure/security/password.js');
    const hash = await hashearContrasena(contrasena);
    fixturesIntentadas = true;
    await consulta(cliente.from('usuarios').insert(cuentas.map((cuenta) => ({
      id: cuenta.id, correo_electronico: cuenta.correo, hash_contrasena: hash, rol: 'senderista',
    }))), 'Crear usuarios ficticios');
    await consulta(cliente.from('perfiles_senderista').insert(cuentas.map((cuenta) => ({
      usuario_id: cuenta.id, nombre_completo: `Prueba HU28 DEV ${cuenta.letra}`, telefono: '+51900000001',
      id_documento: `H28${ejecucion.replaceAll('-', '').slice(0, 12)}${cuenta.letra}`,
    }))), 'Crear perfiles ficticios');
    await consulta(cliente.from('contactos_emergencia').insert([
      { id: contactoA, senderista_id: a.id }, { id: contactoBorrado, senderista_id: a.id }, { id: contactoB, senderista_id: b.id },
    ].map((contacto) => ({ ...contacto, nombre_completo: 'Contacto ficticio HU28 DEV', parentesco: 'Prueba',
      telefono: '+51900000001', correo_electronico: `hu28-${contacto.id}@example.invalid` }))), 'Crear contactos ficticios');
    const baseOrigen = { lugar_inicio: 'Cebollapampa HU28 DEV', coordenadas_inicio: '-9.04700, -77.60900',
      coordenadas_fin: '-9.01050, -77.60420', minutos_tolerancia: 45, estado: 'completada',
      hora_inicio: '2025-01-10T08:00:00Z', hora_retorno_estimada: '2025-01-10T18:00:00Z' };
    await consulta(cliente.from('expediciones').insert([
      { ...baseOrigen, id: origenId, senderista_id: a.id, lugar_fin: destinoOriginal },
      { ...baseOrigen, id: origenB, senderista_id: b.id, lugar_fin: `Ruta HU28 DEV B ${ejecucion.slice(0, 8)}` },
    ]), 'Crear historial ficticio');
    await consulta(cliente.from('vinculos_expedicion_contacto').insert([
      { expedicion_id: origenId, contacto_id: contactoA }, { expedicion_id: origenId, contacto_id: contactoBorrado },
      { expedicion_id: origenB, contacto_id: contactoB },
    ]), 'Vincular contactos ficticios');
    await consulta(cliente.from('acompanantes_expedicion').insert([origenId, origenB].map((id) => ({
      expedicion_id: id, nombre_acompanante: 'Acompañante ficticio HU28 DEV',
    }))), 'Crear acompañantes ficticios');
    aprobado('Esquema DEV disponible y dos cuentas ficticias aisladas preparadas.');

    const { createApp } = await import('../presentation/http/app.js');
    const { default: express } = await import('express');
    const api = createApp();
    const web = express();
    web.use((req, res, next) => {
      if (req.path === '/api' || req.path.startsWith('/api/')) api(req, res, next);
      else next();
    });
    web.use(express.static(frontend));
    web.get('*', (_req, res) => { res.sendFile(path.join(frontend, 'index.html')); });
    servidor = web.listen(0, '127.0.0.1');
    await once(servidor, 'listening');
    const direccion = servidor.address();
    assert.ok(direccion && typeof direccion !== 'string');
    origenWeb = `http://127.0.0.1:${direccion.port}`;
    const credenciales = await Promise.all(cuentas.map((cuenta) => pedir('/auth/iniciar-sesion', 200, undefined,
      { correoElectronico: cuenta.correo, contrasena })));
    const tokenA = credenciales[0].token as string;
    const tokenB = credenciales[1].token as string;
    assert.ok(tokenA && tokenB);
    aprobado('Login real de TrekSafe con A y B; cron sin iniciar y correo simulado.');

    const ruta = `/expediciones/${origenId}/borrador`;
    await pedir(ruta, 401);
    const historialA = await pedir('/expediciones/historial', 200, tokenA);
    assert.deepEqual((historialA.expediciones as { id: string }[]).map((fila) => fila.id), [origenId]);
    const borrador = (await pedir(ruta, 200, tokenA)).borrador as BorradorPlan;
    assert.equal(borrador.origenId, origenId);
    assert.equal(borrador.lugarFin, destinoOriginal);
    assert.equal(borrador.horaInicio, null);
    assert.equal(borrador.horaRetornoEstimada, null);
    assert.equal(borrador.requiereFechasNuevas, true);
    assert.deepEqual([...borrador.idsContactos].sort(), [contactoA, contactoBorrado].sort());
    for (const campo of ['id', 'estado', 'senderistaId', 'fichaMedica', 'alertas', 'confirmadoEn']) {
      assert.equal(Object.hasOwn(borrador, campo), false);
    }
    aprobado('PostgREST real devuelve el borrador propio con fechas vacías y sin campos privados del viaje anterior.');

    const ajeno = await pedir(ruta, 404, tokenB);
    const inexistente = await pedir(`/expediciones/${randomUUID()}/borrador`, 404, tokenB);
    assert.deepEqual(ajeno, inexistente);
    const historialB = await pedir('/expediciones/historial', 200, tokenB);
    assert.deepEqual((historialB.expediciones as { id: string }[]).map((fila) => fila.id), [origenB]);
    aprobado('Aislamiento real: B solo ve su historial; origen ajeno e inexistente devuelven el mismo 404.');

    await consulta(cliente.from('contactos_emergencia').delete().eq('id', contactoBorrado).eq('senderista_id', a.id), 'Retirar contacto ficticio');
    const contenido = { lugarInicio: borrador.lugarInicio, lugarFin: borrador.lugarFin,
      coordenadasInicio: borrador.coordenadasInicio ?? undefined, coordenadasFin: borrador.coordenadasFin ?? undefined,
      minutosTolerancia: borrador.minutosTolerancia, nombresAcompanantes: borrador.nombresAcompanantes,
      horaInicio: fechas.salida, horaRetornoEstimada: fechas.retorno, idsContactos: borrador.idsContactos };
    const obsoleto = await pedir('/expediciones', 400, tokenA, contenido);
    assert.equal(obsoleto.codigo, 'CONTACTOS_INVALIDOS');
    const contactoAjeno = await pedir('/expediciones', 400, tokenA, { ...contenido, idsContactos: [contactoB] });
    assert.equal(contactoAjeno.codigo, 'CONTACTOS_INVALIDOS');
    await pedir('/expediciones', 400, tokenA, { ...contenido, idsContactos: [contactoA],
      horaInicio: baseOrigen.hora_inicio, horaRetornoEstimada: baseOrigen.hora_retorno_estimada });
    const actual = (await pedir(ruta, 200, tokenA)).borrador as BorradorPlan;
    assert.deepEqual(actual.idsContactos, [contactoA]);
    const antes = await consulta(cliente.from('expediciones').select('id').in('senderista_id', cuentas.map((cuenta) => cuenta.id)), 'Contar expediciones');
    assert.equal(antes?.length, 2);
    aprobado('Guardar rechaza fechas antiguas, contactos borrados y contactos de B, sin crear expediciones parciales.');

    const snapshot = await snapshotOrigen();
    const interfaz = await opciones.verificarInterfaz({ origenWeb, origenId, destinoOriginal,
      cuentas, contrasena, directorioEvidencia, fechas });
    informe.nuevaExpedicionId = interfaz.nuevaId;
    informe.capturas = interfaz.capturas;
    assert.ok(interfaz.nuevaId && interfaz.nuevaId !== origenId && interfaz.nuevaId !== origenB);
    const nueva = await consulta(cliente.from('expediciones').select(columnas)
      .eq('id', interfaz.nuevaId).eq('senderista_id', a.id).single(), 'Comprobar nueva expedición');
    assert.ok(nueva, 'La nueva expedición debe existir para el propietario.');
    assert.ok(snapshot.fila);
    assert.equal(nueva.estado, 'programada');
    assert.equal(nueva.lugar_inicio, snapshot.fila.lugar_inicio);
    assert.equal(nueva.coordenadas_inicio, snapshot.fila.coordenadas_inicio);
    assert.equal(nueva.coordenadas_fin, snapshot.fila.coordenadas_fin);
    assert.equal(nueva.minutos_tolerancia, snapshot.fila.minutos_tolerancia);
    assert.ok(Date.parse(nueva.hora_inicio) > Date.now());
    assert.ok(Date.parse(nueva.hora_retorno_estimada) > Date.parse(nueva.hora_inicio));
    assert.deepEqual(await snapshotOrigen(), snapshot);
    const vinculosNuevos = await consulta(cliente.from('vinculos_expedicion_contacto').select('contacto_id')
      .eq('expedicion_id', interfaz.nuevaId), 'Comprobar contactos nuevos');
    assert.deepEqual(vinculosNuevos?.map((fila) => fila.contacto_id), [contactoA]);
    const acompanantesNuevos = await consulta(cliente.from('acompanantes_expedicion').select('nombre_acompanante')
      .eq('expedicion_id', interfaz.nuevaId), 'Comprobar acompañantes nuevos');
    assert.deepEqual(acompanantesNuevos?.map((fila) => fila.nombre_acompanante).sort(),
      snapshot.acompanantes?.map((fila) => fila.nombre_acompanante).sort());
    for (const tabla of ['bitacoras_rescate', 'despachos_correo']) {
      const registros = await consulta(cliente.from(tabla).select('id').eq('expedicion_id', interfaz.nuevaId), 'Comprobar ausencia de alertas heredadas');
      assert.deepEqual(registros, []);
    }
    await pedir(`/expediciones/${interfaz.nuevaId}/borrador`, 404, tokenA);
    aprobado('PWA real crea otra expedición en DEV: id nuevo, fechas futuras, contactos vigentes y origen intacto.');
    aprobado('La nueva expedición permanece programada, no hereda bitácoras ni despachos y todavía no puede repetirse como completada.');
    informe.resultado = 'aprobado para el alcance sin puntos intermedios';
  } catch (error) {
    informe.resultado = 'fallido';
    informe.error = error instanceof Error ? error.message : 'Fallo no identificado.';
  } finally {
    if (fixturesIntentadas) {
      try {
        // Id y correo deben coincidir: nunca se borra por un prefijo compartido.
        for (const cuenta of cuentas) {
          await consulta(cliente.from('usuarios').delete().eq('id', cuenta.id)
            .eq('correo_electronico', cuenta.correo), 'Limpiar cuenta ficticia');
        }
        const restantes = await consulta(cliente.from('usuarios').select('id').in('id', cuentas.map((cuenta) => cuenta.id)), 'Verificar limpieza');
        const expediciones = await consulta(cliente.from('expediciones').select('id').in('senderista_id', cuentas.map((cuenta) => cuenta.id)), 'Verificar cascada');
        assert.deepEqual(restantes, []);
        assert.deepEqual(expediciones, []);
        informe.limpieza = 'verificada: cuentas ficticias y sus expediciones eliminadas por id y propietario';
      } catch (error) {
        informe.limpieza = 'fallida: revisar únicamente los identificadores ficticios de este informe';
        informe.resultado = 'fallido';
        informe.error += ` Limpieza: ${error instanceof Error ? error.message : 'fallo no identificado'}`;
      }
    } else informe.limpieza = 'sin fixtures creadas';
    if (servidor) {
      servidor.closeAllConnections();
      await new Promise<void>((resolve) => servidor!.close(() => resolve()));
    }
    globalThis.fetch = fetchAnterior;
    informe.terminadoEn = new Date().toISOString();
    await writeFile(archivoInforme, JSON.stringify(informe, null, 2));
    const resumen = [
      '# Evidencia HU-28 en Supabase DEV', '', `- Fecha UTC: ${informe.terminadoEn}`,
      `- Resultado: ${informe.resultado}`, `- Ejecución: ${ejecucion}`,
      `- Limpieza: ${informe.limpieza}`, '', ...pasos.map((paso) => `- [x] ${paso.nombre}`), '',
      `- Id del origen ficticio: ${origenId}`, `- Id nuevo: ${informe.nuevaExpedicionId || 'no creado'}`,
      '', ...informe.capturas.map((captura) => `![Evidencia ${path.basename(captura)}](${path.basename(captura)})`),
      '', 'Pendiente: puntos intermedios y aceptación del equipo. Este informe no cierra la HU.',
      ...(informe.error ? ['', `Error: ${informe.error}`] : []), '',
    ].join('\n');
    await writeFile(path.join(directorioEvidencia, 'evidencia.md'), resumen);
  }
  if (informe.resultado === 'fallido') throw new Error(`Validación DEV fallida. Revisar ${archivoInforme}`);
  return { archivoInforme, informe };
}
