import assert from 'node:assert/strict';
import {it} from 'node:test';
import {FachadaEntregaAvisosIncidente} from './FachadaEntregaAvisosIncidente.js';
import {ErrorAplicacion} from '../../shared/errors/ErrorAplicacion.js';
it('la fachada mantiene actor, incidente, mensaje y clave; no guarda idempotencia en memoria',async()=>{
  let llamadas=0;
  const fachada=new FachadaEntregaAvisosIncidente({listarAutorizados:async()=>[]},{reintentarAutorizado:async(...args)=>{
    assert.deepEqual(args,['actor','plan','mensaje','clave']);llamadas++;
    return {id:'mensaje',estadoAnterior:'fallido',nuevoEstado:'pendiente',mensaje:'Registrado'};
  }});
  assert.deepEqual(await fachada.reintentarDespachoManual('actor','plan','mensaje','clave'),await fachada.reintentarDespachoManual('actor','plan','mensaje','clave'));
  assert.equal(llamadas,2);
});
it('la fachada propaga rechazo del responsable sin devolver datos',async()=>{
  const fachada=new FachadaEntregaAvisosIncidente({listarAutorizados:async()=>{throw new ErrorAplicacion(403,'No autorizado');}}, {reintentarAutorizado:async()=>{throw new ErrorAplicacion(403,'No autorizado');}});
  await assert.rejects(()=>fachada.consultarDespachosIncidente('ajeno','plan'),(e:unknown)=>e instanceof ErrorAplicacion&&e.codigoEstado===403);
  await assert.rejects(()=>fachada.reintentarDespachoManual('ajeno','plan','mensaje','clave'),(e:unknown)=>e instanceof ErrorAplicacion&&e.codigoEstado===403);
});
it('dev-log se muestra como simulación y no suma un envío real',async()=>{
  const base={id:'1',claveEvento:'evento',canal:'correo',tipoEvento:'prueba',destinatario:'ficticio@example.invalid',asunto:'Prueba',cuerpo:'Prueba',estado:'enviado' as const,intentos:1,maxIntentos:3,proximoIntentoEn:new Date(),creadoEn:new Date(),actualizadoEn:new Date()};
  const fachada=new FachadaEntregaAvisosIncidente({listarAutorizados:async()=>[{...base,modoEnvio:'dev-log'},{...base,id:'2',modoEnvio:'smtp'}]},{} as never);
  const r=await fachada.consultarDespachosIncidente('actor','plan');assert.equal(r.enviados,1);assert.equal(r.simulados,1);assert.equal(r.despachos[0].canal,'correo');
});
