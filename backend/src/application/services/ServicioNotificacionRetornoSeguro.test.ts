import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ServicioNotificacionRetornoSeguro } from './ServicioNotificacionRetornoSeguro.js';
import type { IRepositorioOutbox } from '../../domain/repositories/IRepositorioOutbox.js';
import type { MensajeOutbox, NuevoMensajeOutbox } from '../../domain/entities/OutboxNotificacion.js';
import type { RepositorioAlerta, ContextoAlertaExpedicion } from '../../infrastructure/repositories/RepositorioAlerta.js';
import type { RepositorioDespachoCorreo } from '../../infrastructure/repositories/RepositorioDespachoCorreo.js';

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
    return item;
  }
}

class MockRepositorioAlerta {
  public contextoMock: ContextoAlertaExpedicion | null = null;
  async buscarContextoAlerta(): Promise<ContextoAlertaExpedicion | null> {
    return this.contextoMock;
  }
}

class MockRepositorioDespacho {
  public despachados = new Set<string>();
  async yaFueEnviado(_expedicionId: string, _tipo: any, clave: string): Promise<boolean> {
    return this.despachados.has(clave.toLowerCase());
  }
  async registrarEnvio(_expedicionId: string, _tipo: any, clave: string): Promise<void> {
    this.despachados.add(clave.toLowerCase());
  }
}

describe('HU-44: Notificar el retorno seguro confirmado (DoD y Criterios)', () => {
  let repoOutbox: MockRepositorioOutbox;
  let repoAlerta: MockRepositorioAlerta;
  let repoDespacho: MockRepositorioDespacho;
  let servicio: ServicioNotificacionRetornoSeguro;

  beforeEach(() => {
    repoOutbox = new MockRepositorioOutbox();
    repoAlerta = new MockRepositorioAlerta();
    repoDespacho = new MockRepositorioDespacho();

    servicio = new ServicioNotificacionRetornoSeguro(
      repoOutbox,
      repoAlerta as unknown as RepositorioAlerta,
      repoDespacho as unknown as RepositorioDespachoCorreo,
    );
  });

  describe('CA-01 — Envío de aviso a contactos con ruta y hora de confirmación', () => {
    it('genera eventos en el outbox para cada contacto registrado con ruta y hora', async () => {
      repoAlerta.contextoMock = {
        expedicionId: 'exp-123',
        nombreCompletoSenderista: 'Renzo Farfán',
        lugarInicio: 'Huaraz Plaza',
        lugarFin: 'Laguna 69',
        coordenadasInicio: null,
        coordenadasFin: null,
        horaRetornoEstimada: '2026-11-03T18:00:00Z',
        minutosTolerancia: 30,
        fechaLimite: '2026-11-03T18:30:00Z',
        contactos: [
          {
            nombreCompleto: 'Mamá de Renzo',
            correoElectronico: 'mama@ejemplo.com',
            parentesco: 'Madre',
          },
          {
            nombreCompleto: 'Hermano de Renzo',
            correoElectronico: 'hermano@ejemplo.com',
            parentesco: 'Hermano',
          },
        ],
      };

      const resultado = await servicio.notificarRetornoSeguro(
        'exp-123',
        '2026-11-03T17:45:00Z',
        false,
      );

      assert.equal(resultado.contactosNotificados, 2);
      assert.equal(resultado.mensajesOutboxCreados, 2);
      assert.equal(repoOutbox.items.length, 2);

      const itemMama = repoOutbox.items.find((i) => i.destinatario === 'mama@ejemplo.com');
      assert.ok(itemMama);
      assert.equal(itemMama.tipoEvento, 'RETORNO_SEGURO_CONTACTO');
      assert.ok(itemMama.asunto.includes('Retorno seguro confirmado: Renzo Farfán'));
      assert.ok(itemMama.cuerpo.includes('Huaraz Plaza'));
      assert.ok(itemMama.cuerpo.includes('Laguna 69'));
    });
  });

  describe('CA-02 — Privacidad de datos de salud (Ley N° 29733 / HU-50)', () => {
    it('garantiza que el cuerpo del mensaje no incluye referencias ni campos de la ficha médica sensible', async () => {
      repoAlerta.contextoMock = {
        expedicionId: 'exp-123',
        nombreCompletoSenderista: 'Ariana Blanco',
        lugarInicio: 'Cusco',
        lugarFin: 'Ausangate',
        coordenadasInicio: null,
        coordenadasFin: null,
        horaRetornoEstimada: '2026-11-03T19:00:00Z',
        minutosTolerancia: 30,
        fechaLimite: '2026-11-03T19:30:00Z',
        contactos: [
          {
            nombreCompleto: 'Contacto Seguro',
            correoElectronico: 'contacto@seguro.pe',
            parentesco: 'Amigo',
          },
        ],
      };

      await servicio.notificarRetornoSeguro(
        'exp-123',
        '2026-11-03T19:15:00Z',
        false,
      );

      const mensaje = repoOutbox.items[0];
      // Verificamos ausencia de datos médicos o diagnósticos
      assert.ok(!mensaje.cuerpo.toLowerCase().includes('diagnóstico'));
      assert.ok(!mensaje.cuerpo.toLowerCase().includes('medicamento'));
      assert.ok(!mensaje.cuerpo.toLowerCase().includes('alergia'));
      assert.ok(!mensaje.cuerpo.toLowerCase().includes('ficha médica'));
      // Cumple cláusula explícita de Ley N° 29733
      assert.ok(mensaje.cuerpo.includes('Ley N° 29733'));
    });
  });

  describe('CA-03 — Actualización ante expedición previa en alerta y no duplicación lógica', () => {
    it('comunica la resolución de estado si la expedición se encontraba en alerta previa y no duplica destinatarios', async () => {
      repoAlerta.contextoMock = {
        expedicionId: 'exp-alerta',
        nombreCompletoSenderista: 'Favio Retorno',
        lugarInicio: 'Chosica',
        lugarFin: 'Matucana',
        coordenadasInicio: null,
        coordenadasFin: null,
        horaRetornoEstimada: '2026-11-03T16:00:00Z',
        minutosTolerancia: 30,
        fechaLimite: '2026-11-03T16:30:00Z',
        contactos: [
          {
            nombreCompleto: 'Contacto 1',
            correoElectronico: 'repetido@ejemplo.com',
            parentesco: 'Contacto 1',
          },
          {
            nombreCompleto: 'Contacto 1 Duplicado',
            correoElectronico: 'repetido@ejemplo.com',
            parentesco: 'Contacto 2',
          },
        ],
      };

      const resultado = await servicio.notificarRetornoSeguro(
        'exp-alerta',
        '2026-11-03T16:45:00Z',
        true, // era alerta previa
      );

      // Solo debe crear 1 mensaje outbox a pesar de venir duplicado el correo
      assert.equal(resultado.contactosNotificados, 1);
      assert.equal(resultado.mensajesOutboxCreados, 1);
      assert.ok(repoOutbox.items[0].cuerpo.includes('La expedición previa en alerta ha concluido con éxito'));
    });
  });
});
