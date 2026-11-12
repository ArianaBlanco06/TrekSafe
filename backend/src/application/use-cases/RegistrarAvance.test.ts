import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RegistrarAvance } from './RegistrarAvance.js';
import { registrarAvanceSchema } from '../dto/avance.dto.js';
import type { OrdenRegistrarAvance } from '../ports/avancesExpedicion.js';

describe('HU-34: comando y validación', () => {
  const solicitudId=randomUUID(); const puntoId=randomUUID();
  it('encapsula una copia inmutable y conserva la identidad en ejecuciones repetidas',async () => {
    const orden={senderistaId:randomUUID(),expedicionId:randomUUID(),solicitudId,puntoId,nota:'original'};
    const recibidas: OrdenRegistrarAvance[]=[];
    const comando=new RegistrarAvance(orden,{registrarPropio:async valor=>{recibidas.push(valor);return {tipo:'no_encontrado'};}});
    orden.nota='cambiada'; await comando.ejecutar(); await comando.ejecutar();
    assert.equal(recibidas[0].nota,'original'); assert.equal(recibidas[0].solicitudId,solicitudId);
    assert.equal(recibidas[0],recibidas[1]); assert.ok(Object.isFrozen(recibidas[0]));
  });
  it('normaliza nota, saltos y UUID sin confiar en hora o propietario del cliente',() => {
    assert.deepEqual(registrarAvanceSchema.parse({solicitudId:solicitudId.toUpperCase(),puntoId,nota:' \tHola\r\nMundo\r '}),
      {solicitudId,puntoId,nota:'Hola\nMundo'});
    for(const extra of ['registradoEn','senderistaId','versionEsperada','latitud']) {
      assert.equal(registrarAvanceSchema.safeParse({solicitudId,puntoId,[extra]:'dato'}).success,false);
    }
  });
  it('nota omitida, vacía o null se vuelve null',() => {
    for(const nota of [undefined,null,'',' \t\r\n ']) assert.equal(registrarAvanceSchema.parse({solicitudId,puntoId,nota}).nota,null);
  });
  it('cuenta puntos Unicode: acepta 500 emoji y rechaza 501',() => {
    assert.equal(registrarAvanceSchema.safeParse({solicitudId,puntoId,nota:'🧭'.repeat(500)}).success,true);
    assert.equal(registrarAvanceSchema.safeParse({solicitudId,puntoId,nota:'🧭'.repeat(501)}).success,false);
  });
  it('rechaza controles, NUL, sustitutos aislados y tipos coercionados',() => {
    for(const nota of ['\u0000','\u0001','\u007f','\ud800',123]) assert.equal(registrarAvanceSchema.safeParse({solicitudId,puntoId,nota}).success,false);
    assert.equal(registrarAvanceSchema.safeParse({solicitudId:'invalido',puntoId}).success,false);
  });
});
