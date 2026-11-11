import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { RepositorioRescate } from './RepositorioRescate.js';

describe('HU-43: conteo de participantes en las consultas de rescate', () => {
  for (const listado of ['monitor', 'alertas'] as const) {
    it(`${listado}: pide el conteo embebido, conserva filtros y devuelve expediciones sin acompañantes`, async () => {
      const peticiones: URL[] = [];
      const filas = [
        { id: 'individual', acompanantes_expedicion: [{ count: 0 }] },
        { id: 'grupal', acompanantes_expedicion: [{ count: 7 }] },
      ];
      const cliente = createClient('http://127.0.0.1:1', 'fixture-prioridad', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (entrada) => {
            peticiones.push(new URL(String(entrada)));
            return new Response(JSON.stringify(filas), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          },
        },
      });
      const repo = new RepositorioRescate(cliente);
      const resultado = listado === 'monitor'
        ? await repo.listarExpedicionesMonitor('Destino')
        : await repo.listarExpedicionesEnAlerta();

      assert.deepEqual(resultado, filas);
      assert.equal(peticiones.length, 1, 'el conteo no añade lecturas por expedición');
      const consulta = peticiones[0]!;
      assert.equal(consulta.pathname, '/rest/v1/expediciones');
      assert.match(consulta.searchParams.get('select')!, /acompanantes_expedicion\(count\)/);
      assert.doesNotMatch(consulta.searchParams.get('select')!, /!inner|nombre_acompanante/);
      assert.equal(consulta.searchParams.get('estado'), listado === 'monitor' ? 'in.(en_progreso,alerta)' : 'eq.alerta');
      assert.equal(consulta.searchParams.get('lugar_fin'), listado === 'monitor' ? 'ilike.%Destino%' : null);
    });
  }
});
