import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorBitacoraIncidente, type CodigoErrorBitacoraIncidente } from '../../domain/errors/ErrorBitacoraIncidente.js';
import type { SolicitudEntradaBitacora } from '../../domain/repositories/IBitacoraIncidenteDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import {
  BitacoraIncidenteDAOSupabase,
  COLUMNAS_ENTRADA_BITACORA,
  COLUMNAS_INCIDENTE_BITACORA,
} from './BitacoraIncidenteDAOSupabase.js';

const INCIDENTE = '11111111-1111-4111-8111-111111111111';
const AUTOR = '22222222-2222-4222-8222-222222222222';
const OPERACION = '33333333-3333-4333-8333-333333333333';
const ENTRADA = '44444444-4444-4444-8444-444444444444';
const EXPEDICION = '55555555-5555-4555-8555-555555555555';

const solicitud: SolicitudEntradaBitacora = {
  incidenteId: INCIDENTE, autorId: AUTOR, texto: 'Nota', corrigeEntradaId: null, operacionId: OPERACION,
};

type Respuesta = { data?: unknown; error?: { message: string; details?: unknown } | null };
type Llamada = { tabla: string; select?: string; filtros: [string, unknown][]; orden: [string, unknown][] };

/** Cliente simulado: `from` encadenable que registra select/eq/order y `rpc`. */
function cliente(opciones: { tablas?: Record<string, Respuesta>; rpc?: Respuesta }) {
  const llamadas: Llamada[] = [];
  const rpcs: { nombre: string; parametros: unknown }[] = [];
  const simulado = {
    from: (tabla: string) => {
      const llamada: Llamada = { tabla, filtros: [], orden: [] };
      llamadas.push(llamada);
      const constructor = {
        select: (columnas: string) => { llamada.select = columnas; return constructor; },
        eq: (columna: string, valor: unknown) => { llamada.filtros.push([columna, valor]); return constructor; },
        order: (columna: string, opts: unknown) => { llamada.orden.push([columna, opts]); return constructor; },
        then: (resolver: (v: unknown) => unknown) => {
          const r = opciones.tablas?.[tabla] ?? { data: [] };
          return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(resolver);
        },
      };
      return constructor;
    },
    rpc: async (nombre: string, parametros: unknown) => {
      rpcs.push({ nombre, parametros });
      return { data: opciones.rpc?.data ?? null, error: opciones.rpc?.error ?? null };
    },
  } as unknown as Pick<SupabaseClient, 'from' | 'rpc'>;
  return { cliente: simulado, llamadas, rpcs };
}

const resultadoRpc = (extra: Record<string, unknown> = {}) => ({
  id: ENTRADA, incidenteId: INCIDENTE, tipo: 'nota', texto: 'Nota',
  autor: { id: AUTOR, nombreCompleto: 'Ana Rescate' },
  registradaEn: '2030-01-15T12:00:00.123456+00:00', corrigeEntradaId: null, repetido: false, ...extra,
});

async function conLogCapturado(fn: () => Promise<void>): Promise<unknown[][]> {
  const original = console.error;
  const registros: unknown[][] = [];
  console.error = (...args: unknown[]) => void registros.push(args);
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return registros;
}

const filaIncidente = (extra: Record<string, unknown> = {}) => ({
  id: INCIDENTE, expedicion_id: EXPEDICION, estado: 'abierto', version: 2, responsable_id: AUTOR,
  perfiles_rescatista: { nombre_completo: 'Ana Rescate' }, ...extra,
});
const filaEntrada = (extra: Record<string, unknown> = {}) => ({
  id: ENTRADA, secuencia: 1, incidente_id: INCIDENTE, tipo: 'nota', texto: 'Nota', autor_id: AUTOR,
  registrada_en: '2030-01-15T12:00:00.5+00:00', corrige_entrada_id: null,
  perfiles_rescatista: { nombre_completo: 'Ana Rescate' }, ...extra,
});

describe('BitacoraIncidenteDAOSupabase.agregar', () => {
  it('invoca la RPC con sus cinco parámetros exactos y mapea el resultado con la fecha en ISO', async () => {
    const { cliente: c, rpcs } = cliente({ rpc: { data: resultadoRpc() } });
    const r = await new BitacoraIncidenteDAOSupabase(c).agregar(solicitud);
    assert.deepEqual(rpcs, [{
      nombre: 'treksafe_agregar_entrada_bitacora',
      parametros: {
        p_incidente_id: INCIDENTE, p_autor_id: AUTOR, p_texto: 'Nota', p_corrige_entrada_id: null, p_operacion_id: OPERACION,
      },
    }]);
    assert.deepEqual(r, {
      entrada: {
        id: ENTRADA, incidenteId: INCIDENTE, tipo: 'nota', texto: 'Nota', autorId: AUTOR, nombreAutor: 'Ana Rescate',
        registradaEn: '2030-01-15T12:00:00.123Z', corrigeEntradaId: null,
      },
      repetido: false,
    });
  });

  it('cada código de negocio de la RPC se convierte en ErrorBitacoraIncidente', async () => {
    const codigos: CodigoErrorBitacoraIncidente[] = [
      'DATOS_INVALIDOS', 'INCIDENTE_NO_ENCONTRADO', 'INCIDENTE_CERRADO', 'CORRECCION_INVALIDA', 'OPERACION_YA_REGISTRADA',
    ];
    for (const codigo of codigos) {
      const { cliente: c } = cliente({ rpc: { error: { message: codigo } } });
      await assert.rejects(new BitacoraIncidenteDAOSupabase(c).agregar(solicitud), (e: unknown) => {
        assert.ok(e instanceof ErrorBitacoraIncidente);
        assert.equal(e.codigo, codigo);
        assert.equal(e.responsableVigente, undefined);
        return true;
      });
    }
  });

  it('NO_ES_RESPONSABLE lleva el responsable vigente leído del DETAIL', async () => {
    const detalle = JSON.stringify({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', nombreCompleto: 'Beto Rescate' });
    const { cliente: c } = cliente({ rpc: { error: { message: 'NO_ES_RESPONSABLE', details: detalle } } });
    await assert.rejects(new BitacoraIncidenteDAOSupabase(c).agregar(solicitud), (e: unknown) => {
      assert.ok(e instanceof ErrorBitacoraIncidente);
      assert.equal(e.codigo, 'NO_ES_RESPONSABLE');
      assert.deepEqual(e.responsableVigente, { responsableId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', nombreResponsable: 'Beto Rescate' });
      return true;
    });
  });

  it('un DETAIL mal formado de NO_ES_RESPONSABLE da 500', async () => {
    for (const details of [undefined, null, 'no-json', '[]', '{"id":""}', JSON.stringify({ id: AUTOR })]) {
      const { cliente: c } = cliente({ rpc: { error: { message: 'NO_ES_RESPONSABLE', details } } });
      const registros = await conLogCapturado(async () => {
        await assert.rejects(new BitacoraIncidenteDAOSupabase(c).agregar(solicitud), (e: unknown) => {
          assert.ok(e instanceof ErrorAplicacion);
          assert.equal(e.codigoEstado, 500);
          return true;
        });
      });
      assert.equal(registros.length, 1);
    }
  });

  it('un error desconocido da 500 sin filtrar el mensaje de la base', async () => {
    const { cliente: c } = cliente({ rpc: { error: { message: 'relation "x" does not exist: secreto-interno' } } });
    const registros = await conLogCapturado(async () => {
      await assert.rejects(new BitacoraIncidenteDAOSupabase(c).agregar(solicitud), (e: unknown) => {
        assert.ok(e instanceof ErrorAplicacion);
        assert.equal(e.codigoEstado, 500);
        assert.ok(!e.message.includes('secreto-interno'));
        assert.notEqual(e.codigoEstado, 401);
        return true;
      });
    });
    assert.match(String(registros[0]?.join(' ')), /secreto-interno/); // solo va al log del servidor
  });

  it('un resultado mal formado da 500', async () => {
    const malos: unknown[] = [
      null, 'texto', {}, resultadoRpc({ tipo: 'otro' }), resultadoRpc({ registradaEn: 'no-es-fecha' }),
      resultadoRpc({ repetido: 'si' }), resultadoRpc({ autor: null }), resultadoRpc({ corrigeEntradaId: 5 }),
    ];
    for (const data of malos) {
      const { cliente: c } = cliente({ rpc: { data } });
      await conLogCapturado(async () => {
        await assert.rejects(new BitacoraIncidenteDAOSupabase(c).agregar(solicitud), (e: unknown) => {
          assert.ok(e instanceof ErrorAplicacion);
          assert.equal(e.codigoEstado, 500);
          return true;
        });
      });
    }
  });
});

describe('BitacoraIncidenteDAOSupabase.listar', () => {
  it('consulta con las columnas exactas, eq por id y por incidente_id y el orden registrada_en, secuencia', async () => {
    const { cliente: c, llamadas } = cliente({
      tablas: { incidentes: { data: [filaIncidente()] }, entradas_bitacora_incidente: { data: [filaEntrada()] } },
    });
    const bitacora = await new BitacoraIncidenteDAOSupabase(c).listar(INCIDENTE);

    assert.equal(llamadas.length, 2);
    assert.deepEqual(llamadas[0], { tabla: 'incidentes', select: COLUMNAS_INCIDENTE_BITACORA, filtros: [['id', INCIDENTE]], orden: [] });
    assert.deepEqual(llamadas[1], {
      tabla: 'entradas_bitacora_incidente', select: COLUMNAS_ENTRADA_BITACORA, filtros: [['incidente_id', INCIDENTE]],
      orden: [['registrada_en', { ascending: true }], ['secuencia', { ascending: true }]],
    });
    assert.deepEqual(bitacora?.incidente, {
      id: INCIDENTE, expedicionId: EXPEDICION, estado: 'abierto', version: 2, responsableId: AUTOR, nombreResponsable: 'Ana Rescate',
    });
    assert.deepEqual(bitacora?.entradas, [{
      id: ENTRADA, incidenteId: INCIDENTE, tipo: 'nota', texto: 'Nota', autorId: AUTOR, nombreAutor: 'Ana Rescate',
      registradaEn: '2030-01-15T12:00:00.500Z', corrigeEntradaId: null,
    }]);
  });

  it('las columnas no incluyen datos médicos ni la secuencia en la respuesta', async () => {
    assert.ok(!/medic|sangre|alergi|ficha/i.test(COLUMNAS_INCIDENTE_BITACORA + COLUMNAS_ENTRADA_BITACORA));
    const { cliente: c } = cliente({
      tablas: { incidentes: { data: [filaIncidente()] }, entradas_bitacora_incidente: { data: [filaEntrada()] } },
    });
    const bitacora = await new BitacoraIncidenteDAOSupabase(c).listar(INCIDENTE);
    assert.equal('secuencia' in (bitacora?.entradas[0] ?? {}), false);
  });

  it('si el incidente no existe devuelve null y no consulta las entradas', async () => {
    const { cliente: c, llamadas } = cliente({ tablas: { incidentes: { data: [] } } });
    assert.equal(await new BitacoraIncidenteDAOSupabase(c).listar(INCIDENTE), null);
    assert.equal(llamadas.length, 1);
  });

  it('el nombre embebido puede llegar como objeto, como arreglo o ausente', async () => {
    const { cliente: c } = cliente({
      tablas: {
        incidentes: { data: [filaIncidente({ perfiles_rescatista: [{ nombre_completo: 'En Arreglo' }] })] },
        entradas_bitacora_incidente: { data: [filaEntrada({ perfiles_rescatista: null }), filaEntrada({ id: 'x2', perfiles_rescatista: [{ nombre_completo: 'Otro' }] })] },
      },
    });
    const bitacora = await new BitacoraIncidenteDAOSupabase(c).listar(INCIDENTE);
    assert.equal(bitacora?.incidente.nombreResponsable, 'En Arreglo');
    assert.deepEqual(bitacora?.entradas.map((e) => e.nombreAutor), ['Rescatista', 'Otro']);
  });

  it('un error en cualquiera de las dos consultas da 500 sin filtrar el mensaje', async () => {
    const casos: Record<string, Respuesta>[] = [
      { incidentes: { error: { message: 'secreto-1' } } },
      { incidentes: { data: [filaIncidente()] }, entradas_bitacora_incidente: { error: { message: 'secreto-2' } } },
    ];
    for (const tablas of casos) {
      const { cliente: c } = cliente({ tablas });
      await conLogCapturado(async () => {
        await assert.rejects(new BitacoraIncidenteDAOSupabase(c).listar(INCIDENTE), (e: unknown) => {
          assert.ok(e instanceof ErrorAplicacion);
          assert.equal(e.codigoEstado, 500);
          assert.ok(!e.message.includes('secreto'));
          return true;
        });
      });
    }
  });
});
