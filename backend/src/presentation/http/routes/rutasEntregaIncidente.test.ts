import assert from 'node:assert/strict';
import {it} from 'node:test';
import type {AddressInfo} from 'node:net';
import {FachadaEntregaAvisosIncidente} from '../../../application/services/FachadaEntregaAvisosIncidente.js';
import {ErrorAplicacion} from '../../../shared/errors/ErrorAplicacion.js';
Object.assign(process.env,{NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_SERVICE_ROLE_KEY:'fixture',JWT_SECRET:'secreto-ficticio-hu46-000000000000000',MEDICAL_ENCRYPTION_KEY:'medico-ficticio-hu46-000000000000000',CRON_ENABLED:'false'});
const {crearRutasRescate}=await import('./rutasRescate.js');
const {createApp}=await import('../app.js');
const {firmarToken}=await import('../../../infrastructure/security/jwt.js');
it('HU46 HTTP: JWT, rol, responsable, clave obligatoria, parámetros y no-store',async()=>{
  const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const otro='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const plan='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const mensaje='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  let comandos=0;
  const fachada=new FachadaEntregaAvisosIncidente({listarAutorizados:async(actor,id)=>{
    if(actor!==owner) throw new ErrorAplicacion(403,'No autorizado','NO_ES_RESPONSABLE');
    assert.equal(id,plan);return [];
  }},{reintentarAutorizado:async(...args)=>{
    assert.deepEqual(args,[owner,plan,mensaje,'clave-prueba']);comandos++;
    return {id:mensaje,estadoAnterior:'fallido',nuevoEstado:'pendiente',mensaje:'Registrado'};
  }});
  const app=createApp({config:{apiPrefix:'/api',corsOrigin:'http://localhost'},rutas:[{prefijo:'/rescate',router:crearRutasRescate({entregaAvisos:fachada})}],salud:()=>({estado:'prueba'})});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/rescate/alertas/${plan}/despachos`;
  const cabeceras=(sub:string,rol:'senderista'|'rescatista'='rescatista')=>({Authorization:`Bearer ${firmarToken({sub,rol})}`});
  try{
    assert.equal((await fetch(base)).status,401);
    assert.equal((await fetch(base,{headers:cabeceras(owner,'senderista')})).status,403);
    assert.equal((await fetch(base,{headers:cabeceras(otro)})).status,403);
    const listado=await fetch(base,{headers:cabeceras(owner)});assert.equal(listado.status,200);
    assert.match(listado.headers.get('cache-control')??'',/no-store/);
    assert.equal((await listado.json() as {datos:{expedicionId:string}}).datos.expedicionId,plan);
    assert.equal((await fetch(`${base}/${mensaje}/reintentar`,{method:'POST',headers:cabeceras(owner)})).status,400);
    const r=await fetch(`${base}/${mensaje}/reintentar`,{method:'POST',headers:{...cabeceras(owner),'X-Idempotency-Key':'clave-prueba'}});
    assert.equal(r.status,200);assert.equal(comandos,1);
  }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
