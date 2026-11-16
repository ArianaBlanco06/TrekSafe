import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AVISO_PRIVACIDAD_BITACORA,
  LIMITE_TEXTO_ENTRADA,
  entradaCorregida,
  fechaHoraEntrada,
  intentarAgregarEntrada,
  resumenTexto,
  textoAutorEntrada,
  textoSoloLectura,
  validarTextoEntrada,
} from './bitacoraIncidente';
import { crearGestorOperacion } from './coordinacionRescate';
import { ErrorClienteApi } from '../services/clienteApi';
import type { BitacoraIncidente, EntradaBitacoraIncidente } from '../services/bitacoraIncidente';

const entrada = (extra: Partial<EntradaBitacoraIncidente> = {}): EntradaBitacoraIncidente => ({
  id: 'e1',
  tipo: 'nota',
  texto: 'Llegamos al punto',
  autor: { autorId: 'a1', nombreAutor: 'Ana Rescate', esMia: false },
  registradaEn: '2030-01-15T12:05:00.000Z',
  corrigeEntradaId: null,
  ...extra,
});

const bitacora = (extra: Partial<BitacoraIncidente> = {}): BitacoraIncidente => ({
  incidenteId: 'inc-1',
  expedicionId: 'exp-1',
  estado: 'abierto',
  responsable: { responsableId: 'a1', nombreResponsable: 'Ana Rescate' },
  esResponsable: true,
  puedeEscribir: true,
  entradas: [],
  ...extra,
});

describe('validarTextoEntrada', () => {
  it('vacío y solo espacios son inválidos; 2000 es válido y 2001 no', () => {
    assert.match(validarTextoEntrada('') ?? '', /vacío/);
    assert.match(validarTextoEntrada('   \n ') ?? '', /vacío/);
    assert.equal(validarTextoEntrada('a'.repeat(LIMITE_TEXTO_ENTRADA)), null);
    assert.match(validarTextoEntrada('a'.repeat(LIMITE_TEXTO_ENTRADA + 1)) ?? '', /2000/);
    assert.equal(validarTextoEntrada(`  ${'a'.repeat(LIMITE_TEXTO_ENTRADA)}  `), null);
  });
});

describe('presentación de entradas', () => {
  it('fechaHoraEntrada da dd/mm/aaaa HH:MM en la zona indicada y — si la fecha no es válida', () => {
    assert.equal(fechaHoraEntrada('2030-01-15T12:05:00.000Z', 'UTC'), '15/01/2030 12:05');
    assert.equal(fechaHoraEntrada('2030-01-15T12:05:00.000Z', 'America/Lima'), '15/01/2030 07:05');
    assert.equal(fechaHoraEntrada('no-es-fecha'), '—');
  });

  it('muestra "Tú" solo si esMia, sin comparar nombres', () => {
    assert.equal(textoAutorEntrada(entrada({ autor: { autorId: 'a1', nombreAutor: 'Mi Nombre', esMia: true } })), 'Tú');
    assert.equal(textoAutorEntrada(entrada({ autor: { autorId: 'a2', nombreAutor: 'Mi Nombre', esMia: false } })), 'Mi Nombre');
  });

  it('resumenTexto compacta espacios y recorta con puntos suspensivos', () => {
    assert.equal(resumenTexto('uno\n  dos'), 'uno dos');
    const largo = resumenTexto('a'.repeat(200), 10);
    assert.equal(largo.length, 10);
    assert.ok(largo.endsWith('…'));
  });

  it('entradaCorregida encuentra la original o devuelve null', () => {
    const original = entrada({ id: 'o1' });
    const correccion = entrada({ id: 'c1', tipo: 'correccion', corrigeEntradaId: 'o1' });
    assert.equal(entradaCorregida([original, correccion], correccion), original);
    assert.equal(entradaCorregida([original, correccion], original), null);
    assert.equal(entradaCorregida([correccion], correccion), null);
  });

  it('textoSoloLectura: cerrado, otro responsable o null si puede escribir', () => {
    assert.equal(textoSoloLectura(bitacora()), null);
    assert.equal(
      textoSoloLectura(bitacora({ estado: 'cerrado', puedeEscribir: false })),
      'Incidente cerrado: la bitácora es de solo lectura.',
    );
    assert.equal(
      textoSoloLectura(bitacora({ esResponsable: false, puedeEscribir: false, responsable: { responsableId: 'b', nombreResponsable: 'Beto Rescate' } })),
      'Solo Beto Rescate (responsable vigente) puede añadir entradas.',
    );
  });

  it('el aviso de privacidad menciona datos médicos', () => {
    assert.match(AVISO_PRIVACIDAD_BITACORA, /datos médicos/);
  });
});

describe('intentarAgregarEntrada', () => {
  const datos = { texto: 'Nota', corrigeEntradaId: null };
  const gestor = () => {
    let n = 0;
    return crearGestorOperacion(() => `op-${++n}`);
  };

  it('éxito: devuelve la entrada y resuelve el operacionId', async () => {
    const g = gestor();
    const usados: string[] = [];
    const r = await intentarAgregarEntrada('inc-1', g, async (_id, e) => {
      usados.push(e.operacionId);
      return { entrada: entrada() };
    }, datos);
    assert.equal(r.tipo, 'agregada');
    assert.deepEqual(usados, ['op-1']);
    assert.equal(g.obtener(), 'op-2', 'tras el éxito el siguiente intento usa otro operacionId');
  });

  it('envía el texto y corrigeEntradaId al servicio', async () => {
    let recibido: unknown;
    await intentarAgregarEntrada('inc-9', gestor(), async (id, e) => {
      recibido = [id, e];
      return { entrada: entrada() };
    }, { texto: 'Corrección', corrigeEntradaId: 'o1' });
    assert.deepEqual(recibido, ['inc-9', { operacionId: 'op-1', texto: 'Corrección', corrigeEntradaId: 'o1' }]);
  });

  it('403 NO_ES_RESPONSABLE: devuelve el responsable vigente y resuelve', async () => {
    const g = gestor();
    const r = await intentarAgregarEntrada('inc-1', g, async () => {
      throw new ErrorClienteApi('No eres responsable', 403, 'NO_ES_RESPONSABLE', undefined, {
        responsableVigente: { responsableId: 'b', nombreResponsable: 'Beto Rescate' },
      });
    }, datos);
    assert.deepEqual(r, { tipo: 'no_responsable', responsable: { responsableId: 'b', nombreResponsable: 'Beto Rescate' } });
    assert.equal(g.obtener(), 'op-2');
  });

  it('403 sin responsable válido no inventa un nombre', async () => {
    const r = await intentarAgregarEntrada('inc-1', gestor(), async () => {
      throw new ErrorClienteApi('x', 403, 'NO_ES_RESPONSABLE', undefined, { responsableVigente: 1 });
    }, datos);
    assert.deepEqual(r, { tipo: 'no_responsable', responsable: null });
  });

  it('409 INCIDENTE_CERRADO: resuelve', async () => {
    const g = gestor();
    const r = await intentarAgregarEntrada('inc-1', g, async () => {
      throw new ErrorClienteApi('Cerrado', 409, 'INCIDENTE_CERRADO');
    }, datos);
    assert.deepEqual(r, { tipo: 'cerrado' });
    assert.equal(g.obtener(), 'op-2');
  });

  it('un error sin respuesta (0) o un 503 conservan el mismo operacionId en el segundo intento', async () => {
    for (const estado of [0, 503]) {
      const g = gestor();
      const usados: string[] = [];
      const agregar = async (_id: string, e: { operacionId: string }) => {
        usados.push(e.operacionId);
        if (usados.length === 1) throw new ErrorClienteApi('Sin conexión', estado);
        return { entrada: entrada() };
      };
      const primero = await intentarAgregarEntrada('inc-1', g, agregar, datos);
      assert.deepEqual(primero, { tipo: 'error', mensaje: 'Sin conexión', incierto: true });
      const segundo = await intentarAgregarEntrada('inc-1', g, agregar, datos);
      assert.equal(segundo.tipo, 'agregada');
      assert.deepEqual(usados, ['op-1', 'op-1'], `estado ${estado}`);
    }
  });

  it('un 400 es definitivo: resuelve y no es incierto', async () => {
    const g = gestor();
    const r = await intentarAgregarEntrada('inc-1', g, async () => {
      throw new ErrorClienteApi('Datos inválidos', 400, 'ErrorValidacion');
    }, datos);
    assert.deepEqual(r, { tipo: 'error', mensaje: 'Datos inválidos', incierto: false });
    assert.equal(g.obtener(), 'op-2');
  });
});
