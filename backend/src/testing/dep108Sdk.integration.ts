// Executed only by test-dep108-postgres.mjs against its disposable loopback DB.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
const databaseUrl = process.env.DEP108_TEST_DATABASE_URL;
const restUrl = process.env.DEP108_TEST_REST_URL;
const secret = process.env.DEP108_TEST_JWT_SECRET;
assert.ok(databaseUrl && restUrl && secret, 'Solo ejecutar mediante el runner desechable');
const destination = new URL(databaseUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(destination.hostname));
assert.equal(destination.pathname, '/treksafe_dep108_desechable');
assert.equal(new URL(restUrl).hostname, '127.0.0.1');
process.env.SUPABASE_URL = restUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-local-ficticia';
process.env.JWT_SECRET = 'secreto-ficticio-exclusivo-pruebas-000000000';
process.env.MEDICAL_ENCRYPTION_KEY = 'medico-ficticio-exclusivo-pruebas-000000';
process.env.CRON_ENABLED = 'false';
const { RepositorioExpedicion } = await import('../infrastructure/repositories/RepositorioExpedicion.js');
const token = jwt.sign({ role: 'service_role' }, secret, { expiresIn: 300 });
const sdk = createClient(restUrl, token, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
            const url = new URL(String(input));
            url.pathname = url.pathname.replace(/^\/rest\/v1(?=\/|$)/, '');
            return fetch(url, init);
        } } });
const repo = new RepositorioExpedicion(sdk);
const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();
const actor = randomUUID(), other = randomUUID(), contact = randomUUID(), foreignContact = randomUUID();
try {
    for (const id of [actor, other]) {
        await db.query("INSERT INTO public.usuarios(id,correo_electronico,hash_contrasena,rol) VALUES($1,$2,'hash-ficticio','senderista')", [id, `${id}@example.invalid`]);
        await db.query("INSERT INTO public.perfiles_senderista VALUES($1,'Persona de prueba','999999999',$2)", [id, id.slice(0, 20)]);
    }
    for (const [id, owner] of [[contact, actor], [foreignContact, other]])
        await db.query("INSERT INTO public.contactos_emergencia(id,senderista_id,nombre_completo,parentesco,telefono,correo_electronico) VALUES($1,$2,'Contacto de prueba','amistad','999999999',$3)", [id, owner, `${id}@example.invalid`]);
    const input = { lugarInicio: 'Inicio SDK', lugarFin: 'Destino SDK', horaInicio: new Date(Date.now() + 180000).toISOString(), horaRetornoEstimada: new Date(Date.now() + 3600000).toISOString(), minutosTolerancia: 30, estado: 'programada' as const, idsContactos: [contact], nombresAcompanantes: ['Acompañante SDK'] };
    const created = await repo.crearExpedicion(actor, input);
    assert.ok(created.id);
    assert.equal(created.estado, 'programada');
    assert.equal(created.version, 1);
    assert.equal(created.lugarInicio, input.lugarInicio);
    assert.equal(new Date(created.horaInicio).toISOString(), input.horaInicio);
    assert.equal('lugar_inicio' in created, false);
    assert.equal((await db.query('SELECT count(*)::int n FROM public.vinculos_expedicion_contacto WHERE expedicion_id=$1', [created.id])).rows[0].n, 1);
    assert.equal((await db.query('SELECT count(*)::int n FROM public.acompanantes_expedicion WHERE expedicion_id=$1', [created.id])).rows[0].n, 1);
    await assert.rejects(() => repo.crearExpedicion(actor, { ...input, idsContactos: [foreignContact] }), (e: unknown) => e instanceof Error && e.message.includes('no pertenecen'));
    const fakeMissing = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Missing function' } }) };
    const unavailable = new RepositorioExpedicion(fakeMissing as never);
    await assert.rejects(() => unavailable.crearExpedicion(actor, input), /migración de creación transaccional/);
    const badResponse = { rpc: async () => ({ data: {}, error: null }) };
    await assert.rejects(() => new RepositorioExpedicion(badResponse as never).crearExpedicion(actor, input), /Respuesta inválida/);
    const {RepositorioOutboxSupabase}=await import('../infrastructure/repositories/RepositorioOutboxSupabase.js');
    const {WorkerOutboxNotificaciones}=await import('../application/services/WorkerOutboxNotificaciones.js');
    const salida=new RepositorioOutboxSupabase(sdk);
    const mail=await salida.guardar({claveEvento:`sdk:${randomUUID()}`,tipoEvento:'prueba',destinatario:'ficticio@example.invalid',asunto:'Prueba',cuerpo:'Prueba'});
    let envios=0;
    const transporte={obtenerModo:()=> 'dev-log' as const,enviar:async()=>{envios++;return {estado:'enviado' as const,modo:'dev-log' as const};}};
    const worker=new WorkerOutboxNotificaciones(salida,transporte);
    const resultados=await Promise.all([worker.procesarLote('a'),worker.procesarLote('b')]);
    assert.equal(envios,1); assert.equal(resultados.reduce((n,r)=>n+r.exitosos,0),0);
    assert.equal(resultados.reduce((n,r)=>n+r.registrados,0),1);
    assert.equal((await db.query('SELECT resultado FROM public.intentos_outbox WHERE notificacion_id=$1',[mail.id])).rows[0].resultado,'simulado');
    // Prueba de error después de aceptación: inicio persiste aunque la confirmación SQL falle.
    const mail2=await salida.guardar({claveEvento:`sdk:${randomUUID()}`,tipoEvento:'prueba',destinatario:'ficticio@example.invalid',asunto:'Prueba',cuerpo:'Prueba'});
    const finalizar=salida.finalizarIntento.bind(salida);
    salida.finalizarIntento=async()=>{throw new Error('FALLO_SQL_CONTROLADO');};
    await assert.rejects(()=>worker.procesarLote('c'),/FALLO_SQL_CONTROLADO/);
    salida.finalizarIntento=finalizar;
    await db.query("UPDATE public.outbox_notificaciones SET bloqueado_hasta=clock_timestamp()-interval '1 second' WHERE id=$1",[mail2.id]);
    const antes=envios; await new WorkerOutboxNotificaciones(salida,transporte).procesarLote('reiniciado');
    assert.equal(envios,antes);
    assert.equal((await db.query('SELECT estado FROM public.outbox_notificaciones WHERE id=$1',[mail2.id])).rows[0].estado,'incierto');
    console.log('OK SDK: worker real sobre PostgREST, exclusión, simulación y reinicio tras aceptación con SQL caído');
    console.log('OK SDK: creación real, colecciones, error de propiedad, RPC ausente sin fallback y respuesta inválida');
}
finally {
    await db.query('DELETE FROM public.usuarios WHERE id=ANY($1)', [[actor, other]]);
    await db.end();
}
