import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { ErrorBitacoraIncidente } from '../domain/errors/ErrorBitacoraIncidente.js';
import type { IBitacoraIncidenteDAO, SolicitudEntradaBitacora } from '../domain/repositories/IBitacoraIncidenteDAO.js';

export type ContextoContratoBitacora = {
  dao: IBitacoraIncidenteDAO;
  responsableA: string;
  rescatistaB: string;
  /** Crea un incidente abierto cuyo responsable es `responsable` (por defecto, `responsableA`). */
  crearIncidente(responsable?: string): Promise<string>;
  /** Simula el relevo de HU-40: cambia el responsable y sube la versión. */
  relevar(incidenteId: string, nuevo: string): Promise<void>;
  marcarLocalizado(incidenteId: string): Promise<void>;
  /** Simula el cierre de HU-42: estado cerrado (las entradas se conservan). */
  cerrar(incidenteId: string): Promise<void>;
};

const INEXISTENTE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const nuevaOperacion = (): string => crypto.randomUUID();

const rechazo = (codigo: string) => (e: unknown) => {
  assert.ok(e instanceof ErrorBitacoraIncidente, `se esperaba ErrorBitacoraIncidente y llegó ${String(e)}`);
  assert.equal(e.codigo, codigo);
  return true;
};

/** Misma evidencia para cualquier implementación (LSP): memoria y PostgreSQL real (mediante puente). */
export function verificarContratoBitacoraIncidenteDAO(
  nombre: string,
  crearContexto: (t: TestContext) => ContextoContratoBitacora | Promise<ContextoContratoBitacora>,
): void {
  describe(nombre, () => {
    const solicitud = (
      incidenteId: string,
      autorId: string,
      texto: string,
      extra: Partial<SolicitudEntradaBitacora> = {},
    ): SolicitudEntradaBitacora => ({
      incidenteId,
      autorId,
      texto,
      corrigeEntradaId: null,
      operacionId: nuevaOperacion(),
      ...extra,
    });

    it('un incidente inexistente da null; uno sin entradas da entradas [] con el resumen correcto', async (t) => {
      const c = await crearContexto(t);
      assert.equal(await c.dao.listar(INEXISTENTE), null);
      const id = await c.crearIncidente();
      const bitacora = await c.dao.listar(id);
      assert.ok(bitacora);
      assert.deepEqual(bitacora.entradas, []);
      assert.equal(bitacora.incidente.id, id);
      assert.equal(bitacora.incidente.estado, 'abierto');
      assert.equal(bitacora.incidente.responsableId, c.responsableA);
      assert.ok(bitacora.incidente.nombreResponsable.length > 0);
    });

    it('el responsable añade una nota con autor, tipo nota, texto recortado y hora ISO', async (t) => {
      const c = await crearContexto(t);
      const id = await c.crearIncidente();
      const { entrada, repetido } = await c.dao.agregar(solicitud(id, c.responsableA, '  Llegamos al punto  '));
      assert.equal(repetido, false);
      assert.equal(entrada.tipo, 'nota');
      assert.equal(entrada.texto, 'Llegamos al punto');
      assert.equal(entrada.autorId, c.responsableA);
      assert.equal(entrada.incidenteId, id);
      assert.equal(entrada.corrigeEntradaId, null);
      assert.equal(new Date(entrada.registradaEn).toISOString(), entrada.registradaEn);
      assert.ok(entrada.nombreAutor.length > 0);
    });

    it('conservación: la lista es igual a las entradas devueltas al crearlas, en ese orden', async (t) => {
      const c = await crearContexto(t);
      const id = await c.crearIncidente();
      const creadas = [];
      for (const texto of ['Primera', 'Segunda', 'Tercera']) {
        creadas.push((await c.dao.agregar(solicitud(id, c.responsableA, texto))).entrada);
      }
      const bitacora = await c.dao.listar(id);
      assert.deepEqual(bitacora?.entradas, creadas);
    });

    it('orden estable: dos lecturas iguales y registradaEn no decreciente', async (t) => {
      const c = await crearContexto(t);
      const id = await c.crearIncidente();
      for (const texto of ['uno', 'dos', 'tres', 'cuatro']) await c.dao.agregar(solicitud(id, c.responsableA, texto));
      const a = await c.dao.listar(id);
      const b = await c.dao.listar(id);
      assert.deepEqual(a, b);
      const horas = (a?.entradas ?? []).map((e) => e.registradaEn);
      assert.deepEqual(horas, [...horas].sort());
    });

    it('corrección válida con la original intacta; de otro incidente o inexistente da CORRECCION_INVALIDA', async (t) => {
      const c = await crearContexto(t);
      const id = await c.crearIncidente();
      const otro = await c.crearIncidente();
      const original = (await c.dao.agregar(solicitud(id, c.responsableA, 'Dato equivocado'))).entrada;
      const ajena = (await c.dao.agregar(solicitud(otro, c.responsableA, 'De otro incidente'))).entrada;

      const { entrada } = await c.dao.agregar(
        solicitud(id, c.responsableA, 'Dato corregido', { corrigeEntradaId: original.id }),
      );
      assert.equal(entrada.tipo, 'correccion');
      assert.equal(entrada.corrigeEntradaId, original.id);
      const lista = (await c.dao.listar(id))?.entradas ?? [];
      assert.deepEqual(lista.find((e) => e.id === original.id), original);
      assert.equal(lista.length, 2);

      await assert.rejects(
        c.dao.agregar(solicitud(id, c.responsableA, 'Cruzada', { corrigeEntradaId: ajena.id })),
        rechazo('CORRECCION_INVALIDA'),
      );
      await assert.rejects(
        c.dao.agregar(solicitud(id, c.responsableA, 'Inexistente', { corrigeEntradaId: INEXISTENTE })),
        rechazo('CORRECCION_INVALIDA'),
      );
      assert.equal(((await c.dao.listar(id))?.entradas ?? []).length, 2);
    });

    it('quien no es el responsable recibe NO_ES_RESPONSABLE con el vigente y no escribe', async (t) => {
      const c = await crearContexto(t);
      const id = await c.crearIncidente();
      await assert.rejects(c.dao.agregar(solicitud(id, c.rescatistaB, 'No me toca')), (e: unknown) => {
        rechazo('NO_ES_RESPONSABLE')(e);
        assert.equal((e as ErrorBitacoraIncidente).responsableVigente?.responsableId, c.responsableA);
        assert.ok((e as ErrorBitacoraIncidente).responsableVigente?.nombreResponsable);
        return true;
      });
      assert.deepEqual((await c.dao.listar(id))?.entradas, []);
    });

    it('transferencia tras el relevo: A pierde el permiso, B lo gana y las entradas de A conservan su autor', async (t) => {
      const c = await crearContexto(t);
      const id = await c.crearIncidente();
      const deA = (await c.dao.agregar(solicitud(id, c.responsableA, 'Antes del relevo'))).entrada;
      await c.relevar(id, c.rescatistaB);
      await assert.rejects(c.dao.agregar(solicitud(id, c.responsableA, 'Después del relevo')), (e: unknown) => {
        rechazo('NO_ES_RESPONSABLE')(e);
        assert.equal((e as ErrorBitacoraIncidente).responsableVigente?.responsableId, c.rescatistaB);
        return true;
      });
      const deB = (await c.dao.agregar(solicitud(id, c.rescatistaB, 'Yo coordino ahora'))).entrada;
      const lista = (await c.dao.listar(id))?.entradas ?? [];
      assert.deepEqual(lista.map((e) => e.autorId), [c.responsableA, c.rescatistaB]);
      assert.deepEqual(lista[0], deA);
      assert.deepEqual(lista[1], deB);
    });

    it('localizado admite entradas; cerrado da INCIDENTE_CERRADO y la lectura sigue devolviendo todo', async (t) => {
      const c = await crearContexto(t);
      const id = await c.crearIncidente();
      await c.marcarLocalizado(id);
      await c.dao.agregar(solicitud(id, c.responsableA, 'Persona localizada'));
      await c.cerrar(id);
      await assert.rejects(c.dao.agregar(solicitud(id, c.responsableA, 'Tarde')), rechazo('INCIDENTE_CERRADO'));
      const bitacora = await c.dao.listar(id);
      assert.equal(bitacora?.incidente.estado, 'cerrado');
      assert.equal(bitacora?.entradas.length, 1);
    });

    it('un incidente inexistente da INCIDENTE_NO_ENCONTRADO; texto vacío o de más de 2000 da DATOS_INVALIDOS', async (t) => {
      const c = await crearContexto(t);
      await assert.rejects(c.dao.agregar(solicitud(INEXISTENTE, c.responsableA, 'x')), rechazo('INCIDENTE_NO_ENCONTRADO'));
      const id = await c.crearIncidente();
      await assert.rejects(c.dao.agregar(solicitud(id, c.responsableA, '   ')), rechazo('DATOS_INVALIDOS'));
      await assert.rejects(c.dao.agregar(solicitud(id, c.responsableA, 'a'.repeat(2001))), rechazo('DATOS_INVALIDOS'));
      const { entrada } = await c.dao.agregar(solicitud(id, c.responsableA, 'a'.repeat(2000)));
      assert.equal(entrada.texto.length, 2000);
    });

    it('idempotencia: mismo contenido da repetido=true con el mismo id; otro texto da OPERACION_YA_REGISTRADA; sobrevive al relevo', async (t) => {
      const c = await crearContexto(t);
      const id = await c.crearIncidente();
      const pedido = solicitud(id, c.responsableA, 'Una sola vez');
      const primera = await c.dao.agregar(pedido);
      const segunda = await c.dao.agregar(pedido);
      assert.equal(primera.repetido, false);
      assert.equal(segunda.repetido, true);
      assert.equal(segunda.entrada.id, primera.entrada.id);
      assert.equal((await c.dao.listar(id))?.entradas.length, 1);
      await assert.rejects(
        c.dao.agregar({ ...pedido, texto: 'Otro texto' }),
        rechazo('OPERACION_YA_REGISTRADA'),
      );
      await c.relevar(id, c.rescatistaB);
      const tras = await c.dao.agregar(pedido);
      assert.equal(tras.repetido, true);
      assert.equal(tras.entrada.id, primera.entrada.id);
      assert.equal((await c.dao.listar(id))?.entradas.length, 1);
    });

    it('concurrencia: 10 escrituras simultáneas dan 10 ids distintos y el mismo operacionId a la vez deja una sola entrada', async (t) => {
      const c = await crearContexto(t);
      const id = await c.crearIncidente();
      const resultados = await Promise.all(
        Array.from({ length: 10 }, (_, i) => c.dao.agregar(solicitud(id, c.responsableA, `Escritura ${i}`))),
      );
      assert.equal(new Set(resultados.map((r) => r.entrada.id)).size, 10);

      const otro = await c.crearIncidente();
      const pedido = solicitud(otro, c.responsableA, 'Simultánea');
      const [x, y] = await Promise.all([c.dao.agregar(pedido), c.dao.agregar(pedido)]);
      assert.equal(x.entrada.id, y.entrada.id);
      assert.equal([x, y].filter((r) => r.repetido === false).length, 1);
      assert.equal([x, y].filter((r) => r.repetido === true).length, 1);
      assert.equal((await c.dao.listar(otro))?.entradas.length, 1);
    });

    it('mutar el resultado no altera la siguiente lectura', async (t) => {
      const c = await crearContexto(t);
      const id = await c.crearIncidente();
      await c.dao.agregar(solicitud(id, c.responsableA, 'Intocable'));
      const primera = await c.dao.listar(id);
      try {
        (primera?.entradas as unknown as unknown[]).push({ id: 'falsa' });
        (primera?.entradas[0] as { texto: string }).texto = 'manipulado';
      } catch {
        // Las copias congeladas lanzan TypeError: también es válido.
      }
      const segunda = await c.dao.listar(id);
      assert.equal(segunda?.entradas.length, 1);
      assert.equal(segunda?.entradas[0]?.texto, 'Intocable');
    });

    it('la interfaz no expone actualizar, eliminar, borrar, modificar ni upsert', async (t) => {
      const c = await crearContexto(t);
      for (const metodo of ['actualizar', 'eliminar', 'borrar', 'modificar', 'upsert']) {
        assert.equal((c.dao as unknown as Record<string, unknown>)[metodo], undefined, metodo);
      }
    });
  });
}
