import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ServicioBandejaAvisos,
  GeneradorAvisosEvento,
} from './servicioBandejaAvisos.js';
import type { Aviso } from '../../domain/entities/Aviso.js';
import type {
  CrearAvisoInput,
  INotificacionDAO,
} from '../../domain/repositories/INotificacionDAO.js';

class NotificacionDAOMemoria implements INotificacionDAO {
  public avisos: Aviso[] = [];

  async guardar(input: CrearAvisoInput): Promise<Aviso> {
    const ahora = new Date().toISOString();
    const aviso: Aviso = {
      id: `aviso-${this.avisos.length + 1}`,
      usuarioId: input.usuarioId,
      expedicionId: input.expedicionId ?? null,
      eventoId: input.eventoId,
      tipo: input.tipo,
      titulo: input.titulo,
      mensaje: input.mensaje,
      leido: false,
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    this.avisos.push(aviso);
    return aviso;
  }

  async buscarPorEvento(usuarioId: string, eventoId: string): Promise<Aviso | null> {
    return (
      this.avisos.find((a) => a.usuarioId === usuarioId && a.eventoId === eventoId) ?? null
    );
  }

  async listarPorUsuario(usuarioId: string, soloNoLeidos = false): Promise<Aviso[]> {
    return this.avisos.filter((a) => {
      if (a.usuarioId !== usuarioId) return false;
      if (soloNoLeidos && a.leido) return false;
      return true;
    });
  }

  async contarNoLeidos(usuarioId: string): Promise<number> {
    return this.avisos.filter((a) => a.usuarioId === usuarioId && !a.leido).length;
  }

  async marcarComoLeido(avisoId: string, usuarioId: string): Promise<Aviso> {
    const aviso = this.avisos.find((a) => a.id === avisoId && a.usuarioId === usuarioId);
    if (!aviso) throw new Error('Aviso no encontrado');
    aviso.leido = true;
    aviso.actualizadoEn = new Date().toISOString();
    return aviso;
  }

  async marcarTodosComoLeidos(usuarioId: string): Promise<number> {
    let count = 0;
    for (const a of this.avisos) {
      if (a.usuarioId === usuarioId && !a.leido) {
        a.leido = true;
        a.actualizadoEn = new Date().toISOString();
        count++;
      }
    }
    return count;
  }

  async eliminarPorUsuario(usuarioId: string): Promise<number> {
    const totalInicial = this.avisos.length;
    this.avisos = this.avisos.filter((a) => a.usuarioId !== usuarioId);
    return totalInicial - this.avisos.length;
  }
}

describe('HU-37: Bandeja de avisos in-app (DoD y Criterios de Aceptación)', () => {
  let dao: NotificacionDAOMemoria;
  let servicio: ServicioBandejaAvisos;
  let generador: GeneradorAvisosEvento;

  const SENDERISTA_1 = 'usr-senderista-001';
  const SENDERISTA_2 = 'usr-senderista-002';
  const EXPEDICION_ID = 'exp-123';

  beforeEach(() => {
    dao = new NotificacionDAOMemoria();
    servicio = new ServicioBandejaAvisos(dao);
    generador = new GeneradorAvisosEvento(servicio);
  });

  describe('CA-01 — Consulta de avisos (edición, cancelación, ampliación y recordatorio)', () => {
    it('muestra los cuatro tipos de avisos requeridos para el usuario correspondiente', async () => {
      await generador.generarDesdeEdicion(
        SENDERISTA_1,
        EXPEDICION_ID,
        'Hora estimada cambiada a 17:00 hrs',
        'evt-edicion-01',
      );
      await generador.generarDesdeAmpliacion(
        SENDERISTA_1,
        EXPEDICION_ID,
        '18:30 hrs (+30 min)',
        'evt-ampliacion-01',
      );
      await generador.generarDesdeRecordatorio(
        SENDERISTA_1,
        EXPEDICION_ID,
        30,
        'evt-recordatorio-01',
      );
      await generador.generarDesdeCancelacion(
        SENDERISTA_1,
        EXPEDICION_ID,
        'Condiciones climáticas desfavorables',
        'evt-cancelacion-01',
      );

      const listado = await servicio.listarAvisos(SENDERISTA_1);
      assert.equal(listado.length, 4);

      const tipos = listado.map((a) => a.tipo);
      assert.ok(tipos.includes('edicion'));
      assert.ok(tipos.includes('ampliacion'));
      assert.ok(tipos.includes('recordatorio'));
      assert.ok(tipos.includes('cancelacion'));

      const conteo = await servicio.contarNoLeidos(SENDERISTA_1);
      assert.equal(conteo.totalNoLeidos, 4);
    });
  });

  describe('CA-02 — Persistencia de lectura entre sesiones', () => {
    it('marcar un aviso como leído persiste el estado leido=true entre consultas', async () => {
      const aviso = await generador.generarDesdeEdicion(
        SENDERISTA_1,
        EXPEDICION_ID,
        'Edición de ruta',
        'evt-edicion-02',
      );
      assert.equal(aviso.leido, false);

      const actualizado = await servicio.marcarComoLeido(aviso.id, SENDERISTA_1);
      assert.equal(actualizado.leido, true);

      const listado = await servicio.listarAvisos(SENDERISTA_1);
      const guardado = listado.find((a) => a.id === aviso.id);
      assert.equal(guardado?.leido, true);

      const soloPendientes = await servicio.listarAvisos(SENDERISTA_1, true);
      assert.equal(soloPendientes.length, 0);
    });

    it('permite marcar todos los avisos como leídos en una sola operación', async () => {
      await generador.generarDesdeEdicion(SENDERISTA_1, EXPEDICION_ID, 'E1', 'evt-1');
      await generador.generarDesdeAmpliacion(SENDERISTA_1, EXPEDICION_ID, '19:00', 'evt-2');

      const res = await servicio.marcarTodosComoLeidos(SENDERISTA_1);
      assert.equal(res.actualizados, 2);

      const conteo = await servicio.contarNoLeidos(SENDERISTA_1);
      assert.equal(conteo.totalNoLeidos, 0);
    });
  });

  describe('CA-03 — Unicidad, evento_id obligatorio y aislamiento de usuario', () => {
    it('evita que el mismo evento cree avisos duplicados para el usuario (Idempotencia)', async () => {
      const a1 = await generador.generarDesdeEdicion(
        SENDERISTA_1,
        EXPEDICION_ID,
        'Primer cambio',
        'evt-unico-999',
      );
      const a2 = await generador.generarDesdeEdicion(
        SENDERISTA_1,
        EXPEDICION_ID,
        'Repetición del mismo evento',
        'evt-unico-999',
      );

      assert.equal(a1.id, a2.id);
      const listado = await servicio.listarAvisos(SENDERISTA_1);
      assert.equal(listado.length, 1);
    });

    it('los avisos pertenecen únicamente al destinatario y enlazan al plan autorizado', async () => {
      await generador.generarDesdeEdicion(SENDERISTA_1, EXPEDICION_ID, 'Msg S1', 'evt-s1');
      await generador.generarDesdeEdicion(SENDERISTA_2, EXPEDICION_ID, 'Msg S2', 'evt-s2');

      const avisosS1 = await servicio.listarAvisos(SENDERISTA_1);
      const avisosS2 = await servicio.listarAvisos(SENDERISTA_2);

      assert.equal(avisosS1.length, 1);
      assert.equal(avisosS2.length, 1);
      assert.equal(avisosS1[0].mensaje, 'Msg S1');
      assert.equal(avisosS2[0].mensaje, 'Msg S2');
    });

    it('elimina los avisos cuando el usuario solicita la revocación de sus datos (ARCO)', async () => {
      await generador.generarDesdeEdicion(SENDERISTA_1, EXPEDICION_ID, 'Aviso a borrar', 'evt-arco');
      assert.equal((await servicio.listarAvisos(SENDERISTA_1)).length, 1);

      const eliminados = await servicio.eliminarAvisosUsuario(SENDERISTA_1);
      assert.equal(eliminados, 1);
      assert.equal((await servicio.listarAvisos(SENDERISTA_1)).length, 0);
    });
  });
});
