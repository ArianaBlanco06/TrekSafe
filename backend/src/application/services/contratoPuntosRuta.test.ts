import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { z } from 'zod';
import type { IConsultaPuntosRuta, IGuardadoPuntosRuta, OrdenGuardarPuntos } from '../ports/puntosRuta.js';
import type { RutaConPuntos } from '../../domain/entities/RutaConPuntos.js';
import { RepositorioPuntosRuta } from '../../infrastructure/repositories/RepositorioPuntosRuta.js';
import { RepositorioPuntosRutaMemoria } from '../../testing/puntosRuta/RepositorioPuntosRutaMemoria.js';
import {
  senderistaFixture as actor, otroSenderistaFixture as otro, rutaFixture, puntoFixture, ahoraFixture,
} from '../../testing/puntosRuta/fixtures.js';

type Contexto = {
  repo: IConsultaPuntosRuta & IGuardadoPuntosRuta;
  planId: string;
  otroPlanId: string;
  cambiar: (cambios: Partial<Pick<RutaConPuntos['expedicion'], 'estado' | 'horaInicio' | 'version'>>) => Promise<void>;
  cerrar: () => Promise<void>;
};

async function escenarioMemoria(): Promise<Contexto> {
  const repo = new RepositorioPuntosRutaMemoria(ahoraFixture);
  const ruta = rutaFixture();
  const otra = rutaFixture();
  repo.preparar(actor, ruta);
  repo.preparar(otro, otra);
  return {
    repo, planId: ruta.expedicion.id, otroPlanId: otra.expedicion.id,
    cambiar: async (cambios) => { repo.cambiarContexto(ruta.expedicion.id, cambios); },
    cerrar: async () => {},
  };
}

async function escenarioSql(): Promise<Contexto> {
  // Solo el runner del cluster temporal prepara esta variable. Nunca lee .env.
  const config = z.object({
    host: z.literal('127.0.0.1'), port: z.number().int().min(1024).max(65535).refine(p => p !== 5432),
    user: z.literal('treksafe_hu32_test'), database: z.literal('postgres'),
  }).strict().parse(JSON.parse(process.env.TREKSAFE_HU32_TEST_PG!));
  const admin = new pg.Client(config);
  await admin.connect();
  const planId = randomUUID();
  const otroPlanId = randomUUID();
  try {
    await admin.query(`INSERT INTO public.expediciones(id,senderista_id,lugar_inicio,lugar_fin,
      coordenadas_inicio,coordenadas_fin,hora_inicio,hora_retorno_estimada,estado)
      VALUES ($1,$2,'Inicio ficticio','Destino ficticio','-9.04000, -77.61000','-9.01000, -77.60000',
        '2099-01-01T12:00:00Z','2099-01-02T12:00:00Z','programada'),
        ($3,$4,'Inicio ficticio','Destino ficticio','-9.04000, -77.61000','-9.01000, -77.60000',
        '2099-01-01T12:00:00Z','2099-01-02T12:00:00Z','programada')`, [planId, actor, otroPlanId, otro]);
  } catch (error) {
    await admin.end();
    throw error;
  }
  // Sustituye solo el transporte PostgREST, manteniendo el adaptador de
  // produccion, los parametros RPC y la ejecucion real como service_role.
  const repo = new RepositorioPuntosRuta({
    async rpc(nombre, parametros) {
      const client = new pg.Client(config);
      try {
        await client.connect();
        await client.query('SET ROLE service_role');
        const consulta = nombre === 'treksafe_consultar_puntos_ruta'
          ? { text: 'SELECT public.treksafe_consultar_puntos_ruta($1,$2) AS value',
            values: [parametros.p_senderista_id, parametros.p_expedicion_id] }
          : { text: 'SELECT public.treksafe_guardar_puntos_ruta($1,$2,$3,$4::jsonb) AS value',
            values: [parametros.p_senderista_id, parametros.p_expedicion_id,
              parametros.p_version_esperada, JSON.stringify(parametros.p_puntos)] };
        assert.ok(['treksafe_consultar_puntos_ruta', 'treksafe_guardar_puntos_ruta'].includes(nombre));
        const result = await client.query(consulta);
        return { data: result.rows[0].value, error: null };
      } catch (error) {
        return { data: null, error };
      } finally {
        await client.end();
      }
    },
  });
  return {
    repo, planId, otroPlanId,
    cambiar: async ({ estado, horaInicio, version }) => {
      await admin.query(`UPDATE public.expediciones SET estado=coalesce($2::public.estado_expedicion_enum,estado),
        hora_inicio=coalesce($3::timestamptz,hora_inicio), version=coalesce($4::integer,version)
        WHERE id=$1`, [planId, estado, horaInicio, version]);
    },
    cerrar: async () => { await admin.end(); },
  };
}

const contrato: Array<[string, (ctx: Contexto) => Promise<void>]> = [
  ['ultimo incremento INTEGER y no-op en la version maxima', async ({ repo, planId, cambiar }) => {
    await cambiar({ version: 2_147_483_646 });
    const puntos = [puntoFixture()];
    const result = await repo.guardarColeccionPropia({ senderistaId: actor, expedicionId: planId,
      versionEsperada: 2_147_483_646, puntos });
    assert.equal(result.tipo, 'guardado');
    if (result.tipo !== 'guardado') return;
    assert.equal(result.ruta.expedicion.version, 2_147_483_647);
    const same = await repo.guardarColeccionPropia({ senderistaId: actor, expedicionId: planId,
      versionEsperada: 2_147_483_647, puntos });
    assert.deepEqual(same, result);
  }],
  ['rango INTEGER agotado no modifica la coleccion', async ({ repo, planId, cambiar }) => {
    await cambiar({ version: 2_147_483_647 });
    const before = await repo.consultarPropia(actor, planId);
    await assert.rejects(repo.guardarColeccionPropia({ senderistaId: actor, expedicionId: planId,
      versionEsperada: 2_147_483_647, puntos: [puntoFixture()] }));
    assert.deepEqual(await repo.consultarPropia(actor, planId), before);
  }],
  ['consulta vacia y privada', async ({ repo, planId }) => {
    assert.deepEqual((await repo.consultarPropia(actor, planId))!.puntos, []);
    assert.equal(await repo.consultarPropia(otro, planId), null);
    assert.equal(await repo.consultarPropia(actor, randomUUID()), null);
  }],
  ['normalizacion Unicode, redondeo decimal negativo y orden', async ({ repo, planId }) => {
    const a = puntoFixture(2, { nombre: '\u00a0\tMirador\u3000', latitud: -9.000005 });
    const b = puntoFixture(1, { nombre: '\u{1f3d4}'.repeat(100) });
    const result = await repo.guardarColeccionPropia({ senderistaId: actor, expedicionId: planId, versionEsperada: 1, puntos: [a, b] });
    assert.equal(result.tipo, 'guardado');
    if (result.tipo !== 'guardado') return;
    assert.equal(result.ruta.expedicion.version, 2);
    assert.deepEqual(result.ruta.puntos.map(p => p.id), [b.id, a.id]);
    assert.equal(result.ruta.puntos[1].nombre, 'Mirador');
    assert.equal(result.ruta.puntos[1].latitud, -9.00001);
    assert.deepEqual(await repo.consultarPropia(actor, planId), result.ruta);
  }],
  ['20 puntos aceptados; 21 rechazados sin cambios', async ({ repo, planId }) => {
    const points = Array.from({ length: 20 }, (_, i) => puntoFixture(i + 1));
    const first = await repo.guardarColeccionPropia({ senderistaId: actor, expedicionId: planId, versionEsperada: 1, puntos: points });
    assert.equal(first.tipo, 'guardado');
    const before = await repo.consultarPropia(actor, planId);
    const rejected = await repo.guardarColeccionPropia({ senderistaId: actor, expedicionId: planId,
      versionEsperada: before!.expedicion.version, puntos: [...points, puntoFixture(21)] });
    assert.equal(rejected.tipo, 'datos_invalidos');
    assert.deepEqual(await repo.consultarPropia(actor, planId), before);
  }],
  ['nombre, coordenada original y orden invalidos no escriben', async ({ repo, planId }) => {
    const before = await repo.consultarPropia(actor, planId);
    for (const puntos of [[puntoFixture(1, { nombre: '  ' })], [puntoFixture(1, { latitud: 0.500000001 })],
      [puntoFixture(1), puntoFixture(1)]]) {
      assert.equal((await repo.guardarColeccionPropia({ senderistaId: actor, expedicionId: planId, versionEsperada: 1, puntos })).tipo, 'datos_invalidos');
      assert.deepEqual(await repo.consultarPropia(actor, planId), before);
    }
  }],
  ['ID ajeno no se traslada y conserva ambas colecciones', async ({ repo, planId, otroPlanId }) => {
    const p = puntoFixture();
    await repo.guardarColeccionPropia({ senderistaId: otro, expedicionId: otroPlanId, versionEsperada: 1, puntos: [p] });
    const before = await repo.consultarPropia(actor, planId);
    const foreign = await repo.consultarPropia(otro, otroPlanId);
    assert.equal((await repo.guardarColeccionPropia({ senderistaId: actor, expedicionId: planId, versionEsperada: 1, puntos: [p] })).tipo, 'datos_invalidos');
    assert.deepEqual(await repo.consultarPropia(actor, planId), before);
    assert.deepEqual(await repo.consultarPropia(otro, otroPlanId), foreign);
  }],
  ['guardar plan ajeno e inexistente devuelve el mismo rechazo', async ({ repo, planId }) => {
    const orden = { senderistaId: otro, expedicionId: planId, versionEsperada: 1, puntos: [] };
    assert.deepEqual(await repo.guardarColeccionPropia(orden), { tipo: 'no_encontrado' });
    assert.deepEqual(await repo.guardarColeccionPropia({ ...orden, expedicionId: randomUUID() }), { tipo: 'no_encontrado' });
  }],
  ['reordenacion conserva identidad y no-op conserva version', async ({ repo, planId }) => {
    const p = puntoFixture();
    const q = puntoFixture(2);
    await repo.guardarColeccionPropia({ senderistaId: actor, expedicionId: planId, versionEsperada: 1, puntos: [p, q] });
    const reordered = [{ ...p, orden: 2 }, { ...q, orden: 1 }];
    await repo.guardarColeccionPropia({ senderistaId: actor, expedicionId: planId, versionEsperada: 2, puntos: reordered });
    const before = await repo.consultarPropia(actor, planId);
    assert.deepEqual(before!.puntos.map(punto => punto.id), [q.id, p.id]);
    const result = await repo.guardarColeccionPropia({ senderistaId: actor, expedicionId: planId, versionEsperada: 3, puntos: reordered });
    assert.equal(result.tipo, 'guardado');
    assert.deepEqual(await repo.consultarPropia(actor, planId), before);
  }],
  ['eliminar todos conserva extremos y otros campos del contexto', async ({ repo, planId }) => {
    const before = (await repo.consultarPropia(actor, planId))!;
    await repo.guardarColeccionPropia({ senderistaId: actor, expedicionId: planId, versionEsperada: 1, puntos: [puntoFixture()] });
    await repo.guardarColeccionPropia({ senderistaId: actor, expedicionId: planId, versionEsperada: 2, puntos: [] });
    const after = (await repo.consultarPropia(actor, planId))!;
    assert.deepEqual(after, { ...before, expedicion: { ...before.expedicion, version: 3 } });
  }],
  ['respuesta perdida y version obsoleta no duplican puntos', async ({ repo, planId }) => {
    const orden = { senderistaId: actor, expedicionId: planId, versionEsperada: 1, puntos: [puntoFixture()] };
    await repo.guardarColeccionPropia(orden);
    const before = await repo.consultarPropia(actor, planId);
    assert.deepEqual(await repo.guardarColeccionPropia(orden), { tipo: 'version_obsoleta' });
    assert.deepEqual(await repo.consultarPropia(actor, planId), before);
  }],
  ['estados operativos impiden escritura y permiten lectura privada', async ({ repo, planId, cambiar }) => {
    for (const estado of ['en_progreso', 'alerta', 'completada'] as const) {
      await cambiar({ estado });
      assert.equal((await repo.consultarPropia(actor, planId))!.expedicion.editable, false);
      assert.equal((await repo.guardarColeccionPropia({ senderistaId: actor, expedicionId: planId, versionEsperada: 1, puntos: [] })).tipo, 'expedicion_no_editable');
    }
  }],
  ['salida alcanzada impide escritura aunque siga programada', async ({ repo, planId, cambiar }) => {
    await cambiar({ horaInicio: '2000-01-01T00:00:00.000Z' });
    assert.equal((await repo.consultarPropia(actor, planId))!.expedicion.editable, false);
    assert.equal((await repo.guardarColeccionPropia({ senderistaId: actor, expedicionId: planId, versionEsperada: 1, puntos: [] })).tipo, 'expedicion_ya_iniciada');
  }],
  ['dos comandos con la misma version dejan un solo ganador', async ({ repo, planId }) => {
    const base: OrdenGuardarPuntos = { senderistaId: actor, expedicionId: planId, versionEsperada: 1, puntos: [] };
    const resultados = await Promise.all([
      repo.guardarColeccionPropia({ ...base, puntos: [puntoFixture()] }),
      repo.guardarColeccionPropia({ ...base, puntos: [puntoFixture()] }),
    ]);
    assert.deepEqual(resultados.map(r => r.tipo).sort(), ['guardado', 'version_obsoleta']);
    assert.equal((await repo.consultarPropia(actor, planId))!.expedicion.version, 2);
  }],
];

function registrar(nombre: string, crear: () => Promise<Contexto>, skip = false) {
  describe(nombre, { skip }, () => {
    for (const [caso, comprobar] of contrato) {
      it(caso, async () => {
        const ctx = await crear();
        try { await comprobar(ctx); } finally { await ctx.cerrar(); }
      });
    }
  });
}
registrar('Contrato de puntos: memoria', escenarioMemoria);
registrar('Contrato de puntos: adaptador con PostgreSQL temporal', escenarioSql, !process.env.TREKSAFE_HU32_TEST_PG);
