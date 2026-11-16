import assert from 'node:assert/strict';
import { it } from 'node:test';
import express from 'express';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { crearRutasBorradores } from './rutasBorradores.js';
import { firmarToken } from '../../../infrastructure/security/jwt.js';
import { errorHandler } from '../../../shared/errors/errorHandler.js';
import type { OrdenCrearPlan } from '../../../application/ports/creacionPlan.js';
import { CrearPlan } from '../../../application/commands/CrearPlan.js';
import { sincronizarBorradorSchema } from '../../../application/dto/crearPlan.dto.js';

Object.assign(process.env,{NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_SERVICE_ROLE_KEY:'fixture',
  JWT_SECRET:'secreto-ficticio-hu49-000000000000000000000',MEDICAL_ENCRYPTION_KEY:'medico-ficticio-hu49-0000000000000000000'});
const datos=()=>({borradorId:randomUUID(),lugarInicio:'Salida',lugarFin:'Destino',horaInicio:'2099-01-01T12:00:00Z',
  horaRetornoEstimada:'2099-01-01T18:00:00Z',minutosTolerancia:30,idsContactos:[randomUUID()],nombresAcompanantes:['Ana']});
it('HU-49 HTTP: autenticación, rol, contrato estricto e identidad del JWT', async()=>{
  const actor=randomUUID();let orden:OrdenCrearPlan|undefined;let repetido=false;
  const app=express();app.use(express.json());app.use('/api/expediciones',crearRutasBorradores({crear:async o=>{
    orden=o;return {repetido,expedicion:{...o.datos,id:randomUUID(),estado:'programada',version:1,creadoEn:'2030-01-01'}};
  }}));app.use(errorHandler);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/expediciones/borradores/sincronizar`;
  const post=(body:unknown,rol?:'senderista'|'rescatista')=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',
    ...(rol?{Authorization:`Bearer ${firmarToken({sub:actor,rol})}`}:{})},body:JSON.stringify(body)});
  try {
    assert.equal((await post(datos())).status,401);assert.equal((await post(datos(),'rescatista')).status,403);
    assert.equal((await post({...datos(),senderistaId:randomUUID()},'senderista')).status,400);
    assert.equal((await post({...datos(),horaInicio:'no-fecha'},'senderista')).status,400);
    const body=datos();const r=await post(body,'senderista');assert.equal(r.status,201);assert.equal(r.headers.get('cache-control'),'no-store');
    assert.equal(orden?.senderistaId,actor);assert.equal(orden?.borradorId,body.borradorId);
    repetido=true;assert.equal((await post(body,'senderista')).status,200);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it('HU-49 Command conserva una copia de la orden y normaliza reenvíos equivalentes',async()=>{
  const d=datos();const {borradorId,...entrada}=sincronizarBorradorSchema.parse(d);
  const orden={senderistaId:randomUUID(),borradorId,datos:entrada};const recibidas:OrdenCrearPlan[]=[];
  const comando=new CrearPlan(orden,{crear:async o=>{recibidas.push(o);return {repetido:false,expedicion:{...o.datos,id:'plan',estado:'programada',version:1,creadoEn:''}};}});
  orden.datos.lugarFin='Mutado';await comando.ejecutar();recibidas[0].datos.lugarFin='Mutado por adaptador';await comando.ejecutar();
  assert.equal(recibidas[1].datos.lugarFin,'Destino');
  assert.equal(sincronizarBorradorSchema.parse({...d,horaInicio:'2099-01-01T07:00:00-05:00'}).horaInicio,entrada.horaInicio);
});
