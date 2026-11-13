// PostgreSQL 17/PostgREST desechables. Nunca lee .env ni usa un destino remoto.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const value = key => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1]; };
const bin = path.resolve(value('--pg-bin') ?? '');
const rest = value('--postgrest') && path.resolve(value('--postgrest'));
assert.ok(value('--pg-bin') && rest, 'Usar --pg-bin <bin> --postgrest <postgrest.exe>');
const workspace = await mkdtemp(path.join(tmpdir(), 'treksafe-dep108-'));
const data = path.join(workspace, 'pgdata');
const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, CRON_ENABLED: 'false' };
for (const key of Object.keys(env))
    if (/^(PG|PGRST|SUPABASE|DATABASE_URL|BREVO|SMTP)/i.test(key))
        delete env[key];
const freePort = () => new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const port = await freePort();
let restPort;
do {
    restPort = await freePort();
} while (restPort === port);
const database = 'treksafe_dep108_desechable';
const config = { host: '127.0.0.1', port, database, user: 'postgres' };
const exe = name => path.join(bin, process.platform === 'win32' ? `${name}.exe` : name);
const run = (file, argv, options = {}) => new Promise((resolve, reject) => execFile(file, argv, { env, windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...options }, (e, o, s) => e ? reject(new Error(String(s || o || e.message))) : resolve(String(o))));
const control = argv => new Promise((resolve, reject) => { const c = spawn(exe('pg_ctl'), argv, { env, windowsHide: true, stdio: 'ignore' }); c.on('error', reject); c.on('exit', code => code === 0 ? resolve() : reject(new Error(`pg_ctl ${code}; ${workspace}`))); });
let started = false, pool, restChild, count = 0;
const baseMigrations = [
    '000_registro_migraciones', '001_hu29_plantillas_ruta', '002_hu26_version_y_eventos_plan', '003_hu26_rpc_editar_expedicion',
    '004_hu27_estado_cancelada', '005_hu27_rpc_cancelar_expedicion', '006_hu27_permiso_anonimizar_eventos', '007_hu35_rpc_ampliar_retorno',
    '20261101_hu30_listas_equipo', '20261101_hu30_operaciones_equipo', '008_hu31_preparacion_expedicion', '009_hu31_operaciones_preparacion',
    '010_hu32_puntos_ruta', '011_hu29_endurecer_permisos', '012_hu36_eventos_plan_solo_anexado', '013_hu37_avisos', '014_hu38_minutos_recordatorio',
    '016_hu34_avances_expedicion', '017_hu39_asumir_coordinacion', '018_hu27_cancelar_salida_futura', '019_hu41_bitacora_incidente'
];
const newMigrations = ['015_hu45_outbox', '022_dep108_crear_expedicion_atomica', '023_dep108_avisos_transaccionales', '024_dep108_vencimientos_outbox', '020_hu49_creacion_plan_idempotente'];
const apply = async (client, names) => { for (const name of names)
    await client.query(await readFile(path.join(root, 'backend/migrations', `${name}.sql`), 'utf8')); };
const roles = `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
 GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon,authenticated,service_role;`;
const test = async (name, fn) => { await fn(); console.log(`OK ${++count}: ${name}`); };
const client = async (name) => { const c = new pg.Client({ ...config, application_name: name }); await c.connect(); return c; };
const tx = async (fn) => { const c = await client('dep108-test'); try {
    await c.query('BEGIN');
    await fn(c);
}
finally {
    await c.query('ROLLBACK');
    await c.end();
} };
const rejects = async (c, fn, pattern) => { await c.query('SAVEPOINT expected_error'); await assert.rejects(fn, pattern); await c.query('ROLLBACK TO SAVEPOINT expected_error'); };
const role = c => c.query('SET LOCAL ROLE service_role');
const callCreate = async (c, f, changes = {}) => (await c.query('SELECT public.treksafe_crear_expedicion($1,$2) r', [f.actor, { ...f.input, ...changes }])).rows[0].r;
const fixture = async (c, { future = 180, other = true } = {}) => {
    const actor = randomUUID(), contact = randomUUID(), stranger = randomUUID(), contactOther = randomUUID();
    for (const [id, prefix] of [[actor, 'senderista'], ...(other ? [[stranger, 'otro']] : [])]) {
        await c.query("INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol) VALUES($1,$2,'hash-ficticio','senderista')", [id, `${prefix}.${id}@example.invalid`]);
        await c.query("INSERT INTO public.perfiles_senderista VALUES($1,'Persona ficticia','999999999',$2)", [id, id.slice(0, 20)]);
    }
    await c.query("INSERT INTO public.contactos_emergencia(id,senderista_id,nombre_completo,parentesco,telefono,correo_electronico) VALUES($1,$2,'Contacto ficticio','amistad','999999999',$3)", [contact, actor, `contacto.${contact}@example.invalid`]);
    if (other)
        await c.query("INSERT INTO public.contactos_emergencia(id,senderista_id,nombre_completo,parentesco,telefono,correo_electronico) VALUES($1,$2,'Contacto ajeno','amistad','999999999',$3)", [contactOther, stranger, `otro.${contactOther}@example.invalid`]);
    return { actor, contact, stranger, contactOther, input: { lugarInicio: 'Inicio ficticio', lugarFin: 'Destino ficticio', coordenadasInicio: '-12.00000,-77.00000', coordenadasFin: null, horaInicio: new Date(Date.now() + future * 1000).toISOString(), horaRetornoEstimada: new Date(Date.now() + 3600000).toISOString(), minutosTolerancia: 30, minutosRecordatorio: 30, estado: 'programada', idsContactos: [contact], nombresAcompanantes: ['Persona acompañante'] } };
};
const state = async (c, id) => (await c.query('SELECT to_jsonb(e) r FROM public.expediciones e WHERE id=$1', [id])).rows[0]?.r;
const planInput = (f, changes = {}) => ({ ...f.input, ...changes });
const edit = async (c, f, e, op = randomUUID(), changes = {}) => (await c.query('SELECT public.treksafe_editar_expedicion($1,$2,$3,$4,$5) r', [e.id, f.actor, e.version, planInput(f, { lugarFin: 'Destino modificado', ...changes }), op])).rows[0].r;
const expire = async (c, limit = 100) => (await c.query('SELECT public.treksafe_evaluar_vencimientos_con_outbox($1) r', [limit])).rows[0].r;
const expired = async (c, f) => { const e = await callCreate(c, f); await c.query("UPDATE public.expediciones SET estado='en_progreso',hora_inicio=clock_timestamp()-interval '2 hours',hora_retorno_estimada=clock_timestamp()-interval '1 hour',minutos_tolerancia=1 WHERE id=$1", [e.id]); return e; };
const waitLock = async (name) => { for (let i = 0; i < 100; i++) {
    if ((await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock') r", [name])).rows[0].r)
        return;
    await delay(20);
} throw new Error(`No se observó bloqueo: ${name}`); };
const counts = async (c) => (await c.query(`SELECT (SELECT count(*) FROM public.expediciones)::int e,(SELECT count(*) FROM public.vinculos_expedicion_contacto)::int v,(SELECT count(*) FROM public.acompanantes_expedicion)::int a`)).rows[0];
const inject = async (c, table) => { await c.query(`CREATE FUNCTION public.dep108_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FALLO_INYECTADO'; END $$; CREATE TRIGGER dep108_failure BEFORE INSERT ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.dep108_failure();`); };
try {
    await run(exe('initdb'), ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
    // CI no necesita escribir sockets en /var/run/postgresql: usa solo TCP loopback.
    await writeFile(path.join(data, 'postgresql.auto.conf'), "unix_socket_directories = ''\n");
    await control(['-D', data, '-l', path.join(workspace, 'postgres.log'), '-w', 'start', '-o', `-h 127.0.0.1 -p ${port} -c timezone=UTC -c max_connections=30`]);
    started = true;
    console.log(`Clúster temporal: ${workspace}; puerto PostgreSQL ${port}`);
    const admin = new pg.Client({ ...config, database: 'postgres' });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${database}`);
    await admin.end();
    pool = new pg.Pool(config);
    await pool.query(roles);
    await pool.query(await readFile(path.join(root, 'init_schema.sql'), 'utf8'));
    await apply(pool, baseMigrations);
    await test('regresiones SQL históricas HU-27/HU-39/HU-36/HU-41 antes de actualizar', async () => { for (const f of ['hu27_cancelar_salida_futura.test.sql', 'hu39_asumir_coordinacion.test.sql', 'hu36_eventos_plan_solo_anexado.test.sql', 'hu41_bitacora_incidente.test.sql']) {
        const c = await client('dep108-regression');
        try {
            await c.query(await readFile(path.join(root, 'backend/migrations/tests', f), 'utf8'));
        }
        finally {
            await c.query('ROLLBACK');
            await c.end();
        }
    } });
    const originalUsers = (await pool.query('SELECT count(*)::int n FROM public.usuarios')).rows[0].n;
    await test('actualización conserva datos y asientos históricos', async () => { await apply(pool, newMigrations); assert.equal((await pool.query('SELECT count(*)::int n FROM public.usuarios')).rows[0].n, originalUsers); assert.equal((await pool.query("SELECT count(*)::int n FROM public.treksafe_migraciones WHERE version IN ('015','022','023','024')")).rows[0].n, 4); });
    await test('instalación nueva aplica el orden completo', async () => { const a = new pg.Client({ ...config, database: 'postgres' }); await a.connect(); await a.query('CREATE DATABASE treksafe_dep108_nueva_desechable'); await a.end(); const fresh = new pg.Client({ ...config, database: 'treksafe_dep108_nueva_desechable' }); await fresh.connect(); try {
        await fresh.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;');
        await fresh.query(await readFile(path.join(root, 'init_schema.sql'), 'utf8'));
        await apply(fresh, baseMigrations);
        await apply(fresh, newMigrations);
        assert.ok((await fresh.query("SELECT to_regprocedure('public.treksafe_crear_expedicion(uuid,jsonb)') IS NOT NULL r")).rows[0].r);
    }
    finally {
        await fresh.end();
    } });
    await test('crear programada guarda todas las colecciones como service_role', () => tx(async (c) => { const f = await fixture(c); await role(c); const e = await callCreate(c, f); assert.equal(e.estado, 'programada'); assert.equal(e.version, 1); assert.equal((await c.query('SELECT count(*)::int n FROM public.vinculos_expedicion_contacto WHERE expedicion_id=$1', [e.id])).rows[0].n, 1); assert.equal((await c.query('SELECT count(*)::int n FROM public.acompanantes_expedicion WHERE expedicion_id=$1', [e.id])).rows[0].n, 1); }));
    await test('regla de inicio próximo conserva en_progreso', () => tx(async (c) => { const f = await fixture(c, { future: 40 }); await role(c); assert.equal((await callCreate(c, f)).estado, 'en_progreso'); await rejects(c, () => callCreate(c, f), /EXPEDICION_ACTIVA_EXISTE/); }));
    await test('rechaza actor, contacto ajeno, arrays y fechas sin insertar', () => tx(async (c) => { const f = await fixture(c); await role(c); const before = await counts(c); for (const [change, code] of [[{ idsContactos: [f.contactOther] }, 'CONTACTOS_INVALIDOS'], [{ nombresAcompanantes: [{}] }, 'DATOS_INVALIDOS'], [{ horaInicio: '2000-01-01' }, 'HORA_INICIO_INVALIDA'], [{ coordenadasInicio: '91,0' }, 'DATOS_INVALIDOS'], [{ idsContactos: [f.contact, f.contact] }, 'CONTACTOS_INVALIDOS']])
        await rejects(c, () => callCreate(c, f, change), new RegExp(code)); await rejects(c, () => callCreate(c, { ...f, actor: randomUUID() }), /NO_ES_SENDERISTA/); assert.deepEqual(await counts(c), before); }));
    for (const table of ['vinculos_expedicion_contacto', 'acompanantes_expedicion'])
        await test(`fallo al insertar ${table} revierte cabecera y colecciones`, () => tx(async (c) => { const f = await fixture(c); const before = await counts(c); await inject(c, table); await role(c); await rejects(c, () => callCreate(c, f), /FALLO_INYECTADO/); assert.deepEqual(await counts(c), before); }));
    await test('edición confirma evento y aviso; reintento no duplica', () => tx(async (c) => { const f = await fixture(c); await role(c); const e = await callCreate(c, f), op = randomUUID(); await edit(c, f, e, op); await edit(c, f, e, op); const rows = (await c.query('SELECT e.id,a.clave_evento,a.tipo FROM public.eventos_plan e JOIN public.avisos_usuario a ON a.evento_id=e.id WHERE e.operacion_id=$1', [op])).rows; assert.equal(rows.length, 1); assert.equal(rows[0].clave_evento, rows[0].id); assert.equal(rows[0].tipo, 'edicion'); }));
    await test('fallo de aviso revierte cambio y evento', () => tx(async (c) => { const f = await fixture(c); const e = await callCreate(c, f); const before = await state(c, e.id); await inject(c, 'avisos_usuario'); await role(c); await rejects(c, () => edit(c, f, e), /FALLO_INYECTADO/); assert.deepEqual(await state(c, e.id), before); assert.equal((await c.query('SELECT count(*)::int n FROM public.eventos_plan WHERE expedicion_id=$1', [e.id])).rows[0].n, 0); }));
    await test('cancelación y ampliación generan sus avisos atómicos', () => tx(async (c) => { const f = await fixture(c); await role(c); const e = await callCreate(c, f); await c.query('SELECT public.treksafe_cancelar_expedicion($1,$2,$3,$4)', [e.id, f.actor, 'Motivo ficticio', randomUUID()]); const f2 = await fixture(c); const e2 = await callCreate(c, f2); await c.query("UPDATE public.expediciones SET estado='en_progreso' WHERE id=$1", [e2.id]); await c.query('SELECT public.treksafe_ampliar_retorno($1,$2,$3,$4,$5,$6)', [e2.id, f2.actor, e2.version, 15, 'Prueba', randomUUID()]); assert.deepEqual((await c.query('SELECT tipo FROM public.avisos_usuario WHERE expedicion_id=ANY($1) ORDER BY tipo', [[e.id, e2.id]])).rows.map(x => x.tipo), ['ampliacion', 'cancelacion']); }));
    await test('versión obsoleta y actor ajeno no dejan eventos ni avisos', () => tx(async (c) => { const f = await fixture(c); await role(c); const e = await callCreate(c, f); await rejects(c, () => edit(c, f, { ...e, version: 999 }), /VERSION_OBSOLETA/); await rejects(c, () => edit(c, { ...f, actor: f.stranger }, e), /EXPEDICION_NO_ENCONTRADA/); assert.equal((await c.query('SELECT count(*)::int n FROM public.eventos_plan WHERE expedicion_id=$1', [e.id])).rows[0].n, 0); }));
    await test('vencimiento confirma estado y outbox idempotente sin ficha médica', () => tx(async (c) => { const f = await fixture(c); await role(c); const e = await expired(c, f); const r = await expire(c); assert.ok(r.expediciones.includes(e.id)); const messages = (await c.query("SELECT * FROM public.outbox_notificaciones WHERE metadata->>'expedicionId'=$1", [e.id])).rows; assert.ok(messages.length >= 2); assert.ok(messages.every(m => m.estado === 'pendiente')); assert.ok(messages.every(m => !JSON.stringify(m).match(/alerg|sangre|medicamento|condiciones_encriptadas/i))); assert.equal((await state(c, e.id)).estado, 'alerta'); assert.equal((await expire(c)).enAlerta, 0); }));
    await test('fallo de outbox revierte el cambio a alerta', () => tx(async (c) => { const f = await fixture(c); const e = await expired(c, f); const before = await state(c, e.id); await inject(c, 'outbox_notificaciones'); await role(c); await rejects(c, () => expire(c), /FALLO_INYECTADO/); assert.deepEqual(await state(c, e.id), before); }));
    await test('unicidad de evento/destinatario/canal normaliza correo', () => tx(async (c) => { await role(c); await c.query("INSERT INTO public.outbox_notificaciones(clave_evento,tipo_evento,destinatario,asunto,cuerpo) VALUES('evento','prueba','A@example.invalid','Prueba','Prueba')"); await rejects(c, () => c.query("INSERT INTO public.outbox_notificaciones(clave_evento,tipo_evento,destinatario,asunto,cuerpo) VALUES('evento','prueba','a@example.invalid','Prueba','Prueba')"), /uq_outbox_evento_destinatario_canal/); }));
    await test('anon y authenticated no pueden acceder a tablas/RPC privados', () => tx(async (c) => { for (const r of ['anon', 'authenticated']) {
        await c.query(`SET LOCAL ROLE ${r}`);
        for (const text of ['SELECT * FROM public.outbox_notificaciones', 'SELECT public.treksafe_crear_expedicion(NULL,NULL)', 'SELECT public.treksafe_evaluar_vencimientos_con_outbox(1)'])
            await rejects(c, () => c.query(text), /permission denied/);
        await c.query('RESET ROLE');
    } }));
    await test('dos creaciones inmediatas concurrentes dejan solo una bloqueante', async () => { const seed = await client('dep108-seed'); const f = await fixture(seed, { future: 45 }); await seed.end(); const a = await client('dep108-create-a'), b = await client('dep108-create-b'); try {
        await a.query('BEGIN');
        await a.query('SET ROLE service_role');
        await b.query('BEGIN');
        await b.query('SET ROLE service_role');
        await callCreate(a, f);
        const result = callCreate(b, f).then(r => ({ r }), error => ({ error }));
        await waitLock('dep108-create-b');
        await a.query('COMMIT');
        const second = await result;
        assert.match(second.error?.message ?? '', /EXPEDICION_ACTIVA_EXISTE/);
        await b.query('ROLLBACK');
        assert.equal((await pool.query("SELECT count(*)::int n FROM public.expediciones WHERE senderista_id=$1 AND estado IN ('en_progreso','alerta')", [f.actor])).rows[0].n, 1);
    }
    finally {
        await a.query('ROLLBACK');
        await b.query('ROLLBACK');
        await a.end();
        await b.end();
        await pool.query('DELETE FROM public.usuarios WHERE id=ANY($1)', [[f.actor, f.stranger]]);
    } });
    await test('creación frente a promoción del cron respeta unicidad global', async () => { const c = await client('dep108-race-seed'); const f = await fixture(c, { future: 45 }); const scheduled = await callCreate(c, f, { horaInicio: new Date(Date.now() + 180000).toISOString() }); const a = await client('dep108-create-race'), b = await client('dep108-promote-race'); try {
        await a.query('BEGIN');
        await role(a);
        await callCreate(a, f);
        await b.query('BEGIN');
        await role(b);
        const pending = b.query("UPDATE public.expediciones SET estado='en_progreso' WHERE id=$1", [scheduled.id]).then(r => ({ r }), error => ({ error }));
        await waitLock('dep108-promote-race');
        await a.query('COMMIT');
        assert.equal((await pending).error?.code, '23505');
        await b.query('ROLLBACK');
    }
    finally {
        await a.query('ROLLBACK');
        await b.query('ROLLBACK');
        await a.end();
        await b.end();
        await c.query('DELETE FROM public.usuarios WHERE id=ANY($1)', [[f.actor, f.stranger]]);
        await c.end();
    } });
    await test('ampliación bloqueada impide falso vencimiento (SKIP LOCKED y nueva hora)', async () => { const c = await client('dep108-expiry-seed'); const f = await fixture(c); const e = await expired(c, f); const a = await client('dep108-ampliar'), b = await client('dep108-expirar'); try {
        await a.query('BEGIN');
        await role(a);
        await a.query("UPDATE public.expediciones SET hora_retorno_estimada=clock_timestamp()+interval '1 hour' WHERE id=$1", [e.id]);
        await b.query('BEGIN');
        await role(b);
        assert.equal((await expire(b)).enAlerta, 0);
        await a.query('COMMIT');
        assert.equal((await expire(b)).enAlerta, 0);
        await b.query('COMMIT');
        assert.equal((await state(c, e.id)).estado, 'en_progreso');
    }
    finally {
        await a.query('ROLLBACK');
        await b.query('ROLLBACK');
        await a.end();
        await b.end();
        await c.query('DELETE FROM public.usuarios WHERE id=ANY($1)', [[f.actor, f.stranger]]);
        await c.end();
    } });
    await test('dos evaluadores no duplican pendientes', async () => { const c = await client('dep108-expiry-seed'); const f = await fixture(c); const e = await expired(c, f); const a = await client('dep108-expire-a'), b = await client('dep108-expire-b'); try {
        await a.query('BEGIN');
        await role(a);
        await b.query('BEGIN');
        await role(b);
        assert.ok((await expire(a)).expediciones.includes(e.id));
        assert.equal((await expire(b)).enAlerta, 0);
        await a.query('COMMIT');
        await b.query('COMMIT');
        assert.equal((await c.query("SELECT count(*)::int n FROM public.outbox_notificaciones WHERE clave_evento=$1", [`ALERTA_CONTACTO:${e.id}`])).rows[0].n, 1);
    }
    finally {
        await a.query('ROLLBACK');
        await b.query('ROLLBACK');
        await a.end();
        await b.end();
        await c.query("DELETE FROM public.outbox_notificaciones WHERE metadata->>'expedicionId'=$1", [e.id]);
        await c.query('DELETE FROM public.usuarios WHERE id=ANY($1)', [[f.actor, f.stranger]]);
        await c.end();
    } });
    await test('HU-39 conserva coordinación e idempotencia con outbox y nuevo índice', () => tx(async (c) => { const f = await fixture(c); await role(c); const e = await expired(c, f); await expire(c); const op = randomUUID(), rescuer = '22222222-2222-4222-8222-222222222222'; const first = (await c.query('SELECT public.treksafe_asumir_coordinacion($1,$2,$3) r', [e.id, rescuer, op])).rows[0].r; const second = (await c.query('SELECT public.treksafe_asumir_coordinacion($1,$2,$3) r', [e.id, rescuer, op])).rows[0].r; assert.equal(first.id, second.id); assert.equal(second.repetido, true); assert.equal(first.responsable.id, rescuer); }));
    await test('HU-27 rechaza cancelar cuando la salida pasa esperando el bloqueo', async () => { const c = await client('dep108-clock-seed'); const f = await fixture(c); const e = await callCreate(c, f); await c.query("UPDATE public.expediciones SET hora_inicio=clock_timestamp()+interval '700 milliseconds' WHERE id=$1", [e.id]); const a = await client('dep108-clock-holder'), b = await client('dep108-clock-cancel'); try {
        await a.query('BEGIN');
        await a.query('SELECT id FROM public.expediciones WHERE id=$1 FOR UPDATE', [e.id]);
        await b.query('BEGIN');
        await role(b);
        const pending = b.query('SELECT public.treksafe_cancelar_expedicion($1,$2,$3,$4)', [e.id, f.actor, 'Prueba de bloqueo', randomUUID()]).then(r => ({ r }), error => ({ error }));
        await waitLock('dep108-clock-cancel');
        await delay(800);
        await a.query('COMMIT');
        assert.match((await pending).error?.message ?? '', /PLAN_NO_CANCELABLE/);
        await b.query('ROLLBACK');
        assert.equal((await state(c, e.id)).estado, 'programada');
    }
    finally {
        await a.query('ROLLBACK');
        await b.query('ROLLBACK');
        await a.end();
        await b.end();
        await c.query('DELETE FROM public.usuarios WHERE id=ANY($1)', [[f.actor, f.stranger]]);
        await c.end();
    } });
    await test('regresiones HU-27/HU-39/HU-36/HU-41 sobre el esquema ampliado', async () => { for (const f of ['hu27_cancelar_salida_futura.test.sql', 'hu39_asumir_coordinacion.test.sql', 'hu36_eventos_plan_solo_anexado.test.sql', 'hu41_bitacora_incidente.test.sql']) {
        const c = await client('dep108-regression-new');
        try {
            await c.query(await readFile(path.join(root, 'backend/migrations/tests', f), 'utf8'));
        }
        finally {
            await c.query('ROLLBACK');
            await c.end();
        }
    } });
    for (const hu of [30, 31, 36, 41]) {
        await test(`HU-${hu} contrato DAO y casos de uso reales sobre esquema DEP-04`, async () => {
            const output = await run(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', `src/testing/hu${hu}Postgres.integration.test.ts`], {
                cwd: path.join(root, 'backend'),
                env: { ...env, [`HU${hu}_TEST_DATABASE_URL`]: `postgresql://postgres@127.0.0.1:${port}/${database}` },
            });
            const passed = Number(output.match(/^# pass (\d+)\s*$/m)?.[1] ?? 0);
            assert.ok(passed > 0, `HU-${hu} debe ejecutar casos reales; salida: ${output}`);
            assert.match(output, /^# fail 0\s*$/m);
            assert.match(output, /^# cancelled 0\s*$/m);
            assert.match(output, /^# skipped 0\s*$/m);
            console.log(output);
        });
    }
    if (value('--dev-check'))
        await test('comprobación DEV controlada ensayada localmente con rollback', async () => { const c = await client('dep108-dev-check'); try {
            const results = await c.query(await readFile(path.resolve(value('--dev-check')), 'utf8'));
            const last = Array.isArray(results) ? results.at(-1) : results;
            console.log(JSON.stringify(last.rows));
        }
        finally {
            await c.query('ROLLBACK');
            await c.end();
        } });
    const key = randomBytes(40).toString('hex');
    const conf = path.join(workspace, 'postgrest.conf');
    await writeFile(conf, `db-uri = "postgresql://postgres@127.0.0.1:${port}/${database}"\ndb-schemas = "public"\ndb-anon-role = "anon"\nserver-host = "127.0.0.1"\nserver-port = ${restPort}\n`);
    restChild = spawn(rest, [conf], { env: { ...env, PGRST_JWT_SECRET: key }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let restLog = '';
    let restSpawnError = null;
    // ENOENT/EACCES arrive asynchronously. Capture them so the outer finally
    // closes PostgreSQL instead of an unhandled EventEmitter error terminating Node.
    restChild.on('error', error => { restSpawnError = error; });
    restChild.stderr.on('data', x => restLog += x);
    restChild.stdout.on('data', x => restLog += x);
    for (let i = 0;; i++) {
        if (restSpawnError)
            throw new Error(`No se pudo iniciar PostgREST: ${restSpawnError.message}`);
        try {
            const r = await fetch(`http://127.0.0.1:${restPort}/`);
            if (r.ok)
                break;
        }
        catch { }
        if (restSpawnError)
            throw new Error(`No se pudo iniciar PostgREST: ${restSpawnError.message}`);
        if (restChild.exitCode !== null)
            throw new Error(`PostgREST terminó: ${restChild.exitCode}: ${restLog}`);
        if (i >= 600)
            throw new Error(`PostgREST no inició: ${restLog}`);
        await delay(100);
    }
    await test('SDK Supabase y adaptador reales contra PostgREST nativo', async () => { console.log(await run(process.execPath, ['--import', 'tsx', 'src/testing/dep108Sdk.integration.ts'], { cwd: path.join(root, 'backend'), env: { ...env, DEP108_TEST_DATABASE_URL: `postgresql://postgres@127.0.0.1:${port}/${database}`, DEP108_TEST_REST_URL: `http://127.0.0.1:${restPort}`, DEP108_TEST_JWT_SECRET: key } })); });
    console.log(`DEP-108: ${count} escenarios aprobados; PostgreSQL ${(await pool.query('SHOW server_version')).rows[0].server_version}; ${process.version}`);
    console.log(`Evidencia temporal: ${workspace}`);
}
finally {
    try {
        if (restChild?.pid && restChild.exitCode === null && restChild.signalCode === null) {
            const stopped = new Promise(resolve => restChild.once('exit', resolve));
            restChild.kill();
            await stopped;
        }
    }
    finally {
        if (pool)
            await pool.end();
        if (started) {
            await control(['-D', data, '-m', 'fast', '-w', 'stop']);
            console.log(`PostgreSQL temporal detenido: ${port}`);
        }
    }
}
