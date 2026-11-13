import assert from 'node:assert/strict';
import { it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { CreadorPlanSupabase } from './CreadorPlanSupabase.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';

const orden=()=>({senderistaId:randomUUID(),borradorId:randomUUID(),datos:{lugarInicio:'Inicio',lugarFin:'Destino',
  horaInicio:'2099-01-01T12:00:00Z',horaRetornoEstimada:'2099-01-01T18:00:00Z',minutosTolerancia:30,
  minutosRecordatorio:30 as const,idsContactos:[randomUUID()],nombresAcompanantes:['Ana']}});
it('HU-49 adapter usa RPC parametrizada y traduce rechazos sin revelar SQL',async()=>{
  const o=orden();let recibida:unknown;
  const repo=new CreadorPlanSupabase({rpc:async(nombre,parametros)=>{recibida={nombre,parametros};return {data:{tipo:'contactos_invalidos'},error:null};}});
  await assert.rejects(repo.crear(o),(e:unknown)=>e instanceof ErrorAplicacion&&e.codigoEstado===400);
  assert.deepEqual(recibida,{nombre:'treksafe_crear_plan_borrador',parametros:{p_senderista_id:o.senderistaId,p_borrador_id:o.borradorId,p_datos:o.datos}});
  const fallo=new CreadorPlanSupabase({rpc:async()=>({data:null,error:{message:'SQL privado'}})});
  await assert.rejects(fallo.crear(o),(e:unknown)=>e instanceof Error&& !e.message.includes('SQL privado'));
});
it('HU-49 adapter valida la respuesta antes de confirmar un borrador',async()=>{
  const repo=new CreadorPlanSupabase({rpc:async()=>({data:{tipo:'creado',expedicion:{id:'invalido'}},error:null})});
  await assert.rejects(repo.crear(orden()),/No se pudo confirmar/);
});
