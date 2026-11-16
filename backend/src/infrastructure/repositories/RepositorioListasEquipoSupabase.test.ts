import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { RepositorioListasEquipoSupabase } from './RepositorioListasEquipoSupabase.js';

it('el adaptador traduce un fallo RPC sin filtrar detalles técnicos al cliente', async () => {
  const cliente = createClient('http://127.0.0.1:1', 'clave-ficticia', {
    auth: { persistSession: false },
    global: { fetch: async () => Response.json({ code: 'XX000', message: 'detalle-interno', details: 'consulta-interna' }, { status: 500 }) },
  });
  const dao = new RepositorioListasEquipoSupabase(cliente);
  await assert.rejects(dao.listar('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), {
    codigoEstado: 500, codigo: 'PERSISTENCIA_EQUIPO_FALLIDA',
    message: 'No se pudo completar la operación de equipo.',
  });
});
