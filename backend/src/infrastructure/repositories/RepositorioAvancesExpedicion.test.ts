import { it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RepositorioAvancesExpedicion } from './RepositorioAvancesExpedicion.js';

it('HU-34 adaptador: RPC parametrizada y reintento acotado de serialización',async () => {
  const orden={senderistaId:randomUUID(),expedicionId:randomUUID(),solicitudId:randomUUID(),puntoId:randomUUID(),nota:null};
  const llamadas: unknown[]=[];
  const repo=new RepositorioAvancesExpedicion({rpc:async (nombre,params)=>{
    llamadas.push({nombre,params});
    return llamadas.length<3 ? {data:null,error:{code:'40001'}} : {data:{tipo:'estado_no_admitido'},error:null};
  }});
  assert.deepEqual(await repo.registrarPropio(orden),{tipo:'estado_no_admitido'});
  assert.equal(llamadas.length,3); assert.deepEqual(llamadas[0],llamadas[2]);
  assert.deepEqual(llamadas[0],{nombre:'treksafe_registrar_avance',params:{
    p_senderista_id:orden.senderistaId,p_expedicion_id:orden.expedicionId,p_solicitud_id:orden.solicitudId,p_punto_id:orden.puntoId,p_nota:null,
  }});
});
it('HU-34 adaptador: valida respuesta y no expone fallos SQL como errores del cliente',async () => {
  const repo=new RepositorioAvancesExpedicion({rpc:async ()=>({data:{dato:'inesperado'},error:null})});
  await assert.rejects(repo.consultarUltimoPropio(randomUUID(),randomUUID()),/Respuesta inválida/);
  const nullRepo=new RepositorioAvancesExpedicion({rpc:async ()=>({data:null,error:null})});
  assert.deepEqual(await nullRepo.consultarUltimoPropio(randomUUID(),randomUUID()),{tipo:'no_encontrado'});
});
