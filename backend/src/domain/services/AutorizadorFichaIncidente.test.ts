import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EstadoIncidente } from '../repositories/IIncidenteDAO.js';
import type { ContextoAccesoFicha } from '../value-objects/accesoFichaMedica.js';
import { AutorizadorFichaIncidente } from './AutorizadorFichaIncidente.js';

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INCIDENTE = '11111111-1111-4111-8111-111111111111';

function contexto(extra: {
  actorId?: string;
  responsableId?: string;
  estado?: EstadoIncidente;
  actorEsRescatista?: boolean;
  consentimientoVigente?: boolean;
  sinIncidente?: boolean;
} = {}): ContextoAccesoFicha {
  return {
    incidenteId: INCIDENTE,
    actorId: extra.actorId ?? ANA,
    actorEsRescatista: extra.actorEsRescatista ?? true,
    incidente: extra.sinIncidente
      ? null
      : {
          id: INCIDENTE,
          expedicionId: '22222222-2222-4222-8222-222222222222',
          senderistaId: '33333333-3333-4333-8333-333333333333',
          estado: extra.estado ?? 'abierto',
          responsableId: extra.responsableId ?? ANA,
        },
    consentimientoVigente: extra.consentimientoVigente ?? true,
  };
}

describe('AutorizadorFichaIncidente (HU-50)', () => {
  const autorizador = new AutorizadorFichaIncidente();

  it('permite al responsable vigente de un incidente abierto con consentimiento', () => {
    assert.deepEqual(autorizador.decidir(contexto()), { permitido: true, motivo: 'RESPONSABLE_VIGENTE', incidenteId: INCIDENTE });
  });

  it('permite al responsable de un incidente localizado (abierto = no cerrado)', () => {
    const d = autorizador.decidir(contexto({ estado: 'localizado' }));
    assert.equal(d.permitido, true);
  });

  it('un actor que no es rescatista recibe NO_ES_RESCATISTA, aunque figure como responsable', () => {
    const d = autorizador.decidir(contexto({ actorEsRescatista: false }));
    assert.deepEqual(d, { permitido: false, motivo: 'NO_ES_RESCATISTA', incidenteId: INCIDENTE });
  });

  it('un incidente inexistente recibe INCIDENTE_NO_ENCONTRADO', () => {
    assert.equal(autorizador.decidir(contexto({ sinIncidente: true })).motivo, 'INCIDENTE_NO_ENCONTRADO');
  });

  it('un incidente cerrado recibe INCIDENTE_CERRADO, incluso para el último responsable', () => {
    const d = autorizador.decidir(contexto({ estado: 'cerrado' }));
    assert.deepEqual(d, { permitido: false, motivo: 'INCIDENTE_CERRADO', incidenteId: INCIDENTE });
  });

  it('otro rescatista recibe NO_ES_RESPONSABLE', () => {
    assert.equal(autorizador.decidir(contexto({ actorId: BETO })).motivo, 'NO_ES_RESPONSABLE');
  });

  it('sin consentimiento vigente el responsable recibe SIN_CONSENTIMIENTO', () => {
    assert.equal(autorizador.decidir(contexto({ consentimientoVigente: false })).motivo, 'SIN_CONSENTIMIENTO');
  });

  it('precedencias: no responsable y sin consentimiento da NO_ES_RESPONSABLE (el consentimiento no se revela a terceros)', () => {
    assert.equal(autorizador.decidir(contexto({ actorId: BETO, consentimientoVigente: false })).motivo, 'NO_ES_RESPONSABLE');
  });

  it('precedencias: cerrado y no responsable da INCIDENTE_CERRADO', () => {
    assert.equal(autorizador.decidir(contexto({ actorId: BETO, estado: 'cerrado' })).motivo, 'INCIDENTE_CERRADO');
  });

  it('precedencias: no rescatista gana sobre todo lo demás', () => {
    const d = autorizador.decidir(contexto({ actorEsRescatista: false, estado: 'cerrado', consentimientoVigente: false }));
    assert.equal(d.motivo, 'NO_ES_RESCATISTA');
    assert.equal(autorizador.decidir(contexto({ actorEsRescatista: false, sinIncidente: true })).motivo, 'NO_ES_RESCATISTA');
  });

  it('relevo: el responsable anterior recibe NO_ES_RESPONSABLE y el nuevo, permitido', () => {
    const tras = { responsableId: BETO };
    assert.equal(autorizador.decidir(contexto({ ...tras, actorId: ANA })).motivo, 'NO_ES_RESPONSABLE');
    assert.equal(autorizador.decidir(contexto({ ...tras, actorId: BETO })).permitido, true);
  });

  it('nunca produce CONTEXTO_CAMBIADO: ese motivo solo lo produce la fachada', () => {
    const motivos = new Set<string>();
    for (const actorEsRescatista of [true, false]) {
      for (const sinIncidente of [true, false]) {
        for (const estado of ['abierto', 'localizado', 'cerrado'] as const) {
          for (const actorId of [ANA, BETO]) {
            for (const consentimientoVigente of [true, false]) {
              motivos.add(autorizador.decidir(contexto({ actorEsRescatista, sinIncidente, estado, actorId, consentimientoVigente })).motivo);
            }
          }
        }
      }
    }
    assert.equal(motivos.has('CONTEXTO_CAMBIADO'), false);
    assert.deepEqual([...motivos].sort(), [
      'INCIDENTE_CERRADO', 'INCIDENTE_NO_ENCONTRADO', 'NO_ES_RESCATISTA', 'NO_ES_RESPONSABLE', 'RESPONSABLE_VIGENTE', 'SIN_CONSENTIMIENTO',
    ]);
  });

  it('la decisión solo tiene las claves permitido, motivo e incidenteId', () => {
    for (const d of [autorizador.decidir(contexto()), autorizador.decidir(contexto({ actorId: BETO }))]) {
      assert.deepEqual(Object.keys(d).sort(), ['incidenteId', 'motivo', 'permitido']);
    }
  });

  it('no modifica el contexto de entrada', () => {
    const c = contexto();
    const copia = structuredClone(c);
    autorizador.decidir(c);
    assert.deepEqual(c, copia);
  });
});
