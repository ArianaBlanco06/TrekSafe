import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { ZodError } from 'zod';
import type {
  FichaCifrada,
  IFichaMedicaIncidenteDAO,
  RegistroAccesoFicha,
  SolicitudRegistroAccesoFicha,
} from '../../domain/repositories/IFichaMedicaIncidenteDAO.js';
import { MOTIVOS_DENEGACION_FICHA, type ContextoAccesoFicha } from '../../domain/value-objects/accesoFichaMedica.js';
import type { CargaUtilMedica } from '../../domain/value-objects/CargaUtilMedica.js';
import { FichaMedicaIncidenteDAOMemoria } from '../../infrastructure/repositories/memoria/FichaMedicaIncidenteDAOMemoria.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import type { IDescifradorFichaMedica } from '../ports/descifradorFichaMedica.js';
import { FachadaFichaMedicaIncidente } from './FachadaFichaMedicaIncidente.js';

const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INCIDENTE = '11111111-1111-4111-8111-111111111111';
const EXPEDICION = '22222222-2222-4222-8222-222222222222';
const SENDERISTA = '33333333-3333-4333-8333-333333333333';

// Valores de salud ficticios: no deben aparecer en ningún error ni en ningún registro de auditoría.
const CIFRADO = 'CIFRADO-SECRETO-FACHADA';
const CARGA: CargaUtilMedica = { alergias: 'penicilina-ficticia', condiciones: 'asma-ficticia', medicamentos: 'salbutamol-ficticio' };
const FICHA: FichaCifrada = { tipoSangre: 'AB-', cargaCifrada: CIFRADO };
const VALORES_MEDICOS = [CIFRADO, CARGA.alergias, CARGA.condiciones, CARGA.medicamentos];

type Opciones = {
  contexto?: Partial<ContextoAccesoFicha>;
  incidente?: Partial<NonNullable<ContextoAccesoFicha['incidente']>> | null;
  cifrada?: FichaCifrada | null;
  fallaAuditoria?: 'permitido' | 'denegado' | 'todo';
  fallaDescifrado?: boolean;
};

/** Espías que anotan el orden exacto de las llamadas. */
function armar(opciones: Opciones = {}) {
  const llamadas: string[] = [];
  const registros: SolicitudRegistroAccesoFicha[] = [];
  const contexto: ContextoAccesoFicha = {
    incidenteId: INCIDENTE,
    actorId: ANA,
    actorEsRescatista: true,
    incidente:
      opciones.incidente === null
        ? null
        : { id: INCIDENTE, expedicionId: EXPEDICION, senderistaId: SENDERISTA, estado: 'abierto', responsableId: ANA, ...opciones.incidente },
    consentimientoVigente: true,
    ...opciones.contexto,
  };
  const dao = {
    async leerContexto(incidenteId: string, actorId: string) {
      llamadas.push('contexto');
      return { ...contexto, incidenteId, actorId };
    },
    async leerSiResponsable() {
      llamadas.push('leerCifrada');
      return opciones.cifrada === undefined ? FICHA : opciones.cifrada;
    },
    async registrar(s: SolicitudRegistroAccesoFicha): Promise<RegistroAccesoFicha> {
      llamadas.push(`auditar:${s.resultado}:${s.motivo}`);
      if (opciones.fallaAuditoria === 'todo' || opciones.fallaAuditoria === s.resultado) {
        throw new Error('la base no responde');
      }
      registros.push(s);
      return {
        id: randomUUID(), incidenteId: s.incidenteId, expedicionId: EXPEDICION, senderistaId: SENDERISTA,
        actorId: s.actorId, resultado: s.resultado, motivo: s.motivo, registradoEn: '2030-01-15T12:00:00.000Z',
      };
    },
  } satisfies IFichaMedicaIncidenteDAO;
  const descifrador: IDescifradorFichaMedica = {
    descifrar(texto) {
      llamadas.push('descifrar');
      assert.equal(texto, CIFRADO);
      if (opciones.fallaDescifrado) throw new Error(`no se pudo descifrar ${texto}`);
      return CARGA;
    },
  };
  return { fachada: new FachadaFichaMedicaIncidente(dao, dao, dao, descifrador), llamadas, registros };
}

async function capturarLog<T>(accion: () => Promise<T>): Promise<{ registros: string; resultado: PromiseSettledResult<T> }> {
  const original = console.error;
  const lineas: unknown[][] = [];
  console.error = (...args: unknown[]) => void lineas.push(args);
  try {
    const [resultado] = await Promise.allSettled([accion()]);
    return { registros: JSON.stringify(lineas), resultado };
  } finally {
    console.error = original;
  }
}

function esErrorAplicacion(e: unknown, estado: number, codigo: string): e is ErrorAplicacion {
  assert.ok(e instanceof ErrorAplicacion, `se esperaba ErrorAplicacion y llegó ${String(e)}`);
  assert.equal(e.codigoEstado, estado);
  assert.equal(e.codigo, codigo);
  return true;
}

describe('FachadaFichaMedicaIncidente (HU-50)', () => {
  it('permitido: contexto → auditar → leer cifrada → descifrar, en ese orden exacto, y devuelve la ficha y el acceso', async () => {
    const { fachada, llamadas } = armar();
    const r = await fachada.consultar(ANA, INCIDENTE);
    assert.deepEqual(llamadas, ['contexto', 'auditar:permitido:RESPONSABLE_VIGENTE', 'leerCifrada', 'descifrar']);
    assert.deepEqual(r.fichaMedica, { tipoSangre: 'AB-', ...CARGA });
    assert.equal(r.acceso.incidenteId, INCIDENTE);
    assert.equal(r.acceso.registradoEn, '2030-01-15T12:00:00.000Z');
    assert.ok(r.acceso.auditoriaId.length > 0);
  });

  const casosDenegados: { motivo: (typeof MOTIVOS_DENEGACION_FICHA)[number]; estado: number; codigo: string; opciones: Opciones }[] = [
    { motivo: 'NO_ES_RESCATISTA', estado: 403, codigo: 'ACCESO_FICHA_DENEGADO', opciones: { contexto: { actorEsRescatista: false } } },
    { motivo: 'INCIDENTE_NO_ENCONTRADO', estado: 404, codigo: 'INCIDENTE_NO_ENCONTRADO', opciones: { incidente: null } },
    { motivo: 'INCIDENTE_CERRADO', estado: 403, codigo: 'ACCESO_FICHA_DENEGADO', opciones: { incidente: { estado: 'cerrado' } } },
    { motivo: 'NO_ES_RESPONSABLE', estado: 403, codigo: 'ACCESO_FICHA_DENEGADO', opciones: { incidente: { responsableId: BETO } } },
    { motivo: 'SIN_CONSENTIMIENTO', estado: 403, codigo: 'ACCESO_FICHA_DENEGADO', opciones: { contexto: { consentimientoVigente: false } } },
  ];

  for (const { motivo, estado, codigo, opciones } of casosDenegados) {
    it(`denegado por ${motivo}: ${estado} ${codigo}, una auditoría denegado, 0 lecturas cifradas y 0 descifrados, sin datos médicos en el error`, async () => {
      const { fachada, llamadas } = armar(opciones);
      await assert.rejects(fachada.consultar(ANA, INCIDENTE), (e: unknown) => {
        assert.ok(esErrorAplicacion(e, estado, codigo));
        assert.deepEqual(e.extras, { motivo });
        const texto = JSON.stringify({ mensaje: e.message, extras: e.extras, codigo: e.codigo });
        for (const valor of VALORES_MEDICOS) assert.ok(!texto.includes(valor), `el error no puede llevar ${valor}`);
        return true;
      });
      assert.deepEqual(llamadas, ['contexto', `auditar:denegado:${motivo}`]);
    });
  }

  it('el 403 no revela si existe una ficha: los motivos distintos de SIN_CONSENTIMIENTO no la mencionan', async () => {
    const { fachada } = armar({ incidente: { responsableId: BETO }, contexto: { consentimientoVigente: false } });
    await assert.rejects(fachada.consultar(ANA, INCIDENTE), (e: unknown) => {
      assert.ok(e instanceof ErrorAplicacion);
      assert.deepEqual(e.extras, { motivo: 'NO_ES_RESPONSABLE' });
      return true;
    });
  });

  it('falla la auditoría del permitido: 503 AUDITORIA_NO_DISPONIBLE sin leer ni descifrar (fail-closed)', async () => {
    const { fachada, llamadas } = armar({ fallaAuditoria: 'permitido' });
    const { resultado, registros } = await capturarLog(() => fachada.consultar(ANA, INCIDENTE));
    assert.equal(resultado.status, 'rejected');
    assert.ok(esErrorAplicacion((resultado as PromiseRejectedResult).reason, 503, 'AUDITORIA_NO_DISPONIBLE'));
    assert.deepEqual(llamadas, ['contexto', 'auditar:permitido:RESPONSABLE_VIGENTE']);
    assert.ok(!registros.includes('la base no responde'), 'el log no copia el mensaje de la base');
  });

  it('falla la auditoría de una denegación: la respuesta sigue siendo 403 y el fallo se registra sin datos', async () => {
    const { fachada, llamadas } = armar({ incidente: { responsableId: BETO }, fallaAuditoria: 'denegado' });
    const { resultado, registros } = await capturarLog(() => fachada.consultar(ANA, INCIDENTE));
    assert.equal(resultado.status, 'rejected');
    assert.ok(esErrorAplicacion((resultado as PromiseRejectedResult).reason, 403, 'ACCESO_FICHA_DENEGADO'));
    assert.deepEqual(llamadas, ['contexto', 'auditar:denegado:NO_ES_RESPONSABLE']);
    assert.ok(registros.includes('NO_ES_RESPONSABLE'));
    for (const valor of VALORES_MEDICOS) assert.ok(!registros.includes(valor));
  });

  it('la guarda devuelve null (relevo o cierre en medio): audita CONTEXTO_CAMBIADO, responde 409 y no descifra', async () => {
    const { fachada, llamadas } = armar({ cifrada: null });
    await assert.rejects(fachada.consultar(ANA, INCIDENTE), (e: unknown) => {
      assert.ok(esErrorAplicacion(e, 409, 'ACCESO_FICHA_CONTEXTO_CAMBIADO'));
      assert.deepEqual(e.extras, { motivo: 'CONTEXTO_CAMBIADO' });
      return true;
    });
    assert.deepEqual(llamadas, [
      'contexto', 'auditar:permitido:RESPONSABLE_VIGENTE', 'leerCifrada', 'auditar:denegado:CONTEXTO_CAMBIADO',
    ]);
  });

  it('falla el descifrado: 500 FICHA_ILEGIBLE y el log solo lleva la etiqueta, sin texto cifrado ni valores médicos', async () => {
    const { fachada, llamadas } = armar({ fallaDescifrado: true });
    const { resultado, registros } = await capturarLog(() => fachada.consultar(ANA, INCIDENTE));
    assert.equal(resultado.status, 'rejected');
    const error = (resultado as PromiseRejectedResult).reason;
    assert.ok(esErrorAplicacion(error, 500, 'FICHA_ILEGIBLE'));
    assert.ok(!error.message.includes(CIFRADO));
    assert.deepEqual(llamadas, ['contexto', 'auditar:permitido:RESPONSABLE_VIGENTE', 'leerCifrada', 'descifrar']);
    assert.ok(registros.includes('ficha ilegible'));
    for (const valor of [...VALORES_MEDICOS, 'AB-']) assert.ok(!registros.includes(valor), `el log no puede llevar ${valor}`);
  });

  it('un UUID inválido da ZodError y no toca nada: 0 llamadas y 0 auditorías', async () => {
    const { fachada, llamadas } = armar();
    await assert.rejects(fachada.consultar(ANA, 'no-es-uuid'), ZodError);
    await assert.rejects(fachada.consultar('no-es-uuid', INCIDENTE), ZodError);
    assert.deepEqual(llamadas, []);
  });

  it('20 consultas de un rescatista que no es el responsable: 0 fichas, 20 denegaciones auditadas y 0 descifrados', async () => {
    const { fachada, llamadas, registros } = armar({ incidente: { responsableId: BETO } });
    let rechazos = 0;
    for (let i = 0; i < 20; i += 1) {
      await fachada.consultar(ANA, INCIDENTE).then(
        () => assert.fail('no debía devolver la ficha'),
        () => { rechazos += 1; },
      );
    }
    assert.equal(rechazos, 20);
    assert.equal(registros.length, 20);
    assert.ok(registros.every((r) => r.resultado === 'denegado' && r.motivo === 'NO_ES_RESPONSABLE'));
    assert.equal(llamadas.filter((l) => l === 'leerCifrada' || l === 'descifrar').length, 0);
  });

  describe('con el DAO en memoria', () => {
    const descifrador: IDescifradorFichaMedica = { descifrar: () => CARGA };
    function memoria() {
      const dao = new FichaMedicaIncidenteDAOMemoria();
      dao.sembrarRescatista(ANA);
      dao.sembrarRescatista(BETO);
      dao.sembrarIncidente({ id: INCIDENTE, expedicionId: EXPEDICION, senderistaId: SENDERISTA, responsableId: ANA });
      dao.sembrarFicha(SENDERISTA, FICHA);
      return { dao, fachada: new FachadaFichaMedicaIncidente(dao, dao, dao, descifrador) };
    }

    it('relevo: el responsable anterior pierde el acceso (403 NO_ES_RESPONSABLE) y el nuevo lo recibe', async () => {
      const { dao, fachada } = memoria();
      assert.equal((await fachada.consultar(ANA, INCIDENTE)).fichaMedica.tipoSangre, 'AB-');
      dao.transferir(INCIDENTE, BETO);
      await assert.rejects(fachada.consultar(ANA, INCIDENTE), (e: unknown) => esErrorAplicacion(e, 403, 'ACCESO_FICHA_DENEGADO'));
      assert.equal((await fachada.consultar(BETO, INCIDENTE)).fichaMedica.alergias, CARGA.alergias);
      assert.deepEqual(dao.accesos.map((a) => `${a.actorId === ANA ? 'A' : 'B'}:${a.resultado}:${a.motivo}`), [
        'A:permitido:RESPONSABLE_VIGENTE', 'A:denegado:NO_ES_RESPONSABLE', 'B:permitido:RESPONSABLE_VIGENTE',
      ]);
    });

    it('cierre: tras cerrar el incidente el acceso termina con INCIDENTE_CERRADO; localizado sigue permitido', async () => {
      const { dao, fachada } = memoria();
      dao.localizar(INCIDENTE);
      await fachada.consultar(ANA, INCIDENTE);
      dao.cerrar(INCIDENTE);
      await assert.rejects(fachada.consultar(ANA, INCIDENTE), (e: unknown) => {
        assert.ok(esErrorAplicacion(e, 403, 'ACCESO_FICHA_DENEGADO'));
        assert.deepEqual(e.extras, { motivo: 'INCIDENTE_CERRADO' });
        return true;
      });
    });

    it('consentimiento revocado: 403 SIN_CONSENTIMIENTO solo para el responsable', async () => {
      const { dao, fachada } = memoria();
      dao.revocarConsentimiento(SENDERISTA);
      await assert.rejects(fachada.consultar(ANA, INCIDENTE), (e: unknown) => {
        assert.ok(e instanceof ErrorAplicacion);
        assert.deepEqual(e.extras, { motivo: 'SIN_CONSENTIMIENTO' });
        return true;
      });
      await assert.rejects(fachada.consultar(BETO, INCIDENTE), (e: unknown) => {
        assert.ok(e instanceof ErrorAplicacion);
        assert.deepEqual(e.extras, { motivo: 'NO_ES_RESPONSABLE' });
        return true;
      });
    });
  });
});
