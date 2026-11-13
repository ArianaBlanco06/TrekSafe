// Solo un clúster temporal en loopback. No carga .env ni accede a Supabase.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
assert.equal(args[0], '--pg-bin'); assert.ok(args[1], 'Indicar --pg-bin <carpeta>');
const bin = path.resolve(args[1]);
const dir = await mkdtemp(path.join(tmpdir(), 'treksafe-hu49-'));
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('PG')) delete env[key];
const exe = name => path.join(bin, process.platform === 'win32' ? `${name}.exe` : name);
const run = (file, argv) => new Promise((resolve, reject) => execFile(file, argv,
  { env, windowsHide: true, maxBuffer: 16*1024*1024 }, (e,o,s) => e ? reject(new Error(String(s||o||e))) : resolve(o)));
const control = argv => new Promise((resolve,reject) => {
  const child = spawn(exe('pg_ctl'), argv, { env, windowsHide: true, stdio: 'ignore' });
  child.on('error',reject); child.on('exit',async code => {
    if (code === 0) return resolve();
    const log=await readFile(path.join(dir,'postgres.log'),'utf8').catch(()=>'(sin log de PostgreSQL)');
    reject(new Error(`pg_ctl: ${code}; ${dir}\n${log.slice(-6000)}`));
  });
});
const port = await new Promise(resolve => {
  const s=net.createServer(); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(()=>resolve(p)); });
});
let started=false; let pool; let count=0;
const actor=randomUUID(); const otro=randomUUID(); const contacto=randomUUID(); const contactoOtro=randomUUID();
const payload=()=>({lugarInicio:'Salida HU49',lugarFin:'Destino HU49',horaInicio:new Date(Date.now()+86400000).toISOString(),
  horaRetornoEstimada:new Date(Date.now()+90000000).toISOString(),minutosTolerancia:45,minutosRecordatorio:60,
  idsContactos:[contacto],nombresAcompanantes:['Persona de prueba']});
const invoke=async (id, datos, usuario=actor) => {
  const c=await pool.connect();
  try {
    await c.query('BEGIN; SET LOCAL ROLE service_role');
    const r=await c.query('SELECT public.treksafe_crear_plan_borrador($1,$2,$3) AS r',[usuario,id,datos]);
    await c.query('COMMIT'); return r.rows[0].r;
  } catch(e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
};
const test=async (nombre,fn)=>{await fn();console.log(`OK ${++count}: ${nombre}`);};
try {
  await run(exe('initdb'),['-D',`${dir}/data`,'-U','treksafe_hu49_desechable','--auth=trust','--encoding=UTF8','--locale=C']);
  // Linux necesita un socket en un directorio del usuario runner; el predeterminado
  // /var/run/postgresql pertenece a postgres. Windows usa solo la conexión TCP.
  const socket=process.platform === 'win32' ? '' : `-k ${dir}`;
  await control(['-D',`${dir}/data`,'-l',`${dir}/postgres.log`,'-w','start','-o',`-h 127.0.0.1 -p ${port} -c timezone=UTC ${socket}`]);
  started=true; pool=new pg.Pool({host:'127.0.0.1',port,user:'treksafe_hu49_desechable',database:'postgres',max:6});
  await pool.query(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon,authenticated,service_role;`);
  await pool.query(await readFile(path.join(root,'init_schema.sql'),'utf8'));
  for(const nombre of ['000_registro_migraciones','002_hu26_version_y_eventos_plan','014_hu38_minutos_recordatorio','022_dep108_crear_expedicion_atomica']) {
    await pool.query(await readFile(path.join(root,'backend/migrations',`${nombre}.sql`),'utf8'));
  }
  // Fixture de registro: 019 ya pertenece a HU-41. HU-49 debe registrar 020
  // sin sobrescribir el asiento previo. No instala la funcionalidad HU-41.
  await pool.query("INSERT INTO public.treksafe_migraciones(version,nombre,hu) VALUES('019','hu41_bitacora_incidente','HU-41')");
  await pool.query(await readFile(path.join(root,'backend/migrations/020_hu49_creacion_plan_idempotente.sql'),'utf8'));
  for(const [usuario,id,i] of [[actor,contacto,1],[otro,contactoOtro,2]]) {
    await pool.query("INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol) VALUES($1,$2,'fixture','senderista')",[usuario,`hu49-${i}@example.invalid`]);
    await pool.query("INSERT INTO public.perfiles_senderista(usuario_id,nombre_completo,telefono,id_documento) VALUES($1,'Prueba','999999999',$2)",[usuario,`hu49000${i}`]);
    await pool.query("INSERT INTO public.contactos_emergencia(id,senderista_id,nombre_completo,parentesco,telefono,correo_electronico) VALUES($1,$2,'Contacto','Amistad','999999999','contacto@example.invalid')",[id,usuario]);
  }
  const id=randomUUID(); const datos=payload(); let primera;
  await test('creación atómica con contactos, acompañantes, versión y HU-38',async()=>{
    primera=await invoke(id,datos); assert.equal(primera.tipo,'creado'); assert.equal(primera.expedicion.version,1);
    assert.equal((await pool.query('SELECT minutos_recordatorio FROM public.expediciones WHERE id=$1',[primera.expedicion.id])).rows[0].minutos_recordatorio,60);
    assert.equal((await pool.query('SELECT count(*)::int n FROM public.vinculos_expedicion_contacto WHERE expedicion_id=$1',[primera.expedicion.id])).rows[0].n,1);
    assert.equal((await pool.query('SELECT count(*)::int n FROM public.acompanantes_expedicion WHERE expedicion_id=$1',[primera.expedicion.id])).rows[0].n,1);
  });
  await test('respuesta perdida y dos reenvíos conservan el mismo plan',async()=>{
    for(let i=0;i<2;i++) {const r=await invoke(id,datos);assert.equal(r.tipo,'repetido');assert.deepEqual(r.expedicion,primera.expedicion);}
  });
  await test('dos envíos concurrentes de la misma clave crean una sola expedición',async()=>{
    const key=randomUUID();const d=payload();const r=await Promise.all([invoke(key,d),invoke(key,d)]);
    assert.deepEqual(r.map(x=>x.tipo).sort(),['creado','repetido']);assert.equal(r[0].expedicion.id,r[1].expedicion.id);
  });
  await test('misma clave con otro contenido produce conflicto',async()=>{
    assert.equal((await invoke(id,{...datos,lugarFin:'Otro destino'})).tipo,'solicitud_reutilizada');
  });
  await test('dos cuentas pueden usar el mismo UUID sin acceder al plan ajeno',async()=>{
    const r=await invoke(id,{...datos,idsContactos:[contactoOtro]},otro);assert.equal(r.tipo,'creado');assert.notEqual(r.expedicion.id,primera.expedicion.id);
  });
  await test('contacto ajeno o eliminado no crea plan',async()=>{
    for(const contactoId of [contactoOtro,randomUUID()]) assert.equal((await invoke(randomUUID(),{...payload(),idsContactos:[contactoId]})).tipo,'contactos_invalidos');
  });
  await test('fecha vencida exige corrección; rechazo no consume la clave',async()=>{
    const key=randomUUID();assert.equal((await invoke(key,{...datos,horaInicio:'2020-01-01T00:00:00Z'})).tipo,'fechas_invalidas');
    assert.equal((await invoke(key,datos)).tipo,'creado');
  });
  await test('un plan ya creado se recupera aunque las fechas originales hayan vencido',async()=>{
    const key=randomUUID();const d={...payload(),horaInicio:new Date(Date.now()+2500).toISOString()};
    const r=await invoke(key,d);assert.equal(r.tipo,'creado');
    await delay(Math.max(0,Date.parse(d.horaInicio)-Date.now()+50));
    assert.equal((await invoke(key,d)).tipo,'repetido');
    await pool.query("UPDATE public.expediciones SET estado='completada' WHERE id=$1",[r.expedicion.id]);
  });
  await test('plan activo bloquea creaciones nuevas y permite recuperar reenvíos',async()=>{
    await pool.query("UPDATE public.expediciones SET estado='en_progreso' WHERE id=$1",[primera.expedicion.id]);
    assert.equal((await invoke(randomUUID(),payload())).tipo,'expedicion_activa');assert.equal((await invoke(id,datos)).tipo,'repetido');
    await pool.query("UPDATE public.expediciones SET estado='programada' WHERE id=$1",[primera.expedicion.id]);
  });
  await test('fallo en acompañantes revierte plan, enlaces y clave',async()=>{
    await pool.query(`CREATE FUNCTION public.hu49_fallar() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.nombre_acompanante='Falla controlada' THEN RAISE EXCEPTION 'hu49_fallo_controlado'; END IF; RETURN NEW; END$$;
      CREATE TRIGGER hu49_fallar BEFORE INSERT ON public.acompanantes_expedicion FOR EACH ROW EXECUTE FUNCTION public.hu49_fallar();`);
    const key=randomUUID();const before=(await pool.query('SELECT count(*) FROM public.expediciones')).rows;
    await assert.rejects(invoke(key,{...payload(),nombresAcompanantes:['Falla controlada']}),/hu49_fallo_controlado/);
    assert.deepEqual((await pool.query('SELECT count(*) FROM public.expediciones')).rows,before);
    assert.equal((await pool.query('SELECT count(*)::int n FROM public.creaciones_plan_offline WHERE borrador_id=$1',[key])).rows[0].n,0);
  });
  await test('plan eliminado deja constancia y no vuelve a crearse con la misma clave',async()=>{
    await pool.query('DELETE FROM public.expediciones WHERE id=$1',[primera.expedicion.id]);
    assert.equal((await invoke(id,datos)).tipo,'plan_eliminado');
  });
  await test('permisos cerrados, RPC INVOKER y registro 020 sin alterar 019 de HU-41',async()=>{
    const r=(await pool.query(`SELECT has_function_privilege('anon','public.treksafe_crear_plan_borrador(uuid,uuid,jsonb)','EXECUTE') anon,
      has_table_privilege('authenticated','public.creaciones_plan_offline','SELECT') privado,
      (SELECT prosecdef FROM pg_proc WHERE oid='public.treksafe_crear_plan_borrador(uuid,uuid,jsonb)'::regprocedure) definer`)).rows[0];
    assert.deepEqual(r,{anon:false,privado:false,definer:false});
    assert.deepEqual((await pool.query("SELECT version,nombre,hu FROM public.treksafe_migraciones WHERE version IN ('019','020') ORDER BY version")).rows,[
      {version:'019',nombre:'hu41_bitacora_incidente',hu:'HU-41'},
      {version:'020',nombre:'hu49_creacion_plan_idempotente',hu:'HU-49'},
    ]);
  });
  await test('no crea eventos_plan ni modifica las versiones de planes anteriores',async()=>{
    assert.equal((await pool.query('SELECT count(*)::int n FROM public.eventos_plan')).rows[0].n,0);
    assert.equal((await pool.query('SELECT max(version) n FROM public.expediciones')).rows[0].n,1);
  });
  console.log(`HU-49: ${count} pruebas SQL satisfactorias. Clúster temporal: ${dir}`);
} finally {
  await pool?.end();
  if(started) await control(['-D',`${dir}/data`,'-m','immediate','-w','stop']);
}
