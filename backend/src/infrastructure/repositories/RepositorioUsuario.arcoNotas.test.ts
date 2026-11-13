import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// El repositorio construye el cliente al instanciarse; se fija un entorno ficticio antes de importarlo.
Object.assign(process.env, {
  NODE_ENV: 'test',
  SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture',
  JWT_SECRET: 'secreto-ficticio-arco-notas-0000000000',
  MEDICAL_ENCRYPTION_KEY: 'secreto-medico-ficticio-0000000000000',
});

const { RepositorioUsuario } = await import('./RepositorioUsuario.js');
const { ErrorAplicacion } = await import('../../shared/errors/ErrorAplicacion.js');

const SENDERISTA = '11111111-1111-4111-8111-111111111111';
const EXPEDICIONES = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];

type Evento = string;

/** Cliente falso con constructor de consultas encadenable y una RPC configurable. Anota el orden de las operaciones. */
function clienteFalso(opciones: { expedicionesCerradas?: string[]; rpc?: { data?: unknown; error?: { message: string } | null } }) {
  const eventos: Evento[] = [];
  const rpcs: { nombre: string; parametros: unknown }[] = [];
  function constructor(tabla: string) {
    let operacion = 'select';
    const q: Record<string, unknown> = {};
    for (const metodo of ['select', 'eq', 'in', 'limit']) {
      q[metodo] = (...args: unknown[]) => {
        if (metodo === 'in' && args[0] === 'estado' && (args[1] as string[]).includes('completada')) operacion = 'select-cerradas';
        return q;
      };
    }
    q.update = () => {
      operacion = 'update';
      return q;
    };
    q.delete = () => {
      operacion = 'delete';
      return q;
    };
    q.then = (resolver: (v: unknown) => unknown) => {
      eventos.push(`${operacion}:${tabla}`);
      let data: unknown = null;
      if (tabla === 'expediciones' && operacion === 'select') data = [];
      if (tabla === 'expediciones' && operacion === 'select-cerradas') data = (opciones.expedicionesCerradas ?? []).map((id) => ({ id }));
      return Promise.resolve(resolver({ data, error: null }));
    };
    return q;
  }
  const cliente = {
    from: (tabla: string) => constructor(tabla),
    rpc: async (nombre: string, parametros: unknown) => {
      eventos.push(`rpc:${nombre}`);
      rpcs.push({ nombre, parametros });
      return { data: opciones.rpc?.data ?? null, error: opciones.rpc?.error ?? null };
    },
  };
  return { cliente, eventos, rpcs };
}

function repositorio(cliente: unknown) {
  const repo = new RepositorioUsuario();
  Object.assign(repo, { supabase: cliente });
  return repo;
}

describe('RepositorioUsuario.anonimizarHistorialRutas: notas de avance (HU-50, ARCO)', () => {
  it('limpia las notas con la RPC definidora antes de anonimizar las expediciones y devuelve el conteo', async () => {
    const { cliente, eventos, rpcs } = clienteFalso({ expedicionesCerradas: EXPEDICIONES, rpc: { data: 3 } });
    const resultado = await repositorio(cliente).anonimizarHistorialRutas(SENDERISTA);
    assert.deepEqual(resultado, { expedicionesAnonimizadas: 2, notasAvanceAnonimizadas: 3 });
    assert.deepEqual(rpcs, [{ nombre: 'treksafe_anonimizar_notas_avance', parametros: { p_senderista_id: SENDERISTA, p_expedicion_ids: EXPEDICIONES } }]);
    assert.ok(eventos.indexOf('rpc:treksafe_anonimizar_notas_avance') < eventos.indexOf('update:expediciones'), 'la RPC va antes de actualizar expediciones');
  });

  it('sin expediciones cerradas no llama a la RPC y devuelve ceros', async () => {
    const { cliente, rpcs } = clienteFalso({ expedicionesCerradas: [] });
    assert.deepEqual(await repositorio(cliente).anonimizarHistorialRutas(SENDERISTA), { expedicionesAnonimizadas: 0, notasAvanceAnonimizadas: 0 });
    assert.equal(rpcs.length, 0);
  });

  it('si la RPC falla lanza 500 sin anonimizar nada más', async () => {
    const { cliente, eventos } = clienteFalso({ expedicionesCerradas: EXPEDICIONES, rpc: { error: { message: 'boom' } } });
    const original = console.error;
    console.error = () => undefined;
    try {
      await assert.rejects(repositorio(cliente).anonimizarHistorialRutas(SENDERISTA), (e: unknown) => {
        assert.ok(e instanceof ErrorAplicacion);
        assert.equal(e.codigoEstado, 500);
        assert.equal(e.message, 'No se pudieron anonimizar las notas de avance');
        return true;
      });
    } finally {
      console.error = original;
    }
    assert.ok(!eventos.includes('update:expediciones'));
  });

  it('una respuesta no numérica de la RPC cuenta como cero notas', async () => {
    const { cliente } = clienteFalso({ expedicionesCerradas: EXPEDICIONES, rpc: { data: null } });
    assert.equal((await repositorio(cliente).anonimizarHistorialRutas(SENDERISTA)).notasAvanceAnonimizadas, 0);
  });
});
