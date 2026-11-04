import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { calcularFechaLimite } from '../../domain/entities/Expedicion.js';
import {
  FabricaReglaRecordatorio,
  type IReloj,
  ReglaRecordatorio15Min,
  ReglaRecordatorio30Min,
  ReglaRecordatorio60Min,
  UMBRAL_RECORDATORIO_POR_DEFECTO,
} from '../../domain/strategies/IReglaRecordatorio.js';
import type {
  CrearAvisoInput,
  INotificacionDAO,
} from '../../domain/repositories/INotificacionDAO.js';
import type { Aviso } from '../../domain/entities/Aviso.js';
import { ServicioBandejaAvisos } from './servicioBandejaAvisos.js';
import { ServicioRecordatorioExpedicion } from './servicioRecordatorioExpedicion.js';
import type { RepositorioExpedicion } from '../../infrastructure/repositories/RepositorioExpedicion.js';

class RelojControlado implements IReloj {
  constructor(private momentoActual: Date) {}

  ahora(): Date {
    return new Date(this.momentoActual);
  }

  avanzarMinutos(minutos: number): void {
    this.momentoActual = new Date(this.momentoActual.getTime() + minutos * 60_000);
  }

  fijar(nuevaFecha: Date): void {
    this.momentoActual = new Date(nuevaFecha);
  }
}

class NotificacionDAOMemoria implements INotificacionDAO {
  private avisos: Aviso[] = [];
  private contador = 1;

  async crear(datos: CrearAvisoInput): Promise<Aviso> {
    const nuevo: Aviso = {
      id: `aviso-${this.contador++}`,
      usuarioId: datos.usuarioId,
      expedicionId: datos.expedicionId ?? null,
      eventoId: datos.eventoId ?? null,
      tipo: datos.tipo,
      titulo: datos.titulo,
      mensaje: datos.mensaje,
      leido: false,
      creadoEn: new Date().toISOString(),
    };
    this.avisos.push(nuevo);
    return nuevo;
  }

  async listarPorUsuario(usuarioId: string): Promise<Aviso[]> {
    return this.avisos.filter((a) => a.usuarioId === usuarioId);
  }

  async contarNoLeidos(usuarioId: string): Promise<number> {
    return this.avisos.filter((a) => a.usuarioId === usuarioId && !a.leido).length;
  }

  async marcarComoLeido(id: string, usuarioId: string): Promise<boolean> {
    const a = this.avisos.find((av) => av.id === id && av.usuarioId === usuarioId);
    if (!a) return false;
    a.leido = true;
    return true;
  }

  async marcarTodosComoLeidos(usuarioId: string): Promise<number> {
    let cant = 0;
    for (const a of this.avisos) {
      if (a.usuarioId === usuarioId && !a.leido) {
        a.leido = true;
        cant++;
      }
    }
    return cant;
  }

  async obtenerPorId(id: string, usuarioId: string): Promise<Aviso | null> {
    const a = this.avisos.find((av) => av.id === id && av.usuarioId === usuarioId);
    return a ? { ...a } : null;
  }

  async obtenerPorEventoId(usuarioId: string, eventoId: string): Promise<Aviso | null> {
    const a = this.avisos.find(
      (av) => av.usuarioId === usuarioId && av.eventoId === eventoId,
    );
    return a ? { ...a } : null;
  }
}

describe('HU-38: Configurar la anticipación del recordatorio (DoD y Criterios)', () => {
  describe('CA-01 — Configuración del recordatorio (Patrón Strategy y Valor Inicial)', () => {
    it('permite elegir estrategias de 15, 30 y 60 minutos con contrato común', () => {
      const regla15 = FabricaReglaRecordatorio.obtener(15);
      const regla30 = FabricaReglaRecordatorio.obtener(30);
      const regla60 = FabricaReglaRecordatorio.obtener(60);

      assert.ok(regla15 instanceof ReglaRecordatorio15Min);
      assert.equal(regla15.minutosAnticipacion, 15);

      assert.ok(regla30 instanceof ReglaRecordatorio30Min);
      assert.equal(regla30.minutosAnticipacion, 30);

      assert.ok(regla60 instanceof ReglaRecordatorio60Min);
      assert.equal(regla60.minutosAnticipacion, 60);
    });

    it('conserva 30 minutos como valor inicial y predeterminado ante valores nulos o no declarados', () => {
      assert.equal(UMBRAL_RECORDATORIO_POR_DEFECTO, 30);

      const reglaDefault1 = FabricaReglaRecordatorio.obtener(undefined);
      const reglaDefault2 = FabricaReglaRecordatorio.obtener(null);
      const reglaDefault3 = FabricaReglaRecordatorio.obtener(999); // Valor inválido

      assert.equal(reglaDefault1.minutosAnticipacion, 30);
      assert.equal(reglaDefault2.minutosAnticipacion, 30);
      assert.equal(reglaDefault3.minutosAnticipacion, 30);
    });
  });

  describe('CA-02 — Generación del aviso con reloj inyectado y sin duplicación', () => {
    let dao: NotificacionDAOMemoria;
    let servicioBandeja: ServicioBandejaAvisos;

    beforeEach(() => {
      dao = new NotificacionDAOMemoria();
      servicioBandeja = new ServicioBandejaAvisos(dao);
    });

    it('evalúa con reloj inyectado el momento exacto de emisión para los tres umbrales', () => {
      const horaRetorno = new Date('2026-11-03T18:00:00.000Z');
      const reloj = new RelojControlado(new Date('2026-11-03T16:50:00.000Z')); // 70 min antes

      const regla60 = FabricaReglaRecordatorio.obtener(60);
      const regla30 = FabricaReglaRecordatorio.obtener(30);
      const regla15 = FabricaReglaRecordatorio.obtener(15);

      // A 70 min antes: ninguno debe notificar
      assert.equal(regla60.correspondeAvisar(horaRetorno, reloj), false);
      assert.equal(regla30.correspondeAvisar(horaRetorno, reloj), false);
      assert.equal(regla15.correspondeAvisar(horaRetorno, reloj), false);

      // A 60 min antes (17:00:00Z): regla de 60 min se activa
      reloj.fijar(new Date('2026-11-03T17:00:00.000Z'));
      assert.equal(regla60.correspondeAvisar(horaRetorno, reloj), true);
      assert.equal(regla30.correspondeAvisar(horaRetorno, reloj), false);
      assert.equal(regla15.correspondeAvisar(horaRetorno, reloj), false);

      // A 30 min antes (17:30:00Z): regla de 30 min se activa
      reloj.fijar(new Date('2026-11-03T17:30:00.000Z'));
      assert.equal(regla30.correspondeAvisar(horaRetorno, reloj), true);
      assert.equal(regla15.correspondeAvisar(horaRetorno, reloj), false);

      // A 15 min antes (17:45:00Z): regla de 15 min se activa
      reloj.fijar(new Date('2026-11-03T17:45:00.000Z'));
      assert.equal(regla15.correspondeAvisar(horaRetorno, reloj), true);

      // Pasada la hora de retorno (18:01:00Z): las reglas preventivas ya no aplican
      reloj.fijar(new Date('2026-11-03T18:01:00.000Z'));
      assert.equal(regla15.correspondeAvisar(horaRetorno, reloj), false);
    });

    it('genera exactamente un aviso por expedición y umbral y evita duplicados en ticks posteriores', async () => {
      const horaRetorno = '2026-11-03T18:00:00.000Z';
      const reloj = new RelojControlado(new Date('2026-11-03T17:30:00.000Z')); // Justo a los 30 min

      const repoMock = {
        buscarEnProgresoParaRecordatorio: async () => [
          {
            id: 'exp-1',
            senderistaId: 'usr-1',
            horaRetornoEstimada: horaRetorno,
            minutosRecordatorio: 30,
          },
        ],
      } as unknown as RepositorioExpedicion;

      const servicioRecordatorio = new ServicioRecordatorioExpedicion(
        repoMock,
        servicioBandeja,
      );

      // Primer tick del cron: genera el aviso
      const tick1 = await servicioRecordatorio.procesarRecordatorios(reloj);
      assert.equal(tick1.avisosGenerados, 1);

      // Comprobar que llegó a la bandeja de HU-37
      const avisos = await servicioBandeja.listarAvisos('usr-1');
      assert.equal(avisos.avisos.length, 1);
      assert.equal(avisos.avisos[0].tipo, 'RECORDATORIO');
      assert.ok(avisos.avisos[0].mensaje.includes('30 minutos'));

      // Segundo tick 1 minuto después: NO genera aviso duplicado
      reloj.avanzarMinutos(1);
      const tick2 = await servicioRecordatorio.procesarRecordatorios(reloj);
      assert.equal(tick2.avisosGenerados, 0);

      // La bandeja sigue teniendo 1 solo aviso
      const avisosPost = await servicioBandeja.listarAvisos('usr-1');
      assert.equal(avisosPost.avisos.length, 1);
    });
  });

  describe('CA-03 — Independencia de alertas críticas de seguridad', () => {
    it('garantiza que configurar el recordatorio en 15, 30 o 60 min no altera la fecha límite ni la tolerancia', () => {
      const retorno = '2026-11-03T18:00:00.000Z';
      const tolerancia = 45; // 45 minutos de tolerancia para rescate

      // Fecha límite oficial: retorno + tolerancia
      const fechaLimiteEsperada = new Date('2026-11-03T18:45:00.000Z').toISOString();
      const limiteCalculado = calcularFechaLimite(retorno, tolerancia);

      assert.equal(limiteCalculado, fechaLimiteEsperada);

      // Probar que distintas estrategias de recordatorio conservan intacto el cálculo de expiración
      const umbrales = [15, 30, 60] as const;
      for (const umbral of umbrales) {
        const regla = FabricaReglaRecordatorio.obtener(umbral);
        assert.ok(regla.minutosAnticipacion === umbral);

        // El cálculo de fecha límite de rescate jamás debe depender del recordatorio
        assert.equal(calcularFechaLimite(retorno, tolerancia), fechaLimiteEsperada);
      }
    });
  });
});
