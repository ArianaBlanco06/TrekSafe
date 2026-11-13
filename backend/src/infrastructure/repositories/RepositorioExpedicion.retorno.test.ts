import assert from 'node:assert/strict';
import { it } from 'node:test';
import { RepositorioExpedicion } from './RepositorioExpedicion.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
it('HU44 confirma mediante una RPC, sin segunda escritura ni fallback',async()=>{
  let llamadas=0;
  const repo=new RepositorioExpedicion({rpc:async(nombre:string,args:unknown)=>{
    llamadas++;assert.equal(nombre,'treksafe_confirmar_retorno_con_outbox');
    assert.deepEqual(args,{p_expedicion_id:'plan',p_senderista_id:'actor'});
    return {data:{id:'plan',estado:'completada',lugar_inicio:'Inicio'},error:null};
  },from:()=>{throw new Error('Escritura parcial');}} as never);
  const r=await repo.completarConfirmacionRetorno('plan','actor');
  assert.equal(r.estado,'completada');assert.equal(r.lugarInicio,'Inicio');assert.equal(llamadas,1);
});
for(const [codigo,estado] of [['NO_ENCONTRADO',404],['PROHIBIDO',403],['EXPEDICION_NO_ACTIVA',409],['RPC_AUSENTE',503]] as const)
  it(`HU44 preserva errores y falla sin fallback: ${codigo}`,async()=>{
    const repo=new RepositorioExpedicion({rpc:async()=>({data:null,error:{message:codigo}})} as never);
    await assert.rejects(()=>repo.completarConfirmacionRetorno('plan','actor'),(e:unknown)=>e instanceof ErrorAplicacion&&e.codigoEstado===estado);
  });
