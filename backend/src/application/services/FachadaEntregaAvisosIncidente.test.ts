import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FachadaEntregaAvisosIncidente } from './FachadaEntregaAvisosIncidente.js';
import type { IRepositorioOutbox } from '../../domain/repositories/IRepositorioOutbox.js';
import type { MensajeOutbox, NuevoMensajeOutbox } from '../../domain/entities/OutboxNotificacion.js';
import type { RepositorioRescate } from '../../infrastructure/repositories/RepositorioRescate.js';

class MockRepositorioOutbox implements IRepositorioOutbox {
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
      proximoIntentoEn: new Date(),
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

  async obtenerParaProcesar(): Promise<MensajeOutbox[]> {
    return this.items;
  }
  async adquirirLease(): Promise<boolean> {
    return true;
  }
  async marcarEnviado(): Promise<void> {}
  async marcarReintento(): Promise<void> {}
  async marcarFallido(): Promise<void> {}
  async marcarIncierto(): Promise<void> {}
  async liberarLease(): Promise<void> {}

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

class MockRepositorioRescate {
  async verificarEsRescatista(id: string): Promise<void> {
    if (id === 'no-es-rescatista') {
      throw new Error('Perfil de rescatista requerido');
    }
  }
}

describe('HU-46: Revisar la entrega de avisos de un incidente (DoD y Criterios)', () => {
  let repoOutbox: MockRepositorioOutbox;
  let repoRescate: MockRepositorioRescate;
  let fachada: FachadaEntregaAvisosIncidente;

  const RESCATISTA_ID = 'resc-123';
  const EXPEDICION_ID = 'exp-456';

  beforeEach(() => {
    repoOutbox = new MockRepositorioOutbox();
    repoRescate = new MockRepositorioRescate();
    fachada = new FachadaEntregaAvisosIncidente(
      repoOutbox,
      repoRescate as unknown as RepositorioRescate,
    );
  });

  describe('CA-01 — Vista de despachos del incidente y estados reales', () => {
    it('muestra los despachos asociados con estados enviado, fallido e incierto clasificados', async () => {
      // 1. Mensaje Enviado
      repoOutbox.items.push({
        id: 'msg-1',
        tipoEvento: 'ALERTA_CONTACTO',
        destinatario: 'contacto@ejemplo.com',
        asunto: 'Alerta retorno',
        cuerpo: 'Texto',
        cuerpoHtml: '<p>Texto</p>',
        metadata: { expedicionId: EXPEDICION_ID },
        estado: 'enviado',
        intentos: 1,
        maxIntentos: 3,
        modoEnvio: 'brevo-api',
        ultimoError: null,
        proximoIntentoEn: new Date(),
        bloqueadoHasta: null,
        bloqueadoPor: null,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
        enviadoEn: new Date(),
      });

      // 2. Mensaje Fallido
      repoOutbox.items.push({
        id: 'msg-2',
        tipoEvento: 'ALERTA_RESCATE',
        destinatario: 'rescate@treksafe.pe',
        asunto: 'Alerta rescate',
        cuerpo: 'Texto',
        cuerpoHtml: '<p>Texto</p>',
        metadata: { expedicionId: EXPEDICION_ID },
        estado: 'fallido',
        intentos: 3,
        maxIntentos: 3,
        modoEnvio: 'brevo-api',
        ultimoError: 'Error 500 Brevo agotado',
        proximoIntentoEn: new Date(),
        bloqueadoHasta: null,
        bloqueadoPor: null,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
        enviadoEn: null,
      });

      // 3. Mensaje Incierto
      repoOutbox.items.push({
        id: 'msg-3',
        tipoEvento: 'ALERTA_CONTACTO',
        destinatario: 'otro@ejemplo.com',
        asunto: 'Alerta retorno',
        cuerpo: 'Texto',
        cuerpoHtml: '<p>Texto</p>',
        metadata: { expedicionId: EXPEDICION_ID },
        estado: 'incierto',
        intentos: 1,
        maxIntentos: 3,
        modoEnvio: 'brevo-api',
        ultimoError: 'Timeout de socket ambiguo',
        proximoIntentoEn: new Date(),
        bloqueadoHasta: null,
        bloqueadoPor: null,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
        enviadoEn: null,
      });

      const resumen = await fachada.consultarDespachosIncidente(RESCATISTA_ID, EXPEDICION_ID);

      assert.equal(resumen.totalDespachos, 3);
      assert.equal(resumen.enviados, 1);
      assert.equal(resumen.fallidos, 1);
      assert.equal(resumen.inciertos, 1);

      const dEnviado = resumen.despachos.find((d) => d.id === 'msg-1');
      assert.equal(dEnviado?.permiteReintentoManual, false);

      const dFallido = resumen.despachos.find((d) => d.id === 'msg-2');
      assert.equal(dFallido?.permiteReintentoManual, true);
    });
  });

  describe('CA-02 — Reintento manual idempotente solo para fallidos definitivos', () => {
    it('permite reintentar un aviso fallido y previene reenvíos con la misma clave de idempotencia', async () => {
      repoOutbox.items.push({
        id: 'msg-fallido',
        tipoEvento: 'ALERTA_CONTACTO',
        destinatario: 'contacto@ejemplo.com',
        asunto: 'Alerta',
        cuerpo: 'Texto',
        cuerpoHtml: '<p>Texto</p>',
        metadata: { expedicionId: EXPEDICION_ID },
        estado: 'fallido',
        intentos: 3,
        maxIntentos: 3,
        modoEnvio: null,
        ultimoError: null,
        proximoIntentoEn: new Date(),
        bloqueadoHasta: null,
        bloqueadoPor: null,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
        enviadoEn: null,
      });

      const res1 = await fachada.reintentarDespachoManual(
        RESCATISTA_ID,
        EXPEDICION_ID,
        'msg-fallido',
        'key-idempotencia-1',
      );

      assert.equal(res1.nuevoEstado, 'pendiente');
      assert.equal(repoOutbox.items[0].estado, 'pendiente');

      // Segunda llamada con la misma clave -> Devuelve respuesta idempotente sin error ni duplicar acción
      const res2 = await fachada.reintentarDespachoManual(
        RESCATISTA_ID,
        EXPEDICION_ID,
        'msg-fallido',
        'key-idempotencia-1',
      );

      assert.ok(res2.mensaje.includes('idempotente'));
    });

    it('bloquea terminantemente el reintento de avisos que ya fueron enviados exitosamente', async () => {
      repoOutbox.items.push({
        id: 'msg-ya-enviado',
        tipoEvento: 'ALERTA_CONTACTO',
        destinatario: 'contacto@ejemplo.com',
        asunto: 'Alerta',
        cuerpo: 'Texto',
        cuerpoHtml: '<p>Texto</p>',
        metadata: { expedicionId: EXPEDICION_ID },
        estado: 'enviado',
        intentos: 1,
        maxIntentos: 3,
        modoEnvio: null,
        ultimoError: null,
        proximoIntentoEn: new Date(),
        bloqueadoHasta: null,
        bloqueadoPor: null,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
        enviadoEn: new Date(),
      });

      await assert.rejects(
        () =>
          fachada.reintentarDespachoManual(
            RESCATISTA_ID,
            EXPEDICION_ID,
            'msg-ya-enviado',
          ),
        /AVISO_YA_ENVIADO|El aviso ya fue entregado exitosamente/,
      );
    });
  });

  describe('CA-03 — Inciertos requieren revisión y no se confunden con entregados', () => {
    it('bloquea el reintento manual directo de avisos en estado incierto hasta su revisión', async () => {
      repoOutbox.items.push({
        id: 'msg-incierto',
        tipoEvento: 'ALERTA_RESCATE',
        destinatario: 'rescate@treksafe.pe',
        asunto: 'Alerta',
        cuerpo: 'Texto',
        cuerpoHtml: '<p>Texto</p>',
        metadata: { expedicionId: EXPEDICION_ID },
        estado: 'incierto',
        intentos: 1,
        maxIntentos: 3,
        modoEnvio: null,
        ultimoError: 'Timeout de conexión',
        proximoIntentoEn: new Date(),
        bloqueadoHasta: null,
        bloqueadoPor: null,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
        enviadoEn: null,
      });

      await assert.rejects(
        () =>
          fachada.reintentarDespachoManual(
            RESCATISTA_ID,
            EXPEDICION_ID,
            'msg-incierto',
          ),
        /ESTADO_INCIERTO_REQUIERE_REVISION|estado incierto debido a una respuesta ambigua/,
      );
    });
  });
});
