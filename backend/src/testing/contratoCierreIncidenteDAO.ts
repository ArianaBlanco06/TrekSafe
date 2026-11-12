import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { ErrorBitacoraIncidente } from '../domain/errors/ErrorBitacoraIncidente.js';
import { ErrorCierreIncidente } from '../domain/errors/ErrorCierreIncidente.js';
import type { IBitacoraIncidenteDAO } from '../domain/repositories/IBitacoraIncidenteDAO.js';
import type { ICierreIncidenteDAO, SolicitudCierreIncidente } from '../domain/repositories/ICierreIncidenteDAO.js';
import { TEXTO_ENTRADA_LOCALIZADO } from '../domain/value-objects/cierreIncidente.js';

export type ContextoContratoCierre = {
  dao: ICierreIncidenteDAO;
  bitacora: IBitacoraIncidenteDAO;
  responsableA: string;
  rescatistaB: string;
  /** Crea un incidente abierto, con la expedición en 'alerta', cuyo responsable es `responsable` (por defecto, `responsableA`). */
  crearIncidente(responsable?: string): Promise<string>;
  expedicionDe(incidenteId: string): Promise<string>;
  /** Simula el relevo de HU-40: cambia el responsable y sube la versión. */
  relevar(incidenteId: string, nuevo: string): Promise<void>;
  estadoExpedicion(expedicionId: string): Promise<string>;
};

const INEXISTENTE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const nuevoId = (): string => crypto.randomUUID();

const rechazo = (codigo: string) => (e: unknown) => {
  assert.ok(e instanceof ErrorCierreIncidente, `se esperaba ErrorCierreIncidente y llegó ${String(e)}`);
  assert.equal(e.codigo, codigo);
  return true;
};

/** Misma evidencia para cualquier implementación (LSP): memoria y PostgreSQL real (mediante puente). */
export function verificarContratoCierreIncidenteDAO(
  nombre: string,
  crearContexto: (t: TestContext) => ContextoContratoCierre | Promise<ContextoContratoCierre>,
): void {
  describe(nombre, () => {
    const solicitud = (
      incidenteId: string,
      rescatistaId: string,
      extra: Partial<SolicitudCierreIncidente> = {},
    ): SolicitudCierreIncidente => ({
      comandoId: nuevoId(),
      incidenteId,
      rescatistaId,
      resultado: 'evacuado',
      resumen: 'Evacuada al refugio sin novedad',
      ...extra,
    });

    /** Incidente localizado por su responsable A (con la ruta real de "marcar localizado"). */
    async function incidenteLocalizado(c: ContextoContratoCierre): Promise<string> {
      const id = await c.crearIncidente();
      await c.dao.marcarLocalizado({ operacionId: nuevoId(), incidenteId: id, rescatistaId: c.responsableA });
      return id;
    }

    it('marcar localizado: el responsable pasa abierto → localizado, sube la versión y deja la nota fija en la bitácora', async (t) => {
      const c = await crearContexto(t);
      const id = await c.crearIncidente();
      const antes = (await c.bitacora.listar(id))!;
      const { incidente, repetido } = await c.dao.marcarLocalizado({ operacionId: nuevoId(), incidenteId: id, rescatistaId: c.responsableA });
      assert.equal(repetido, false);
      assert.equal(incidente.id, id);
      assert.equal(incidente.estado, 'localizado');
      assert.equal(incidente.version, antes.incidente.version + 1);
      assert.equal(incidente.responsableId, c.responsableA);
      const despues = (await c.bitacora.listar(id))!;
      assert.equal(despues.incidente.estado, 'localizado');
      assert.equal(despues.entradas.length, 1);
      assert.equal(despues.entradas[0]?.tipo, 'nota');
      assert.equal(despues.entradas[0]?.texto, TEXTO_ENTRADA_LOCALIZADO);
    });

    it('marcar localizado con la misma operación devuelve repetido sin escribir; con otra operación sobre un incidente ya localizado también', async (t) => {
      const c = await crearContexto(t);
      const id = await c.crearIncidente();
      const operacionId = nuevoId();
      const primera = await c.dao.marcarLocalizado({ operacionId, incidenteId: id, rescatistaId: c.responsableA });
      const segunda = await c.dao.marcarLocalizado({ operacionId, incidenteId: id, rescatistaId: c.responsableA });
      assert.equal(segunda.repetido, true);
      assert.equal(segunda.incidente.version, primera.incidente.version);
      const otra = await c.dao.marcarLocalizado({ operacionId: nuevoId(), incidenteId: id, rescatistaId: c.responsableA });
      assert.equal(otra.repetido, true);
      assert.equal(otra.incidente.estado, 'localizado');
      assert.equal((await c.bitacora.listar(id))!.entradas.length, 1);
    });

    it('marcar localizado: un no responsable recibe NO_ES_RESPONSABLE con el vigente; un inexistente, INCIDENTE_NO_ENCONTRADO; uno cerrado, INCIDENTE_CERRADO', async (t) => {
      const c = await crearContexto(t);
      const id = await c.crearIncidente();
      await assert.rejects(
        c.dao.marcarLocalizado({ operacionId: nuevoId(), incidenteId: id, rescatistaId: c.rescatistaB }),
        (e: unknown) => {
          rechazo('NO_ES_RESPONSABLE')(e);
          assert.equal((e as ErrorCierreIncidente).responsableVigente?.responsableId, c.responsableA);
          assert.ok((e as ErrorCierreIncidente).responsableVigente?.nombreResponsable);
          return true;
        });
      assert.equal((await c.bitacora.listar(id))!.incidente.estado, 'abierto');
      await assert.rejects(
        c.dao.marcarLocalizado({ operacionId: nuevoId(), incidenteId: INEXISTENTE, rescatistaId: c.responsableA }),
        rechazo('INCIDENTE_NO_ENCONTRADO'));
      const localizado = await incidenteLocalizado(c);
      await c.dao.cerrar(solicitud(localizado, c.responsableA));
      await assert.rejects(
        c.dao.marcarLocalizado({ operacionId: nuevoId(), incidenteId: localizado, rescatistaId: c.responsableA }),
        rechazo('INCIDENTE_CERRADO'));
    });

    it('cerrar: el responsable cierra un incidente localizado y recibe el informe (resumen recortado, expedición en alerta, entrada de cierre)', async (t) => {
      const c = await crearContexto(t);
      const id = await incidenteLocalizado(c);
      const expedicion = await c.expedicionDe(id);
      const { informe, repetido } = await c.dao.cerrar(
        solicitud(id, c.responsableA, { resultado: 'asistido_en_terreno', resumen: '  Atendida en el lugar  ' }));
      assert.equal(repetido, false);
      assert.equal(informe.incidenteId, id);
      assert.equal(informe.expedicionId, expedicion);
      assert.equal(informe.resultado, 'asistido_en_terreno');
      assert.equal(informe.resumen, 'Atendida en el lugar');
      assert.equal(informe.cerradoPorId, c.responsableA);
      assert.ok(informe.nombreCerradoPor.length > 0);
      assert.equal(new Date(informe.cerradoEn).toISOString(), informe.cerradoEn);
      assert.equal(informe.estadoExpedicion, 'alerta');

      const bitacora = (await c.bitacora.listar(id))!;
      assert.equal(bitacora.incidente.estado, 'cerrado');
      const ultima = bitacora.entradas.at(-1);
      assert.equal(ultima?.tipo, 'cierre');
      assert.equal(ultima?.texto, 'Atendida en el lugar');
      assert.equal(informe.entradaBitacoraId, ultima?.id);
    });

    it('cerrar un incidente abierto da INCIDENTE_NO_LOCALIZADO sin escribir', async (t) => {
      const c = await crearContexto(t);
      const id = await c.crearIncidente();
      await assert.rejects(c.dao.cerrar(solicitud(id, c.responsableA)), rechazo('INCIDENTE_NO_LOCALIZADO'));
      const bitacora = (await c.bitacora.listar(id))!;
      assert.equal(bitacora.incidente.estado, 'abierto');
      assert.deepEqual(bitacora.entradas, []);
      assert.equal(await c.dao.ultimoCierreDeExpedicion(await c.expedicionDe(id)), null);
    });

    it('un no responsable recibe NO_ES_RESPONSABLE con el responsable vigente y no se escribe nada', async (t) => {
      const c = await crearContexto(t);
      const id = await incidenteLocalizado(c);
      await assert.rejects(c.dao.cerrar(solicitud(id, c.rescatistaB)), (e: unknown) => {
        rechazo('NO_ES_RESPONSABLE')(e);
        const vigente = (e as ErrorCierreIncidente).responsableVigente;
        assert.equal(vigente?.responsableId, c.responsableA);
        assert.ok(vigente?.nombreResponsable);
        return true;
      });
      const bitacora = (await c.bitacora.listar(id))!;
      assert.equal(bitacora.incidente.estado, 'localizado');
      assert.equal(bitacora.entradas.filter((e) => e.tipo === 'cierre').length, 0);
    });

    it('un incidente inexistente da INCIDENTE_NO_ENCONTRADO', async (t) => {
      const c = await crearContexto(t);
      await assert.rejects(c.dao.cerrar(solicitud(INEXISTENTE, c.responsableA)), rechazo('INCIDENTE_NO_ENCONTRADO'));
    });

    it('el mismo comando devuelve el mismo informe con repetido=true y no escribe otra entrada', async (t) => {
      const c = await crearContexto(t);
      const id = await incidenteLocalizado(c);
      const s = solicitud(id, c.responsableA);
      const primero = await c.dao.cerrar(s);
      const segundo = await c.dao.cerrar(s);
      assert.equal(segundo.repetido, true);
      assert.equal(segundo.informe.id, primero.informe.id);
      assert.equal(segundo.informe.cerradoEn, primero.informe.cerradoEn);
      assert.equal((await c.bitacora.listar(id))!.entradas.filter((e) => e.tipo === 'cierre').length, 1);
    });

    it('el mismo comando con otros datos o con otro actor da OPERACION_YA_REGISTRADA', async (t) => {
      const c = await crearContexto(t);
      const id = await incidenteLocalizado(c);
      const s = solicitud(id, c.responsableA);
      await c.dao.cerrar(s);
      await assert.rejects(c.dao.cerrar({ ...s, resumen: 'Otro resumen' }), rechazo('OPERACION_YA_REGISTRADA'));
      await assert.rejects(c.dao.cerrar({ ...s, resultado: 'falsa_alarma' }), rechazo('OPERACION_YA_REGISTRADA'));
      await assert.rejects(c.dao.cerrar({ ...s, rescatistaId: c.rescatistaB }), rechazo('OPERACION_YA_REGISTRADA'));
    });

    it('otro comando sobre un incidente ya cerrado da INCIDENTE_CERRADO y no cambia el informe', async (t) => {
      const c = await crearContexto(t);
      const id = await incidenteLocalizado(c);
      const primero = await c.dao.cerrar(solicitud(id, c.responsableA, { resultado: 'evacuado' }));
      await assert.rejects(c.dao.cerrar(solicitud(id, c.responsableA, { resultado: 'falsa_alarma' })), rechazo('INCIDENTE_CERRADO'));
      const ultimo = await c.dao.ultimoCierreDeExpedicion(primero.informe.expedicionId);
      assert.equal(ultimo?.id, primero.informe.id);
      assert.equal(ultimo?.resultado, 'evacuado');
    });

    it('un comando ya usado como operación de una nota da OPERACION_YA_REGISTRADA y el incidente sigue localizado', async (t) => {
      const c = await crearContexto(t);
      const id = await incidenteLocalizado(c);
      const operacionId = nuevoId();
      await c.bitacora.agregar({ incidenteId: id, autorId: c.responsableA, texto: 'Una nota', corrigeEntradaId: null, operacionId });
      await assert.rejects(c.dao.cerrar(solicitud(id, c.responsableA, { comandoId: operacionId })), rechazo('OPERACION_YA_REGISTRADA'));
      const bitacora = (await c.bitacora.listar(id))!;
      assert.equal(bitacora.incidente.estado, 'localizado');
      assert.equal(bitacora.entradas.filter((e) => e.tipo === 'cierre').length, 0);
    });

    it('la bitácora se conserva: las entradas previas quedan idénticas y la de cierre va al final', async (t) => {
      const c = await crearContexto(t);
      const id = await incidenteLocalizado(c);
      for (const texto of ['Primera observación', 'Segunda observación']) {
        await c.bitacora.agregar({ incidenteId: id, autorId: c.responsableA, texto, corrigeEntradaId: null, operacionId: nuevoId() });
      }
      const antes = (await c.bitacora.listar(id))!.entradas;
      await c.dao.cerrar(solicitud(id, c.responsableA, { resumen: 'Cierre con bitácora' }));
      const despues = (await c.bitacora.listar(id))!.entradas;
      assert.equal(despues.length, antes.length + 1);
      assert.deepEqual(despues.slice(0, antes.length), antes);
      assert.equal(despues.at(-1)?.tipo, 'cierre');
      assert.equal(despues.at(-1)?.texto, 'Cierre con bitácora');
    });

    it('tras el cierre, agregar a la bitácora (HU-41) da INCIDENTE_CERRADO y la lectura sigue funcionando', async (t) => {
      const c = await crearContexto(t);
      const id = await incidenteLocalizado(c);
      await c.dao.cerrar(solicitud(id, c.responsableA));
      await assert.rejects(
        c.bitacora.agregar({ incidenteId: id, autorId: c.responsableA, texto: 'Tarde', corrigeEntradaId: null, operacionId: nuevoId() }),
        (e: unknown) => e instanceof ErrorBitacoraIncidente && e.codigo === 'INCIDENTE_CERRADO');
      assert.equal((await c.bitacora.listar(id))!.incidente.estado, 'cerrado');
    });

    it('CA-3: la expedición sigue en alerta tras el cierre (el cierre operativo no confirma el retorno)', async (t) => {
      const c = await crearContexto(t);
      const id = await incidenteLocalizado(c);
      const expedicion = await c.expedicionDe(id);
      assert.equal(await c.estadoExpedicion(expedicion), 'alerta');
      const { informe } = await c.dao.cerrar(solicitud(id, c.responsableA));
      assert.equal(await c.estadoExpedicion(expedicion), 'alerta');
      assert.equal(informe.estadoExpedicion, 'alerta');
      assert.equal((await c.dao.ultimoCierreDeExpedicion(expedicion))?.estadoExpedicion, 'alerta');
    });

    it('ultimoCierreDeExpedicion: null antes del cierre e informe después', async (t) => {
      const c = await crearContexto(t);
      const id = await incidenteLocalizado(c);
      const expedicion = await c.expedicionDe(id);
      assert.equal(await c.dao.ultimoCierreDeExpedicion(expedicion), null);
      assert.equal(await c.dao.ultimoCierreDeExpedicion(INEXISTENTE), null);
      const { informe } = await c.dao.cerrar(solicitud(id, c.responsableA, { resumen: 'Informe visible' }));
      const leido = await c.dao.ultimoCierreDeExpedicion(expedicion);
      assert.deepEqual(leido, informe);
    });

    it('relevo: A recibe NO_ES_RESPONSABLE (vigente B) y B cierra', async (t) => {
      const c = await crearContexto(t);
      const id = await incidenteLocalizado(c);
      await c.relevar(id, c.rescatistaB);
      await assert.rejects(c.dao.cerrar(solicitud(id, c.responsableA)), (e: unknown) => {
        rechazo('NO_ES_RESPONSABLE')(e);
        assert.equal((e as ErrorCierreIncidente).responsableVigente?.responsableId, c.rescatistaB);
        return true;
      });
      const { informe } = await c.dao.cerrar(solicitud(id, c.rescatistaB));
      assert.equal(informe.cerradoPorId, c.rescatistaB);
    });

    it('el reintento del mismo comando sobrevive a un relevo posterior al cierre', async (t) => {
      const c = await crearContexto(t);
      const id = await incidenteLocalizado(c);
      const s = solicitud(id, c.responsableA);
      const primero = await c.dao.cerrar(s);
      await c.relevar(id, c.rescatistaB);
      const reintento = await c.dao.cerrar(s);
      assert.equal(reintento.repetido, true);
      assert.equal(reintento.informe.id, primero.informe.id);
    });

    it('concurrencia: dos cierres simultáneos con comandos distintos dejan un único informe; el otro recibe INCIDENTE_CERRADO', async (t) => {
      const c = await crearContexto(t);
      const id = await incidenteLocalizado(c);
      const resultados = await Promise.allSettled([
        c.dao.cerrar(solicitud(id, c.responsableA, { resumen: 'Cierre uno' })),
        c.dao.cerrar(solicitud(id, c.responsableA, { resumen: 'Cierre dos' })),
      ]);
      const exitos = resultados.filter((r) => r.status === 'fulfilled');
      const fallos = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      assert.equal(exitos.length, 1, JSON.stringify(resultados.map((r) => r.status)));
      assert.equal(fallos.length, 1);
      rechazo('INCIDENTE_CERRADO')(fallos[0]!.reason);
      assert.equal((await c.bitacora.listar(id))!.entradas.filter((e) => e.tipo === 'cierre').length, 1);
    });
  });
}
