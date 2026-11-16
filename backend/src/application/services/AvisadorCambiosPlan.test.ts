import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  AvisadorCambiosPlan,
  type EventoPlanPendiente,
  type IRepositorioEventosAvisos,
} from './AvisadorCambiosPlan.js';
import { GeneradorAvisosEvento, ServicioBandejaAvisos } from './servicioBandejaAvisos.js';
import type { Aviso } from '../../domain/entities/Aviso.js';
import type {
  CrearAvisoInput,
  INotificacionDAO,
} from '../../domain/repositories/INotificacionDAO.js';

class NotificacionDAOMemoria implements INotificacionDAO {
  public avisos: Aviso[] = [];
  public simularErrorEnGuardar = false;

  async guardar(input: CrearAvisoInput): Promise<Aviso> {
    if (this.simularErrorEnGuardar) {
      throw new Error('Fallo simulado de conexión con la base de datos de avisos');
    }
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
    return aviso;
  }

  async marcarTodosComoLeidos(usuarioId: string): Promise<number> {
    let count = 0;
    for (const a of this.avisos) {
      if (a.usuarioId === usuarioId && !a.leido) {
        a.leido = true;
        count++;
      }
    }
    return count;
  }

  async eliminarPorUsuario(usuarioId: string): Promise<number> {
    const prev = this.avisos.length;
    this.avisos = this.avisos.filter((a) => a.usuarioId !== usuarioId);
    return prev - this.avisos.length;
  }
}

class RepositorioEventosAvisosMemoria implements IRepositorioEventosAvisos {
  public eventos: EventoPlanPendiente[] = [];
  public operacionAEventoId: Map<string, string> = new Map();

  async buscarIdEventoPorOperacion(operacionId: string, _expedicionId: string): Promise<string | null> {
    return this.operacionAEventoId.get(operacionId) ?? null;
  }

  async buscarEventosPendientes(senderistaId?: string): Promise<EventoPlanPendiente[]> {
    if (!senderistaId) return [...this.eventos];
    return this.eventos.filter((e) => e.senderistaId === senderistaId);
  }
}

describe('HU-37: AvisadorCambiosPlan — Resiliencia y reconsumo durable (BE-07)', () => {
  let notificacionDAO: NotificacionDAOMemoria;
  let eventosRepo: RepositorioEventosAvisosMemoria;
  let servicioBandeja: ServicioBandejaAvisos;
  let generador: GeneradorAvisosEvento;
  let avisador: AvisadorCambiosPlan;

  const SENDERISTA_1 = 'senderista-uuid-001';
  const SENDERISTA_2 = 'senderista-uuid-002';
  const EXPEDICION_1 = 'expedicion-uuid-101';

  beforeEach(() => {
    notificacionDAO = new NotificacionDAOMemoria();
    eventosRepo = new RepositorioEventosAvisosMemoria();
    servicioBandeja = new ServicioBandejaAvisos(notificacionDAO);
    generador = new GeneradorAvisosEvento(servicioBandeja);
    avisador = new AvisadorCambiosPlan(eventosRepo, generador);
  });

  describe('Fallo post-RPC no interrumpe la mutación del senderista', () => {
    it('captura el fallo al avisar edición sin lanzar excepción al llamador', async () => {
      const opId = 'op-edicion-fail-1';
      eventosRepo.operacionAEventoId.set(opId, 'evt-edicion-1');
      notificacionDAO.simularErrorEnGuardar = true;

      await assert.doesNotReject(async () => {
        await avisador.avisarEdicion(SENDERISTA_1, EXPEDICION_1, opId);
      });

      assert.strictEqual(notificacionDAO.avisos.length, 0);
    });

    it('captura el fallo al avisar cancelación sin lanzar excepción al llamador', async () => {
      const opId = 'op-canc-fail-1';
      eventosRepo.operacionAEventoId.set(opId, 'evt-canc-1');
      notificacionDAO.simularErrorEnGuardar = true;

      await assert.doesNotReject(async () => {
        await avisador.avisarCancelacion(SENDERISTA_1, EXPEDICION_1, opId, 'Mal clima');
      });

      assert.strictEqual(notificacionDAO.avisos.length, 0);
    });

    it('captura el fallo al avisar ampliación sin lanzar excepción al llamador', async () => {
      const opId = 'op-amp-fail-1';
      eventosRepo.operacionAEventoId.set(opId, 'evt-amp-1');
      notificacionDAO.simularErrorEnGuardar = true;

      await assert.doesNotReject(async () => {
        await avisador.avisarAmpliacion(SENDERISTA_1, EXPEDICION_1, opId, '2026-11-10T18:00:00Z');
      });

      assert.strictEqual(notificacionDAO.avisos.length, 0);
    });
  });

  describe('Reconstrucción durable e idempotente de eventos pendientes', () => {
    it('reconstruye los eventos huérfanos de edición, cancelación y ampliación en avisos_usuario', async () => {
      eventosRepo.eventos = [
        {
          id: 'evt-edicion-huerfano',
          expedicionId: EXPEDICION_1,
          senderistaId: SENDERISTA_1,
          tipo: 'EDITADA',
        },
        {
          id: 'evt-cancelacion-huerfano',
          expedicionId: EXPEDICION_1,
          senderistaId: SENDERISTA_1,
          tipo: 'CANCELADA',
          motivo: 'Condiciones climáticas adversas',
        },
        {
          id: 'evt-ampliacion-huerfano',
          expedicionId: EXPEDICION_1,
          senderistaId: SENDERISTA_1,
          tipo: 'RETORNO_AMPLIADO',
          cambios: { horaRetornoEstimada: { antes: '15:00', despues: '18:00' } },
        },
      ];

      const creados = await avisador.reconstruirEventosPendientes(SENDERISTA_1);
      assert.strictEqual(creados, 3);

      const avisos = notificacionDAO.avisos;
      assert.strictEqual(avisos.length, 3);

      const avisoEdicion = avisos.find((a) => a.eventoId === 'evt-edicion-huerfano');
      assert.ok(avisoEdicion);
      assert.strictEqual(avisoEdicion.tipo, 'edicion');
      assert.strictEqual(avisoEdicion.usuarioId, SENDERISTA_1);

      const avisoCancelacion = avisos.find((a) => a.eventoId === 'evt-cancelacion-huerfano');
      assert.ok(avisoCancelacion);
      assert.strictEqual(avisoCancelacion.tipo, 'cancelacion');
      assert.ok(avisoCancelacion.mensaje.includes('Condiciones climáticas adversas'));

      const avisoAmpliacion = avisos.find((a) => a.eventoId === 'evt-ampliacion-huerfano');
      assert.ok(avisoAmpliacion);
      assert.strictEqual(avisoAmpliacion.tipo, 'ampliacion');
      assert.ok(avisoAmpliacion.mensaje.includes('18:00'));
    });

    it('es idempotente: una segunda ejecución no crea duplicados', async () => {
      eventosRepo.eventos = [
        {
          id: 'evt-edicion-idempotente',
          expedicionId: EXPEDICION_1,
          senderistaId: SENDERISTA_1,
          tipo: 'EDITADA',
        },
      ];

      const primeraVez = await avisador.reconstruirEventosPendientes(SENDERISTA_1);
      assert.strictEqual(primeraVez, 1);
      assert.strictEqual(notificacionDAO.avisos.length, 1);

      // Segunda ejecución
      const segundaVez = await avisador.reconstruirEventosPendientes(SENDERISTA_1);
      assert.strictEqual(segundaVez, 1); // proceso intentado
      assert.strictEqual(notificacionDAO.avisos.length, 1); // NO duplicó
    });

    it('respeta el aislamiento por usuario: solo reconstruye eventos del senderista solicitado', async () => {
      eventosRepo.eventos = [
        {
          id: 'evt-user-1',
          expedicionId: EXPEDICION_1,
          senderistaId: SENDERISTA_1,
          tipo: 'EDITADA',
        },
        {
          id: 'evt-user-2',
          expedicionId: 'exp-otra',
          senderistaId: SENDERISTA_2,
          tipo: 'CANCELADA',
        },
      ];

      const creados = await avisador.reconstruirEventosPendientes(SENDERISTA_1);
      assert.strictEqual(creados, 1);

      const avisos = notificacionDAO.avisos;
      assert.strictEqual(avisos.length, 1);
      assert.strictEqual(avisos[0].usuarioId, SENDERISTA_1);
      assert.strictEqual(avisos[0].eventoId, 'evt-user-1');
    });
  });
});
