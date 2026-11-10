import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TEXTO_YO_COORDINO,
  crearGestorOperacion,
  esResultadoIncierto,
  horaCorta,
  intentarAsumir,
  leerResponsableVigente,
  puedeAsumir,
  textoCoordinacion,
} from './coordinacionRescate';
import type { Coordinacion } from '../services/rescate';
import { ErrorClienteApi } from '../services/clienteApi';

const coordinacion = (extra: Partial<Coordinacion> = {}): Coordinacion => ({
  incidenteId: 'inc-1',
  version: 1,
  responsableId: 'resp-1',
  nombreResponsable: 'Ana Rescate',
  asumidoEn: '2030-01-15T12:05:00.000Z',
  esMia: false,
  ...extra,
});

const conflicto409 = (extras?: Record<string, unknown>) =>
  new ErrorClienteApi('Otro rescatista ya coordina esta alerta', 409, 'COORDINACION_YA_ASUMIDA', undefined, extras);

describe('puedeAsumir', () => {
  it('solo una alerta sin coordinación ofrece el botón', () => {
    assert.equal(puedeAsumir('alerta', null), true);
    assert.equal(puedeAsumir('alerta', undefined), true);
    assert.equal(puedeAsumir('alerta', coordinacion()), false);
    assert.equal(puedeAsumir('en_progreso', null), false);
    assert.equal(puedeAsumir('en_progreso', coordinacion()), false);
  });
});

describe('textoCoordinacion', () => {
  it('formatea "Coordinada por <nombre> · desde <HH:MM>"', () => {
    assert.equal(textoCoordinacion(coordinacion(), 'UTC'), 'Coordinada por Ana Rescate · desde 12:05');
  });

  it('omite la hora si asumidoEn no es una fecha válida', () => {
    assert.equal(textoCoordinacion(coordinacion({ asumidoEn: 'ayer' }), 'UTC'), 'Coordinada por Ana Rescate');
    assert.equal(textoCoordinacion(coordinacion({ asumidoEn: '' }), 'UTC'), 'Coordinada por Ana Rescate');
  });

  it('"Tú coordinas" depende solo de esMia, no del nombre', () => {
    assert.equal(textoCoordinacion(coordinacion({ esMia: true, nombreResponsable: 'Otra Persona' })), TEXTO_YO_COORDINO);
    // El mismo nombre en otro rescatista (esMia=false) no se confunde con el propio.
    assert.match(textoCoordinacion(coordinacion({ esMia: false, nombreResponsable: 'Ana Rescate' }), 'UTC'), /^Coordinada por Ana Rescate/);
  });

  it('horaCorta usa 24 horas', () => {
    assert.equal(horaCorta('2030-01-15T00:07:00.000Z', 'UTC'), '00:07');
    assert.equal(horaCorta('2030-01-15T23:59:00.000Z', 'UTC'), '23:59');
    assert.equal(horaCorta('no-es-fecha'), null);
  });
});

describe('leerResponsableVigente', () => {
  const valido = { responsableId: 'r1', nombreResponsable: 'Ana Rescate' };

  it('acepta la forma {responsableId, nombreResponsable}', () => {
    assert.deepEqual(leerResponsableVigente({ responsableVigente: valido }), valido);
  });

  it('rechaza ausencias y formas inválidas', () => {
    for (const extras of [
      undefined,
      {},
      { responsableVigente: null },
      { responsableVigente: 'Ana' },
      { responsableVigente: {} },
      { responsableVigente: { responsableId: 'r1' } },
      { responsableVigente: { nombreResponsable: 'Ana' } },
      { responsableVigente: { responsableId: 7, nombreResponsable: 'Ana' } },
      { responsableVigente: { responsableId: 'r1', nombreResponsable: '   ' } },
      { responsableVigente: { id: 'r1', nombreCompleto: 'Ana' } },
    ]) {
      assert.equal(leerResponsableVigente(extras as Record<string, unknown> | undefined), null, JSON.stringify(extras));
    }
  });
});

describe('crearGestorOperacion', () => {
  it('genera el operacionId una vez y lo reutiliza hasta resolverlo', () => {
    let n = 0;
    const gestor = crearGestorOperacion(() => `op-${++n}`);
    assert.equal(gestor.obtener(), 'op-1');
    assert.equal(gestor.obtener(), 'op-1');
    gestor.resolver();
    assert.equal(gestor.obtener(), 'op-2');
    assert.equal(n, 2);
  });
});

describe('esResultadoIncierto', () => {
  it('sin respuesta (0) y 5xx son inciertos; el resto de respuestas son definitivas', () => {
    assert.equal(esResultadoIncierto(new ErrorClienteApi('red', 0)), true);
    assert.equal(esResultadoIncierto(new ErrorClienteApi('caído', 500)), true);
    assert.equal(esResultadoIncierto(new ErrorClienteApi('caído', 503)), true);
    assert.equal(esResultadoIncierto(new ErrorClienteApi('conflicto', 409)), false);
    assert.equal(esResultadoIncierto(new ErrorClienteApi('datos', 400)), false);
    assert.equal(esResultadoIncierto(new ErrorClienteApi('prohibido', 403)), false);
    assert.equal(esResultadoIncierto(new ErrorClienteApi('no existe', 404)), false);
  });

  it('un error sin estado se trata como incierto', () => {
    assert.equal(esResultadoIncierto(new Error('algo falló')), true);
    assert.equal(esResultadoIncierto(null), true);
  });
});

describe('intentarAsumir: política del operacionId', () => {
  const nuevoGestor = () => {
    let n = 0;
    return crearGestorOperacion(() => `op-${++n}`);
  };

  it('éxito: devuelve la coordinación y el siguiente intento usa otro operacionId', async () => {
    const gestor = nuevoGestor();
    const usados: string[] = [];
    const asumir = async (_: string, op: string) => (usados.push(op), { coordinacion: coordinacion({ esMia: true }) });

    const r = await intentarAsumir('exp-1', gestor, asumir);
    assert.equal(r.tipo, 'asumida');
    await intentarAsumir('exp-1', gestor, asumir);
    assert.deepEqual(usados, ['op-1', 'op-2']);
  });

  it('error de red: el reintento reutiliza el mismo operacionId', async () => {
    const gestor = nuevoGestor();
    const usados: string[] = [];
    let intento = 0;
    const asumir = async (_: string, op: string) => {
      usados.push(op);
      if (++intento === 1) throw new ErrorClienteApi('No se pudo conectar con el servidor.', 0);
      return { coordinacion: coordinacion({ esMia: true }) };
    };

    const primero = await intentarAsumir('exp-1', gestor, asumir);
    assert.deepEqual(primero, { tipo: 'error', mensaje: 'No se pudo conectar con el servidor.' });
    const segundo = await intentarAsumir('exp-1', gestor, asumir);
    assert.equal(segundo.tipo, 'asumida');
    assert.deepEqual(usados, ['op-1', 'op-1']);
  });

  it('5xx también conserva el operacionId', async () => {
    const gestor = nuevoGestor();
    const usados: string[] = [];
    const asumir = async (_: string, op: string) => {
      usados.push(op);
      throw new ErrorClienteApi('Error interno', 503);
    };
    await intentarAsumir('exp-1', gestor, asumir);
    await intentarAsumir('exp-1', gestor, asumir);
    assert.deepEqual(usados, ['op-1', 'op-1']);
  });

  it('409: devuelve el responsable vigente del error y descarta el operacionId', async () => {
    const gestor = nuevoGestor();
    const usados: string[] = [];
    const asumir = async (_: string, op: string) => {
      usados.push(op);
      throw conflicto409({ responsableVigente: { responsableId: 'r2', nombreResponsable: 'Beto Rescate' } });
    };

    const r = await intentarAsumir('exp-1', gestor, asumir);
    assert.deepEqual(r, { tipo: 'conflicto', responsable: { responsableId: 'r2', nombreResponsable: 'Beto Rescate' } });
    await intentarAsumir('exp-1', gestor, asumir);
    assert.deepEqual(usados, ['op-1', 'op-2']);
  });

  it('409 con un responsableVigente mal formado no rompe: responsable null', async () => {
    const r = await intentarAsumir('exp-1', nuevoGestor(), async () => {
      throw conflicto409({ responsableVigente: { nombre: 'Beto' } });
    });
    assert.deepEqual(r, { tipo: 'conflicto', responsable: null });
  });

  it('rechazo definitivo (403/404/400): muestra el mensaje y descarta el operacionId', async () => {
    const gestor = nuevoGestor();
    const usados: string[] = [];
    const asumir = async (_: string, op: string) => {
      usados.push(op);
      throw new ErrorClienteApi('Alerta no encontrada', 404, 'ALERTA_NO_ENCONTRADA');
    };
    const r = await intentarAsumir('exp-1', gestor, asumir);
    assert.deepEqual(r, { tipo: 'error', mensaje: 'Alerta no encontrada' });
    await intentarAsumir('exp-1', gestor, asumir);
    assert.deepEqual(usados, ['op-1', 'op-2']);
  });
});
