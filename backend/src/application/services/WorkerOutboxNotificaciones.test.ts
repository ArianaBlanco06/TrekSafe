import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  WorkerOutboxNotificaciones,
} from './WorkerOutboxNotificaciones.js';
import type { IRepositorioOutbox } from '../../domain/repositories/IRepositorioOutbox.js';
import type { ITransporteCorreo, DatosEnvioCorreo } from '../../domain/services/ITransporteCorreo.js';
import type { MensajeOutbox, NuevoMensajeOutbox, ResultadoEnvioTransporte } from '../../domain/entities/OutboxNotificacion.js';
import type { IReloj } from '../../domain/services/IReloj.js';

class RelojControlado implements IReloj {
  constructor(private tiempoActual: Date) {}
  ahora(): Date {
    return new Date(this.tiempoActual);
  }
  avanzarMs(ms: number): void {
    this.tiempoActual = new Date(this.tiempoActual.getTime() + ms);
  }
}

class RepositorioOutboxMemoria implements IRepositorioOutbox {
  public items: MensajeOutbox[] = [];

  async guardar(mensaje: NuevoMensajeOutbox): Promise<MensajeOutbox> {
    const item: MensajeOutbox = {
      id: `outbox-${this.items.length + 1}`,
      tipoEvento: mensaje.tipoEvento,
      destinatario: mensaje.destinatario,
      asunto: mensaje.asunto,
      cuerpo: mensaje.cuerpo,
      cuerpoHtml: mensaje.cuerpoHtml,
      metadata: mensaje.metadata,
      estado: 'pendiente',
      intentos: 0,
      maxIntentos: mensaje.maxIntentos ?? 3,
      proximoIntentoEn: new Date(0),
      bloqueadoHasta: null,
      bloqueadoPor: null,
      ultimoError: null,
      modoEnvio: null,
      creadoEn: new Date(),
      actualizadoEn: new Date(),
      enviadoEn: null,
    };
    this.items.push(item);
    return item;
  }

  async obtenerParaProcesar(ahora: Date, limite = 10): Promise<MensajeOutbox[]> {
    return this.items
      .filter((i) => {
        if (i.estado !== 'pendiente') return false;
        if (i.proximoIntentoEn.getTime() > ahora.getTime()) return false;
        if (i.bloqueadoHasta && i.bloqueadoHasta.getTime() >= ahora.getTime()) return false;
        return true;
      })
      .slice(0, limite);
  }

  async adquirirLease(id: string, workerId: string, duracionMs: number, ahora: Date): Promise<boolean> {
    const item = this.items.find((i) => i.id === id);
    if (!item || item.estado !== 'pendiente') return false;
    if (item.bloqueadoHasta && item.bloqueadoHasta.getTime() >= ahora.getTime()) {
      return false; // Ya bloqueado por otro worker
    }
    item.bloqueadoHasta = new Date(ahora.getTime() + duracionMs);
    item.bloqueadoPor = workerId;
    return true;
  }

  async marcarEnviado(id: string, modoEnvio: string, fechaEnvio: Date): Promise<void> {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.estado = 'enviado';
      item.modoEnvio = modoEnvio;
      item.enviadoEn = fechaEnvio;
      item.bloqueadoHasta = null;
      item.bloqueadoPor = null;
    }
  }

  async marcarReintento(
    id: string,
    proximoIntento: Date,
    intentosActuales: number,
    ultimoError: string,
  ): Promise<void> {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.intentos = intentosActuales;
      item.proximoIntentoEn = proximoIntento;
      item.ultimoError = ultimoError;
      item.bloqueadoHasta = null;
      item.bloqueadoPor = null;
    }
  }

  async marcarFallido(id: string, intentosActuales: number, errorFinal: string): Promise<void> {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.estado = 'fallido';
      item.intentos = intentosActuales;
      item.ultimoError = errorFinal;
      item.bloqueadoHasta = null;
      item.bloqueadoPor = null;
    }
  }

  async marcarIncierto(id: string, intentosActuales: number, motivoIncierto: string): Promise<void> {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.estado = 'incierto';
      item.intentos = intentosActuales;
      item.ultimoError = motivoIncierto;
      item.bloqueadoHasta = null;
      item.bloqueadoPor = null;
    }
  }

  async liberarLease(id: string): Promise<void> {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.bloqueadoHasta = null;
      item.bloqueadoPor = null;
    }
  }

  async buscarPorId(id: string): Promise<MensajeOutbox | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }

  async listarPorExpedicion(expedicionId: string): Promise<MensajeOutbox[]> {
    return this.items.filter((i) => i.metadata?.expedicionId === expedicionId);
  }

  async reencolarParaReintentoManual(id: string): Promise<MensajeOutbox> {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw new Error('Not found');
    item.estado = 'pendiente';
    item.proximoIntentoEn = new Date();
    return item;
  }
}

class TransporteSustituto implements ITransporteCorreo {
  public respuestasProgramadas: ResultadoEnvioTransporte[] = [];
  public enviosRealizados: DatosEnvioCorreo[] = [];

  obtenerModo(): 'brevo-api' | 'smtp' | 'dev-log' {
    return 'brevo-api';
  }

  async enviar(datos: DatosEnvioCorreo): Promise<ResultadoEnvioTransporte> {
    this.enviosRealizados.push(datos);
    if (this.respuestasProgramadas.length > 0) {
      return this.respuestasProgramadas.shift()!;
    }
    return { estado: 'enviado', modo: 'brevo-api' };
  }
}

describe('HU-45: Reintentar avisos fallidos sin perder su seguimiento (DoD y Criterios)', () => {
  let repo: RepositorioOutboxMemoria;
  let transporte: TransporteSustituto;
  let reloj: RelojControlado;
  let worker: WorkerOutboxNotificaciones;

  beforeEach(() => {
    repo = new RepositorioOutboxMemoria();
    transporte = new TransporteSustituto();
    reloj = new RelojControlado(new Date('2026-11-03T10:00:00Z'));
    worker = new WorkerOutboxNotificaciones(repo, transporte, { reloj });
  });

  describe('CA-01 — Conservación en outbox y reintentos crecientes (1 min, 5 min) hasta éxito', () => {
    it('persiste el aviso en outbox y espera incrementalmente ante rechazo confirmado', async () => {
      // 1. Guardar mensaje en outbox
      await repo.guardar({
        tipoEvento: 'ALERTA_CONTACTO',
        destinatario: 'contacto@ejemplo.com',
        asunto: 'Alerta de retorno',
        cuerpo: 'El senderista aún no confirma retorno.',
      });

      // Programar que el 1er intento falle temporalmente
      transporte.respuestasProgramadas = [
        { estado: 'fallido', modo: 'brevo-api', error: 'Error 500 Brevo' },
        { estado: 'enviado', modo: 'brevo-api' },
      ];

      // Primer procesamiento -> Debe fallar y programar reintento a +1 minuto (60_000ms)
      const res1 = await worker.procesarLote('worker-1');
      assert.equal(res1.procesados, 1);
      assert.equal(res1.reintentados, 1);
      assert.equal(repo.items[0].estado, 'pendiente');
      assert.equal(repo.items[0].intentos, 1);
      assert.equal(
        repo.items[0].proximoIntentoEn.getTime(),
        reloj.ahora().getTime() + 60 * 1000,
      );

      // Si intentamos procesar inmediatamente antes de que pase el minuto, no debe procesarlo
      const resInmediato = await worker.procesarLote('worker-1');
      assert.equal(resInmediato.procesados, 0);

      // Avanzamos el reloj 61 segundos
      reloj.avanzarMs(61 * 1000);

      // Segundo procesamiento -> Debe tener éxito
      const res2 = await worker.procesarLote('worker-1');
      assert.equal(res2.procesados, 1);
      assert.equal(res2.exitosos, 1);
      assert.equal(repo.items[0].estado, 'enviado');
      assert.equal(repo.items[0].modoEnvio, 'brevo-api');
    });
  });

  describe('CA-02 — Hasta 3 intentos totales ante rechazo confirmado, quedando marcado como fallido', () => {
    it('realiza hasta 3 intentos totales con espera creciente y marca fallido definitivo sin repetir', async () => {
      await repo.guardar({
        tipoEvento: 'ALERTA_RESCATE',
        destinatario: 'rescate@treksafe.pe',
        asunto: 'Incidente de rescate',
        cuerpo: 'Coordenadas del incidente',
        maxIntentos: 3,
      });

      transporte.respuestasProgramadas = [
        { estado: 'fallido', modo: 'brevo-api', error: 'Rechazo 1' },
        { estado: 'fallido', modo: 'brevo-api', error: 'Rechazo 2' },
        { estado: 'fallido', modo: 'brevo-api', error: 'Rechazo 3' },
      ];

      // Intento 1
      await worker.procesarLote('worker-1');
      assert.equal(repo.items[0].intentos, 1);
      assert.equal(repo.items[0].estado, 'pendiente');

      // Avanzamos reloj para Intento 2 (espera 1 min)
      reloj.avanzarMs(61 * 1000);
      await worker.procesarLote('worker-1');
      assert.equal(repo.items[0].intentos, 2);
      assert.equal(repo.items[0].estado, 'pendiente');

      // Avanzamos reloj para Intento 3 (espera 5 min)
      reloj.avanzarMs(5 * 60 * 1000 + 1000);
      await worker.procesarLote('worker-1');

      // Al agotar el 3er intento debe quedar como 'fallido' definitivo
      assert.equal(repo.items[0].intentos, 3);
      assert.equal(repo.items[0].estado, 'fallido');
      assert.equal(repo.items[0].ultimoError, 'Rechazo 3');
    });
  });

  describe('CA-03 — Timeout o respuesta ambigua queda clasificado como incierto', () => {
    it('marca estado incierto ante timeout ambiguo y no cuenta como entregado', async () => {
      await repo.guardar({
        tipoEvento: 'ALERTA_CONTACTO',
        destinatario: 'familia@treksafe.pe',
        asunto: 'Aviso urgente',
        cuerpo: 'Mensaje con timeout',
      });

      transporte.respuestasProgramadas = [
        { estado: 'incierto', modo: 'brevo-api', error: 'Timeout de socket con Brevo' },
      ];

      const res = await worker.procesarLote('worker-1');
      assert.equal(res.inciertos, 1);
      assert.equal(repo.items[0].estado, 'incierto');
      assert.ok(repo.items[0].ultimoError?.includes('Timeout de socket'));
      assert.equal(repo.items[0].enviadoEn, null);
    });
  });

  describe('Concurrencia y Lease distribuido', () => {
    it('dos workers concurrentes con lease en base de datos no reclaman el mismo registro', async () => {
      await repo.guardar({
        tipoEvento: 'AVISO_SENDERISTA',
        destinatario: 'senderista@treksafe.pe',
        asunto: 'Recordatorio',
        cuerpo: 'Retorno próximo',
      });

      // Simulamos que worker-1 adquiere el lease
      const lease1 = await repo.adquirirLease(repo.items[0].id, 'worker-1', 5 * 60 * 1000, reloj.ahora());
      assert.equal(lease1, true);

      // worker-2 intenta adquirir el lease sobre el mismo registro antes de que expire
      const lease2 = await repo.adquirirLease(repo.items[0].id, 'worker-2', 5 * 60 * 1000, reloj.ahora());
      assert.equal(lease2, false);

      // worker-2 no lo obtiene para procesar
      const pendientesWorker2 = await repo.obtenerParaProcesar(reloj.ahora());
      assert.equal(pendientesWorker2.length, 0);
    });
  });
});
