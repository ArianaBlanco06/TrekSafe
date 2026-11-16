// PostgreSQL desechable HU-34. No lee .env ni utiliza conexiones remotas.
import assert from 'node:assert/strict';
import { execFile, spawn, fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
assert.equal(args[0], '--pg-bin'); assert.ok(args[1], 'Indicar carpeta PostgreSQL bin');
const withBrowser = args.includes('--with-browser');
const restIndex = args.indexOf('--postgrest');
const restBin = restIndex >= 0 ? args[restIndex + 1] : null;
if (withBrowser) assert.ok(restBin, 'Indicar --postgrest <ejecutable>');
const bin = path.resolve(args[1]);
const workspace = await mkdtemp(path.join(tmpdir(), 'treksafe-hu34-'));
const dataDir = path.join(workspace, 'data');
const env = { ...process.env, CRON_ENABLED: 'false' };
for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('PG')) delete env[key];
const port = await new Promise(resolve => {
  const server = net.createServer(); server.listen(0, '127.0.0.1', () => {
    const value = server.address().port; server.close(() => resolve(value));
  });
});
// El bootstrap HTTP reutilizado de HU-32 comprueba este usuario, loopback y puerto.
const config = { host: '127.0.0.1', port, user: 'treksafe_hu32_test', database: 'postgres' };
const exe = name => path.join(bin, process.platform === 'win32' ? `${name}.exe` : name);
const run = (file, argv, options = {}) => new Promise((resolve, reject) => {
  execFile(file, argv, { env, windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...options },
    (error, stdout, stderr) => error ? reject(new Error(String(stderr || stdout || error.message))) : resolve(String(stdout)));
});
const controlPg = argv => new Promise((resolve, reject) => {
  const child = spawn(exe('pg_ctl'), argv, { env, windowsHide: true, stdio: 'ignore' });
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`pg_ctl ${code}: ${workspace}`)));
});
let pool; let started = false; let count = 0;
const actor = '11111111-1111-4111-8111-111111111111';
const otro = '33333333-3333-4333-8333-333333333333';
const plan = 'b1d0d5c0-8327-4af1-9cc1-2e83ae7e0320';
const plan2 = randomUUID(); const planOtro = randomUUID();
const punto = randomUUID(); const punto2 = randomUUID(); const puntoOtro = randomUUID();
const query = (...a) => pool.query(...a);
const record = async (id, point = punto, expedition = plan, owner = actor, note = null, client = pool) => {
  const response = await client.query(`SELECT public.treksafe_registrar_avance($1,$2,$3,$4,$5) AS r`, [owner,expedition,id,point,note]);
  return response.rows[0].r;
};
const last = async (expedition = plan, owner = actor) => (await query(
  'SELECT public.treksafe_consultar_ultimo_avance($1,$2) AS r',[owner,expedition])).rows[0].r;
const snapshot = async () => (await query('SELECT to_jsonb(e) AS r FROM public.expediciones e WHERE id=$1',[plan])).rows[0].r;
const test = async (name, fn) => { await fn(); console.log(`OK ${++count}: ${name}`); };
const locked = async name => {
  for (let i=0;i<100;i++) {
    if ((await query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock') AS r",[name])).rows[0].r) return;
    await delay(20);
  }
  throw new Error(`No se observó bloqueo de ${name}`);
};
try {
  await run(exe('initdb'), ['-D',dataDir,'-U',config.user,'--auth=trust','--encoding=UTF8','--locale=C']);
  await controlPg(['-D',dataDir,'-l',path.join(workspace,'postgres.log'),'-w','start','-o',`-h 127.0.0.1 -p ${port} -c timezone=UTC -c max_connections=20`]);
  started = true; pool = new pg.Pool({ ...config, max: 8 });
  console.log(`Instancia temporal: ${workspace}; PostgreSQL ${(await query('SHOW server_version')).rows[0].server_version}`);
  await query(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon,authenticated,service_role;`);
  await query(await readFile(path.join(root,'init_schema.sql'),'utf8'));
  const migration = await readFile(path.join(root,'backend/migrations/016_hu34_avances_expedicion.sql'),'utf8');
  await test('sin 010 rechaza la instalación sin crear avances',async () => {
    const client = await pool.connect();
    try { await assert.rejects(client.query(migration), /HU34_PUNTOS_REQUERIDOS/); await client.query('ROLLBACK'); }
    finally { client.release(); }
    assert.equal((await query("SELECT to_regclass('public.avances_expedicion') AS r")).rows[0].r,null);
  });
  for (const name of ['000_registro_migraciones.sql','002_hu26_version_y_eventos_plan.sql','003_hu26_rpc_editar_expedicion.sql',
    '004_hu27_estado_cancelada.sql','005_hu27_rpc_cancelar_expedicion.sql','006_hu27_permiso_anonimizar_eventos.sql',
    '007_hu35_rpc_ampliar_retorno.sql','010_hu32_puntos_ruta.sql','013_hu37_avisos.sql','014_hu38_minutos_recordatorio.sql']) {
    await query(await readFile(path.join(root,'backend/migrations',name),'utf8'));
  }
  await query(migration);
  await query(`INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol) VALUES($1,'otro@example.invalid','fixture','senderista')`,[otro]);
  await query(`INSERT INTO public.perfiles_senderista(usuario_id,nombre_completo,telefono,id_documento) VALUES($1,'Otro ficticio','999999999','00000001')`,[otro]);
  for (const [id, owner, point] of [[plan,actor,punto],[plan2,actor,punto2],[planOtro,otro,puntoOtro]]) {
    await query(`INSERT INTO public.expediciones(id,senderista_id,lugar_inicio,lugar_fin,coordenadas_inicio,coordenadas_fin,
      hora_inicio,hora_retorno_estimada,estado) VALUES($1,$2,'Inicio','Destino','-9.04, -77.61','-9.01, -77.60',now()-interval '1 hour',now()+interval '1 day','en_progreso')`,[id,owner]);
    await query("INSERT INTO public.puntos_ruta(id,expedicion_id,nombre,latitud,longitud,orden) VALUES($1,$2,'Mirador',-9.03,-77.6,1)",[point,id]);
  }
  await test('registra 016 y conserva permisos cerrados',async () => {
    assert.deepEqual((await query("SELECT nombre,hu FROM public.treksafe_migraciones WHERE version='016'")).rows,[{nombre:'hu34_avances_expedicion',hu:'HU-34'}]);
    const grants = await query(`SELECT has_table_privilege('service_role','public.avances_expedicion','INSERT') AS directo,
      has_function_privilege('anon','public.treksafe_registrar_avance(uuid,uuid,uuid,uuid,text)','EXECUTE') AS anon,
      has_function_privilege('service_role','public.treksafe_registrar_avance(uuid,uuid,uuid,uuid,text)','EXECUTE') AS rpc`);
    assert.deepEqual(grants.rows[0],{directo:false,anon:false,rpc:true});
  });
  const id = randomUUID(); let original;
  await test('punto, nota normalizada y hora servidor; plan y eventos intactos',async () => {
    const before=await snapshot(); const events=(await query('SELECT count(*) FROM public.eventos_plan')).rows;
    const start=Date.now(); original=await record(id,punto,plan,actor,' \tNota\r\nsegunda línea  ');
    assert.equal(original.tipo,'registrado'); assert.equal(original.avance.nota,'Nota\nsegunda línea');
    assert.ok(Date.parse(original.avance.registradoEn)>=start-1000 && Date.parse(original.avance.registradoEn)<=Date.now()+1000);
    assert.deepEqual(await snapshot(),before); assert.deepEqual((await query('SELECT count(*) FROM public.eventos_plan')).rows,events);
  });
  await test('reenvío equivalente devuelve el mismo ID, fotografía y fecha',async () => {
    const repeated=await record(id,punto,plan,actor,'Nota\nsegunda línea');
    assert.equal(repeated.tipo,'repetido'); assert.deepEqual(repeated.avance,original.avance);
  });
  await test('mismo ID con otra nota o expedición es conflicto',async () => {
    assert.equal((await record(id,punto,plan,actor,'otra')).tipo,'solicitud_reutilizada');
    assert.equal((await record(id,punto2,plan2)).tipo,'solicitud_reutilizada');
  });
  await test('privacidad del propietario y puntos de otra ruta',async () => {
    assert.equal((await record(randomUUID(),punto,plan,otro)).tipo,'no_encontrado');
    assert.equal(await last(plan,otro),null);
    assert.equal((await record(randomUUID(),punto2)).tipo,'punto_no_disponible');
    assert.equal((await record(randomUUID(),randomUUID())).tipo,'punto_no_disponible');
  });
  await test('otra cuenta puede usar el UUID sin recuperar información ajena',async () => {
    const result=await record(id,puntoOtro,planOtro,otro);
    assert.equal(result.tipo,'registrado'); assert.notEqual(result.avance.id,original.avance.id);
  });
  for (const state of ['programada','alerta','completada','cancelada']) await test(`rechaza registro nuevo en ${state} y permite recuperar uno previo`,async () => {
    await query('UPDATE public.expediciones SET estado=$2 WHERE id=$1',[plan,state]);
    assert.equal((await record(randomUUID())).tipo,'estado_no_admitido');
    assert.equal((await record(id,punto,plan,actor,'Nota\nsegunda línea')).tipo,'repetido');
  });
  await query("UPDATE public.expediciones SET estado='en_progreso' WHERE id=$1",[plan]);
  await test('500 puntos Unicode, blancos y controles inválidos',async () => {
    assert.equal((await record(randomUUID(),punto,plan,actor,'🧭'.repeat(500))).tipo,'registrado');
    assert.equal((await record(randomUUID(),punto,plan,actor,'🧭'.repeat(501))).tipo,'datos_invalidos');
    assert.equal((await record(randomUUID(),punto,plan,actor,'mal\u0001')).tipo,'datos_invalidos');
    assert.equal((await record(randomUUID(),punto,plan,actor,' \t\r\n ')).avance.nota,null);
  });
  await test('dos envíos simultáneos equivalentes producen una sola fila',async () => {
    const request=randomUUID(); const a=await pool.connect(); const b=new pg.Client({...config,application_name:'hu34_repetido'}); await b.connect();
    try { await a.query('BEGIN'); const first=await record(request,punto,plan,actor,null,a);
      const pending=record(request,punto,plan,actor,null,b); await locked('hu34_repetido'); await a.query('COMMIT');
      const second=await pending; assert.equal(second.tipo,'repetido'); assert.deepEqual(second.avance,first.avance);
      assert.equal((await query('SELECT count(*)::int AS n FROM public.avances_expedicion WHERE senderista_id=$1 AND solicitud_id=$2',[actor,request])).rows[0].n,1);
    } finally { await a.query('ROLLBACK'); a.release(); await b.end(); }
  });
  await test('misma clave en dos expediciones concurrentes devuelve conflicto',async () => {
    const request=randomUUID(); const a=await pool.connect(); const b=new pg.Client({...config,application_name:'hu34_cruzado'}); await b.connect();
    try { await a.query('BEGIN'); await record(request,punto,plan,actor,null,a);
      const pending=record(request,punto2,plan2,actor,null,b); await locked('hu34_cruzado'); await a.query('COMMIT');
      assert.equal((await pending).tipo,'solicitud_reutilizada');
    } finally { await a.query('ROLLBACK'); a.release(); await b.end(); }
  });
  await test('alerta confirmada mientras espera el bloqueo impide un registro nuevo',async () => {
    const a=await pool.connect(); const b=new pg.Client({...config,application_name:'hu34_alerta'}); await b.connect();
    try { await a.query('BEGIN'); await a.query("UPDATE public.expediciones SET estado='alerta' WHERE id=$1",[plan]);
      const pending=record(randomUUID(),punto,plan,actor,null,b); await locked('hu34_alerta'); await a.query('COMMIT');
      assert.equal((await pending).tipo,'estado_no_admitido');
    } finally { await a.query('ROLLBACK'); a.release(); await b.end(); }
    await query("UPDATE public.expediciones SET estado='en_progreso' WHERE id=$1",[plan]);
  });
  await test('fallo de inserción revierte todo',async () => {
    const request=randomUUID(); const before=await snapshot();
    await query(`CREATE FUNCTION public.hu34_fallar() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'FALLO_HU34'; END$$;
      CREATE TRIGGER hu34_fallo BEFORE INSERT ON public.avances_expedicion FOR EACH ROW EXECUTE FUNCTION public.hu34_fallar();`);
    try { await assert.rejects(record(request),/FALLO_HU34/); }
    finally { await query('DROP TRIGGER hu34_fallo ON public.avances_expedicion; DROP FUNCTION public.hu34_fallar();'); }
    assert.deepEqual(await snapshot(),before);
    assert.equal((await query('SELECT count(*)::int AS n FROM public.avances_expedicion WHERE solicitud_id=$1',[request])).rows[0].n,0);
  });
  await test('FK compuesta protege pertenencia; borrar expedición elimina puntos y avances',async () => {
    await record(randomUUID(),punto2,plan2);
    await assert.rejects(query('DELETE FROM public.puntos_ruta WHERE id=$1',[punto2]),/foreign key/);
    await query('DELETE FROM public.expediciones WHERE id=$1',[plan2]);
    assert.equal((await query('SELECT count(*)::int AS n FROM public.avances_expedicion WHERE expedicion_id=$1',[plan2])).rows[0].n,0);
  });
  await test('avance no evita alerta al vencer y no modifica el plazo',async () => {
    await query("UPDATE public.expediciones SET hora_inicio=now()-interval '2 hours',hora_retorno_estimada=clock_timestamp()-interval '30 minutes'+interval '1 second',minutos_tolerancia=30 WHERE id=$1",[plan]);
    const before=await snapshot(); await record(randomUUID()); assert.deepEqual(await snapshot(),before);
    await delay(1100); await query('SELECT public.treksafe_marcar_expiradas_en_progreso_como_alerta()');
    assert.equal((await snapshot()).estado,'alerta');
    assert.equal((await snapshot()).hora_retorno_estimada,before.hora_retorno_estimada);
  });
  await test('último avance con orden estable y consulta autorizada',async () => {
    const result=await last(); assert.equal(result.tipo,'consultado');
    const expected=(await query('SELECT id FROM public.avances_expedicion WHERE expedicion_id=$1 ORDER BY registrado_en DESC,id DESC LIMIT 1',[plan])).rows[0].id;
    assert.equal(result.ultimoAvance.id,expected);
    assert.equal(await last(randomUUID()),null);
  });
  if (withBrowser) {
    const controlToken=randomUUID();
    const child=fork(path.join(root,'backend/scripts/hu32-integration-server.mjs'),[],{
      env:{...env,TREKSAFE_HU32_TEST_PG:JSON.stringify(config),TREKSAFE_HU32_CONTROL_TOKEN:controlToken,
        TREKSAFE_HU32_POSTGREST_BIN:path.resolve(restBin),TREKSAFE_HU32_POSTGREST_LOG:path.join(workspace,'postgrest.log'),TREKSAFE_HU32_PG_BIN:bin},
      execArgv:[],windowsHide:true,stdio:['ignore','inherit','inherit','ipc'],
    });
    try {
      const url=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('La API temporal no inició')),30000);
        child.once('error',e=>{clearTimeout(timer);reject(e);}); child.once('exit',code=>{clearTimeout(timer);reject(new Error(`API terminó ${code}`));});
        child.on('message',m=>{if(m?.type==='ready'){clearTimeout(timer);resolve(m.url);}});
      });
      console.log(await run(process.execPath,['node_modules/@playwright/test/cli.js','test','--config','playwright.hu34-integration.config.ts'],{
        cwd:path.join(root,'frontend'),env:{...env,TREKSAFE_HU32_BASE_URL:url,TREKSAFE_HU32_CONTROL_TOKEN:controlToken}}));
    } finally {
      if(child.exitCode===null&&child.signalCode===null){const closed=new Promise(resolve=>child.once('exit',resolve));const timer=setTimeout(()=>child.kill(),10000); if(child.connected)child.send('stop');else child.kill();await closed;clearTimeout(timer);}
      console.log('API y PostgREST temporales detenidos.');
    }
  }
  console.log(`RESULTADO HU-34: ${count} comprobaciones SQL aprobadas.`);
} finally {
  await pool?.end();
  if(started) { await controlPg(['-D',dataDir,'-m','fast','-w','stop']); console.log('PostgreSQL temporal detenido. Sin acceso a Supabase.'); }
}
