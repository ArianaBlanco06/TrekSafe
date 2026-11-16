import { it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { crearRutasAvancesExpedicion } from './rutasAvancesExpedicion.js';
import { RegistrarAvance } from '../../../application/use-cases/RegistrarAvance.js';
import { firmarToken } from '../../../infrastructure/security/jwt.js';
import { errorHandler } from '../../../shared/errors/errorHandler.js';
import type { ResultadoRegistroAvance } from '../../../application/ports/avancesExpedicion.js';

Object.assign(process.env,{NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_SERVICE_ROLE_KEY:'fixture',
  JWT_SECRET:'secreto-ficticio-avances-0000000000000000',MEDICAL_ENCRYPTION_KEY:'secreto-medico-ficticio-0000000000000000'});
it('HU-34 HTTP: autenticación, rol, validación, actor, resultados y lectura privada',async () => {
  const actor=randomUUID();const id=randomUUID();const puntoId=randomUUID();const solicitudId=randomUUID();
  const avance={id:randomUUID(),expedicionId:id,solicitudId,punto:{id:puntoId,nombre:'Mirador',orden:1},registradoEn:'2030-01-01T12:00:00.000Z',nota:null};
  let tipo: ResultadoRegistroAvance={tipo:'registrado',avance}; let llamadas=0;
  const app=express(); app.use(express.json()); app.use('/api/expediciones',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.use('/api/expediciones',crearRutasAvancesExpedicion(orden=>new RegistrarAvance(orden,{registrarPropio:async valor=>{
    llamadas++; assert.equal(valor.senderistaId,actor); assert.equal(valor.expedicionId,id); return tipo;
  }}),{consultarUltimoPropio:async usuario=>usuario===actor ? {tipo:'consultado',ultimoAvance:null} : {tipo:'no_encontrado'}}));
  app.use(errorHandler); const server=app.listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/expediciones/${id}/avances`;
  const headers=(sub=actor,rol:'senderista'|'rescatista'='senderista')=>({'Content-Type':'application/json',Authorization:`Bearer ${firmarToken({sub,rol})}`});
  const post=(body: unknown,options={headers:headers()})=>fetch(base,{method:'POST',body:JSON.stringify(body),...options});
  try {
    assert.equal((await fetch(base,{method:'POST'})).status,401);
    assert.equal((await post({solicitudId,puntoId},{headers:headers(actor,'rescatista')})).status,403);
    assert.equal((await post({solicitudId,puntoId,registradoEn:'2030-01-01'})).status,400); assert.equal(llamadas,0);
    const first=await post({solicitudId,puntoId}); assert.equal(first.status,201); assert.equal(first.headers.get('cache-control'),'no-store');
    assert.deepEqual(await first.json(),{avance,repetida:false});
    tipo={tipo:'repetido',avance}; assert.equal((await post({solicitudId,puntoId})).status,200);
    for(const rechazo of ['estado_no_admitido','punto_no_disponible','solicitud_reutilizada'] as const) {
      tipo={tipo:rechazo}; assert.equal((await post({solicitudId,puntoId})).status,409);
    }
    tipo={tipo:'no_encontrado'}; assert.equal((await post({solicitudId,puntoId})).status,404);
    const last=await fetch(`${base}/ultimo`,{headers:headers()}); assert.equal(last.status,200); assert.deepEqual(await last.json(),{ultimoAvance:null});
    assert.equal((await fetch(`${base}/ultimo`,{headers:headers(randomUUID())})).status,404);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
});
