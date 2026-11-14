// Solo PostgreSQL temporal en loopback. No carga .env ni usa DATABASE_URL/Supabase.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const args = process.argv.slice(2);
const valor = clave => { const i = args.indexOf(clave); return i < 0 ? null : args[i + 1]; };
for (const arg of args.filter(a => a.startsWith('--'))) {
  assert.ok(['--pg-bin', '--postgrest', '--with-browser', '--hu48'].includes(arg), `Opción desconocida: ${arg}`);
}
assert.ok(valor('--pg-bin') && !valor('--pg-bin').startsWith('--'), 'Usar --pg-bin <directorio de PostgreSQL>');
if (args.includes('--with-browser')) assert.ok(valor('--postgrest'), '--with-browser requiere --postgrest <binario>');
const bin = path.resolve(valor('--pg-bin'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const historia = args.includes('--hu48') ? 'hu48' : 'hu47';
const carpeta = await mkdtemp(path.join(tmpdir(), `treksafe-${historia}-`));
const datos = path.join(carpeta, 'pgdata');
const base = `treksafe_${historia}_desechable`;
const puerto = await new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => {
    const p = s.address().port;
    s.close(error => error ? reject(error) : resolve(p));
  });
});
assert.ok(puerto !== 5432 && puerto > 1024);
const env = { ...process.env };
for (const clave of Object.keys(env)) {
  if (/^(PG|PGRST|SUPABASE|DATABASE_URL)/i.test(clave)) delete env[clave];
}
// pg consulta process.env para opciones omitidas. Se evita heredar conexiones.
for (const clave of Object.keys(process.env)) {
  if (/^PG/i.test(clave)) delete process.env[clave];
}
const exe = nombre => path.join(bin, process.platform === 'win32' ? `${nombre}.exe` : nombre);
const run = (file, argv) => new Promise((resolve, reject) => {
  execFile(file, argv, { env, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) reject(new Error(String(stderr || stdout || error.message)));
    else resolve(String(stdout));
  });
});
const control = argv => new Promise((resolve, reject) => {
  const hijo = spawn(exe('pg_ctl'), argv, { env, windowsHide: true, stdio: 'ignore' });
  hijo.once('error', reject);
  hijo.once('exit', async codigo => {
    if (codigo === 0) return resolve();
    const log = await readFile(path.join(carpeta, 'postgres.log'), 'utf8')
      .catch(() => '(sin log de PostgreSQL)');
    reject(new Error(`pg_ctl ${codigo}; ${carpeta}\n${log.slice(-6000)}`));
  });
});
const config = { host: '127.0.0.1', port: puerto, user: 'postgres', password: '', database: base };
let iniciado = false;
let admin;
let servicio;
let pasadas = 0;
const caso = async (nombre, fn) => { await fn(); pasadas += 1; console.log(`OK ${nombre}`); };
const consulta = (actor, desde, hasta, criterio = 'apertura', zona = null, resultado = null) => servicio.query(
  'SELECT public.treksafe_consultar_estadisticas_incidentes($1,$2,$3,$4,$5,$6) AS r',
  [actor, desde, hasta, criterio, zona, resultado],
).then(r => r.rows[0].r);
const firma = 'public.treksafe_consultar_estadisticas_incidentes(uuid,timestamptz,timestamptz,text,text,text)';

try {
  console.log(`PostgreSQL desechable ${historia.toUpperCase()}: ${carpeta}`);
  await run(exe('initdb'), ['-D', datos, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
  // En Linux el socket predeterminado puede pertenecer al usuario postgres.
  // El runner usa su propio directorio temporal; Windows conecta solo por TCP.
  const socket = process.platform === 'win32' ? '' : `-k "${carpeta}"`;
  await control(['-D', datos, '-l', path.join(carpeta, 'postgres.log'), '-w', 'start', '-o', `-h 127.0.0.1 -p ${puerto} -c timezone=UTC ${socket}`]);
  iniciado = true;
  admin = new pg.Client({ ...config, database: 'postgres' });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${base}`);
  await admin.end();
  admin = new pg.Client(config);
  await admin.connect();
  assert.equal((await admin.query('SELECT current_database() AS d')).rows[0].d, base);
  await admin.query(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  `);
  await admin.query(await readFile(path.join(root, 'init_schema.sql'), 'utf8'));
  for (const archivo of [
    '000_registro_migraciones.sql', '002_hu26_version_y_eventos_plan.sql',
    '017_hu39_asumir_coordinacion.sql', '019_hu41_bitacora_incidente.sql',
    '021_hu40_transferir_coordinacion.sql', '025_hu42_cerrar_incidente.sql',
    '029_hu47_estadisticas_incidentes.sql',
  ]) await admin.query(await readFile(path.join(root, 'backend/migrations', archivo), 'utf8'));

  servicio = new pg.Client(config);
  await servicio.connect();
  await servicio.query('SET ROLE service_role');
  const ana = randomUUID(), beto = randomUUID(), sinPerfil = randomUUID(), senderista = randomUUID();
  for (const [id, rol] of [[ana, 'rescatista'], [beto, 'rescatista'], [sinPerfil, 'rescatista'], [senderista, 'senderista']]) {
    await admin.query('INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol) VALUES($1,$2,$3,$4)',
      [id, `${id}@example.invalid`, 'fixture-no-login', rol]);
  }
  await admin.query('INSERT INTO public.perfiles_senderista(usuario_id,nombre_completo,telefono,id_documento) VALUES($1,$2,$3,$4)',
    [senderista, 'Persona ficticia HU47', '900000047', senderista.slice(0, 20)]);
  for (const [id, nombre] of [[ana, 'Ana ficticia'], [beto, 'Beto ficticio']]) {
    await admin.query("INSERT INTO public.registros_institucionales_rescatista(institucion,numero_credencial,nombre_completo,fecha_nacimiento) VALUES('AGMP',$1,$2,'1990-01-01')", [id, nombre]);
    await admin.query("INSERT INTO public.perfiles_rescatista(usuario_id,numero_credencial,nombre_completo,fecha_nacimiento) VALUES($1,$2,$3,'1990-01-01')", [id, id, nombre]);
  }
  const inicio = new Date(); inicio.setUTCHours(0, 0, 0, 0);
  const fin = new Date(inicio); fin.setUTCDate(fin.getUTCDate() + 1);
  const desde = inicio.toISOString(), hasta = fin.toISOString();
  const anterior = new Date(inicio.getTime() - 1).toISOString();
  const ultimo = new Date(fin.getTime() - 1).toISOString();
  const crear = async (zona, abierto, estado = 'abierto', expedicionExistente = null) => {
    const e = expedicionExistente ?? randomUUID();
    if (!expedicionExistente) await admin.query(`INSERT INTO public.expediciones(id,senderista_id,lugar_inicio,lugar_fin,hora_inicio,hora_retorno_estimada,estado)
      VALUES($1,$2,'Inicio ficticio',$3,now()-interval '5 hours',now()-interval '1 hour','alerta')`, [e, senderista, zona]);
    const id = randomUUID();
    await admin.query(`INSERT INTO public.incidentes(id,expedicion_id,responsable_id,operacion_id,abierto_en,estado,cerrado_en)
      VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6='cerrado' THEN $5::timestamptz ELSE NULL END)`, [id, e, ana, randomUUID(), abierto, estado]);
    return { id, expedicion: e };
  };
  const abierto = await crear('Huaraz Laguna 69', desde);
  await crear('Cusco', ultimo, 'localizado');
  const conInforme = await crear('Huaraz', desde, 'localizado');
  await servicio.query('SELECT public.treksafe_cerrar_incidente($1,$2,$3,$4,$5)', [conInforme.id, ana, 'evacuado', 'Cierre ficticio', randomUUID()]);
  await crear('Huaraz', desde, 'cerrado'); // histórico sin informe
  const compartida = await crear('Ruta_50%', desde, 'cerrado');
  await crear('Ruta_50%', ultimo, 'abierto', compartida.expedicion);
  await crear('Fuera antes', anterior, 'cerrado');
  await crear('Fuera después', hasta, 'abierto');
  await crear('RutaX500', desde, 'cerrado');
  const esperado = { atendidos: 7, abiertos: 3, cerrados: 4 };

  await caso('incluye el inicio y último instante del día, excluye el día siguiente', async () => {
    assert.deepEqual(await consulta(ana, desde, hasta), esperado);
  });
  await caso('zona por destino, sin distinguir mayúsculas', async () => {
    assert.deepEqual(await consulta(ana, desde, hasta, 'apertura', ' HUARAZ '), { atendidos: 3, abiertos: 1, cerrados: 2 });
  });
  await caso('porcentaje y guion bajo se buscan como caracteres literales', async () => {
    assert.deepEqual(await consulta(ana, desde, hasta, 'apertura', 'Ruta_50%'), { atendidos: 2, abiertos: 1, cerrados: 1 });
  });
  await caso('resultado selecciona cierres y conserva abiertos en cero', async () => {
    assert.deepEqual(await consulta(ana, desde, hasta, 'apertura', null, 'evacuado'), { atendidos: 1, abiertos: 0, cerrados: 1 });
  });
  await caso('fecha de cierre incluye cierres antiguos sin informe y excluye abiertos', async () => {
    assert.deepEqual(await consulta(ana, desde, hasta, 'cierre'), { atendidos: 4, abiertos: 0, cerrados: 4 });
  });
  await caso('sin coincidencias devuelve tres ceros', async () => {
    assert.deepEqual(await consulta(ana, desde, hasta, 'apertura', 'No existe'), { atendidos: 0, abiertos: 0, cerrados: 0 });
  });
  await caso('varias notas y un relevo real no duplican el incidente', async () => {
    for (let i = 0; i < 3; i++) await servicio.query('SELECT public.treksafe_agregar_entrada_bitacora($1,$2,$3,NULL,$4)', [abierto.id, ana, `Nota ficticia ${i}`, randomUUID()]);
    const version = (await admin.query('SELECT version FROM public.incidentes WHERE id=$1', [abierto.id])).rows[0].version;
    await servicio.query('SELECT public.treksafe_proponer_relevo($1,$2,$3,$4,$5,$6)', [abierto.expedicion, ana, beto, 'Relevo ficticio', version, randomUUID()]);
    const relevo = (await admin.query("SELECT id FROM public.relevos_coordinacion WHERE incidente_id=$1 AND estado='pendiente'", [abierto.id])).rows[0].id;
    await servicio.query('SELECT public.treksafe_aceptar_relevo($1,$2,$3,$4)', [abierto.expedicion, beto, relevo, randomUUID()]);
    assert.deepEqual(await consulta(ana, desde, hasta), esperado);
    assert.deepEqual(await consulta(beto, desde, hasta), esperado);
  });
  await caso('perfil inexistente, senderista y actor nulo reciben rechazo SQL', async () => {
    for (const actor of [sinPerfil, senderista, null]) await assert.rejects(consulta(actor, desde, hasta), e => e.code === '42501' && e.message === 'RESCATISTA_NO_VALIDADO');
  });
  await caso('la RPC también rechaza filtros inválidos al llamarla directamente', async () => {
    for (const params of [
      [ana, hasta, desde], [ana, desde, hasta, 'retorno'],
      [ana, desde, hasta, 'apertura', null, 'otro'], [ana, null, hasta],
      [ana, '-infinity', hasta], [ana, desde, hasta, 'apertura', 'a'.repeat(121)],
    ]) await assert.rejects(consulta(...params), e => e.code === '22023');
  });
  await caso('anon y authenticated carecen de EXECUTE; INVOKER, STABLE y search_path vacío', async () => {
    for (const rol of ['anon', 'authenticated']) {
      await admin.query(`SET ROLE ${rol}`);
      try { await assert.rejects(admin.query('SELECT public.treksafe_consultar_estadisticas_incidentes($1,$2,$3,$4)', [ana, desde, hasta, 'apertura']), e => e.code === '42501'); }
      finally { await admin.query('RESET ROLE'); }
    }
    const p = (await admin.query('SELECT prosecdef, provolatile, proconfig FROM pg_proc WHERE oid=$1::regprocedure', [firma])).rows[0];
    assert.equal(p.prosecdef, false);
    assert.equal(p.provolatile, 's');
    assert.ok(p.proconfig.includes('search_path=""'));
  });
  await caso('más de 1000 incidentes se cuentan completos', async () => {
    const e = randomUUID();
    await admin.query(`INSERT INTO public.expediciones(id,senderista_id,lugar_inicio,lugar_fin,hora_inicio,hora_retorno_estimada)
      VALUES($1,$2,'Inicio','Volumen',now(),now()+interval '1 hour')`, [e, senderista]);
    await admin.query(`INSERT INTO public.incidentes(expedicion_id,responsable_id,operacion_id,abierto_en,estado,cerrado_en)
      SELECT $1,$2,gen_random_uuid(),$3,'cerrado',$3 FROM generate_series(1,1205)`, [e, ana, desde]);
    assert.deepEqual(await consulta(ana, desde, hasta, 'apertura', 'Volumen'), { atendidos: 1205, abiertos: 0, cerrados: 1205 });
  });
  await caso('las consultas funcionan en transacción READ ONLY sin modificar los datos', async () => {
    const snapshot = () => admin.query(`SELECT jsonb_build_object(
      'incidentes',(SELECT md5(string_agg(row_to_json(i)::text, '' ORDER BY id)) FROM public.incidentes i),
      'bitacora',(SELECT md5(string_agg(row_to_json(b)::text, '' ORDER BY id)) FROM public.entradas_bitacora_incidente b),
      'cierres',(SELECT md5(string_agg(row_to_json(c)::text, '' ORDER BY id)) FROM public.informes_cierre_incidente c)) AS s`).then(r => r.rows[0].s);
    const antes = await snapshot();
    await servicio.query('BEGIN READ ONLY');
    try {
      for (const criterio of ['apertura', 'cierre']) await consulta(ana, desde, hasta, criterio);
    } finally { await servicio.query('ROLLBACK'); }
    assert.deepEqual(await snapshot(), antes);
  });
  await caso('registro 029 correcto y segundo intento revierte sin tocarlo', async () => {
    const registro = (await admin.query("SELECT * FROM public.treksafe_migraciones WHERE version='029'")).rows;
    assert.equal(registro.length, 1);
    assert.equal(registro[0].hu, 'HU-47');
    await assert.rejects(admin.query(await readFile(path.join(root, 'backend/migrations/029_hu47_estadisticas_incidentes.sql'), 'utf8')), /029 ya está registrada/);
    await admin.query('ROLLBACK');
    assert.deepEqual((await admin.query("SELECT * FROM public.treksafe_migraciones WHERE version='029'")).rows, registro);
  });
  if (args.includes('--hu48')) {
    const { probarSqlHu48 } = await import('./hu48-sql.mjs');
    pasadas += await probarSqlHu48({ admin, servicio, root, actores: { ana, beto, sinPerfil, senderista }, desde, hasta });
  }
  if (args.includes('--with-browser')) {
    const { probarFlujoCompletoHu47 } = await import('./hu47-flujo-completo.mjs');
    await probarFlujoCompletoHu47({
      admin, config, carpeta, root, postgrest: path.resolve(valor('--postgrest')),
      actores: { ana, beto, sinPerfil, senderista }, desde, hasta,
      hu48: args.includes('--hu48'),
    });
  }
  console.log(`${pasadas}/${pasadas} comprobaciones PostgreSQL aprobadas. Solo base local desechable; sin Supabase.`);
} finally {
  await servicio?.end();
  await admin?.end();
  if (iniciado) await control(['-D', datos, '-m', 'fast', '-w', 'stop']);
  console.log(`Instancia detenida. Logs temporales conservados en ${carpeta}`);
}
