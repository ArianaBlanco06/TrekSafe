import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CrearPlan } from './CrearPlan';
import type { BorradorExpedicion, IColaLocal } from '../ports/IColaLocal';
import { ErrorEnvioPlan } from '@/application/ports/ICreadorPlanRemoto';

const entrada = (): BorradorExpedicion => ({ id: 'local-1', estado: 'pendiente', guardadoEn: '2030-01-01',
  lugarInicio: 'Salida', lugarFin: 'Destino', coordenadasInicio: '', coordenadasFin: '',
  horaInicio: '2099-01-01T12:00:00Z', horaRetornoEstimada: '2099-01-01T18:00:00Z',
  minutosTolerancia: 30, idsContactos: ['contacto'], nombresAcompanantes: ['Ana'] });
function colaMemoria() {
  let borrador = entrada(); let escrituras = 0;
  const cola: IColaLocal = {
    listar: async () => [structuredClone(borrador)], insertar: async () => { throw Error('No usado'); }, eliminar: async () => {},
    actualizar: async (_id, fn) => { borrador = fn(structuredClone(borrador)); escrituras++; return structuredClone(borrador); },
  };
  return { cola, leer: () => borrador, escrituras: () => escrituras,
    cambiar: (datos: Partial<BorradorExpedicion>) => { borrador = { ...borrador, ...datos }; } };
}
describe('HU-49 CrearPlan', () => {
  it('exige revisión y corrección de fechas vencidas antes del primer envío', async () => {
    const c = colaMemoria(); let enviados = 0;
    const comando = new CrearPlan(c.cola, async () => { enviados++; return { expedicion: { id: 'plan' } }; }, () => true);
    await assert.rejects(comando.ejecutar('local-1', false), /Revisa/);
    c.cambiar({ horaInicio: '2020-01-01T00:00:00Z' });
    await assert.rejects(comando.ejecutar('local-1', true), /vencidas/);
    assert.equal(enviados, 0); assert.equal(c.leer().estado, 'pendiente');
  });
  it('respuesta perdida y reintento conservan id y contenido; sincronizado no se reenvía', async () => {
    const c = colaMemoria(); const recibidos: BorradorExpedicion[] = [];
    let primera = true;
    const comando = new CrearPlan(c.cola, async b => {
      recibidos.push(b); if (primera) { primera = false; throw new ErrorEnvioPlan('Respuesta perdida',false); }
      return { expedicion: { id: 'mismo-plan' } };
    }, () => true);
    await assert.rejects(comando.ejecutar('local-1',true));
    assert.equal(c.leer().estado,'error'); assert.equal(c.leer().envioIncierto,true);
    const resultado = await comando.ejecutar('local-1',false);
    assert.equal(recibidos[0].id,recibidos[1].id);
    assert.deepEqual(recibidos[0].idsContactos,recibidos[1].idsContactos);
    assert.equal(resultado.estado,'sincronizado');assert.equal(resultado.expedicionId,'mismo-plan');
    assert.deepEqual(resultado.idsContactos,[]);
    await comando.ejecutar('local-1',false);assert.equal(recibidos.length,2);
  });
  it('un rechazo confirmado permite corregir y conserva el error visible', async () => {
    const c=colaMemoria();const comando=new CrearPlan(c.cola,async()=>{throw new ErrorEnvioPlan('Contacto eliminado',true);},()=>true);
    await assert.rejects(comando.ejecutar('local-1',true));
    assert.equal(c.leer().envioIncierto,false);assert.equal(c.leer().error,'Contacto eliminado');
  });
  it('cambio de cuenta durante una respuesta tardía no escribe en la nueva sesión', async () => {
    const c=colaMemoria();let vigente=true;
    const comando=new CrearPlan(c.cola,async()=>{vigente=false;return {expedicion:{id:'privado-a'}};},()=>vigente);
    await assert.rejects(comando.ejecutar('local-1',true),/sesión cambió/);
    assert.equal(c.escrituras(),1);assert.equal(c.leer().expedicionId,undefined);
  });
});
