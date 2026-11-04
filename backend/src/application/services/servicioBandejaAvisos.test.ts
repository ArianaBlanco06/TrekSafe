import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import type { Aviso } from '../../domain/entities/Aviso.js';
import type {
  CrearAvisoInput,
  INotificacionDAO,
} from '../../domain/repositories/INotificacionDAO.js';
import {
  GeneradorAvisosEvento,
  ServicioBandejaAvisos,
} from './servicioBandejaAvisos.js';

class NotificacionDAOMemoria implements INotificacionDAO {
  private avisos: Aviso[] = [];
  private contadorId = 1;

  async crear(datos: CrearAvisoInput): Promise<Aviso> {
    const nuevo: Aviso = {
      id: `aviso-${this.contadorId++}`,
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

  async marcarComoLeido(id: string, usuarioId: string): Promise<boolean> {
    const aviso = this.avisos.find((a) => a.id === id && a.usuarioId === usuarioId);
    if (!aviso) return false;
    aviso.leido = true;
    return true;
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

  async obtenerPorId(id: string, usuarioId: string): Promise<Aviso | null> {
    const aviso = this.avisos.find((a) => a.id === id && a.usuarioId === usuarioId);
    return aviso ? { ...aviso } : null;
  }

  async obtenerPorEventoId(usuarioId: string, eventoId: string): Promise<Aviso | null> {
    const aviso = this.avisos.find(
      (a) => a.usuarioId === usuarioId && a.eventoId === eventoId,
    );
    return aviso ? { ...aviso } : null;
  }
}

describe('HU-37: Bandeja de avisos in-app (DoD y Criterios de Aceptación)', () => {
  let daoMemoria: NotificacionDAOMemoria;
  let servicio: ServicioBandejaAvisos;
  let generador: GeneradorAvisosEvento;

  const USUARIO_SENDERISTA = 'usr-senderista-101';
  const OTRO_USUARIO = 'usr-senderista-999';
  const EXPEDICION_ID = 'exp-2026-andes';

  beforeEach(() => {
    daoMemoria = new NotificacionDAOMemoria();
    servicio = new ServicioBandejaAvisos(daoMemoria);
    generador = new GeneradorAvisosEvento(servicio);
  });

  describe('CA-01 — Consulta de avisos (edición, cancelación, ampliación y recordatorio)', () => {
    it('muestra los cuatro tipos de avisos requeridos para el usuario correspondiente', async () => {
      // 1. Edición (HU-26)
      await generador.generarDesdeEdicion(
        USUARIO_SENDERISTA,
        EXPEDICION_ID,
        'Se ajustó el punto de retorno.',
        'evt-edit-1',
      );
      // 2. Cancelación (HU-27)
      await generador.generarDesdeCancelacion(
        USUARIO_SENDERISTA,
        EXPEDICION_ID,
        'Expedición cancelada por clima.',
        'evt-cancel-1',
      );
      // 3. Ampliación (HU-35)
      await generador.generarDesdeAmpliacion(
        USUARIO_SENDERISTA,
        EXPEDICION_ID,
        '19:30',
        'evt-ampl-1',
      );
      // 4. Recordatorio (HU-38 / Monitoreo)
      await generador.generarDesdeRecordatorio(
        USUARIO_SENDERISTA,
        EXPEDICION_ID,
        30,
        'evt-rec-1',
      );

      const resultado = await servicio.listarAvisos(USUARIO_SENDERISTA);

      assert.equal(resultado.avisos.length, 4);
      assert.equal(resultado.conteoNoLeidos, 4);

      const tiposPresentes = resultado.avisos.map((a) => a.tipo);
      assert.ok(tiposPresentes.includes('EDICION'));
      assert.ok(tiposPresentes.includes('CANCELACION'));
      assert.ok(tiposPresentes.includes('AMPLIACION'));
      assert.ok(tiposPresentes.includes('RECORDATORIO'));
    });
  });

  describe('CA-02 — Persistencia de lectura entre sesiones', () => {
    it('marcar un aviso como leído persiste el estado leido=true entre consultas', async () => {
      const aviso = await generador.generarDesdeRecordatorio(
        USUARIO_SENDERISTA,
        EXPEDICION_ID,
        15,
        'evt-rec-2',
      );

      let estado = await servicio.listarAvisos(USUARIO_SENDERISTA);
      assert.equal(estado.conteoNoLeidos, 1);
      assert.equal(estado.avisos[0].leido, false);

      // Simula acción del usuario marcando como leído
      const resultadoMarcado = await servicio.marcarComoLeido(aviso.id, USUARIO_SENDERISTA);
      assert.equal(resultadoMarcado.exito, true);

      // Simula una nueva sesión o recarga de pantalla
      const nuevoServicioMismaBD = new ServicioBandejaAvisos(daoMemoria);
      estado = await nuevoServicioMismaBD.listarAvisos(USUARIO_SENDERISTA);

      assert.equal(estado.conteoNoLeidos, 0);
      assert.equal(estado.avisos[0].leido, true);
    });

    it('permite marcar todos los avisos como leídos en una sola operación', async () => {
      await generador.generarDesdeEdicion(USUARIO_SENDERISTA, EXPEDICION_ID, 'E1', 'evt-1');
      await generador.generarDesdeAmpliacion(USUARIO_SENDERISTA, EXPEDICION_ID, '20:00', 'evt-2');

      const res = await servicio.marcarTodosComoLeidos(USUARIO_SENDERISTA);
      assert.equal(res.marcados, 2);

      const estado = await servicio.listarAvisos(USUARIO_SENDERISTA);
      assert.equal(estado.conteoNoLeidos, 0);
    });
  });

  describe('CA-03 — Unicidad y autorización', () => {
    it('evita que el mismo evento cree avisos duplicados para el usuario (Idempotencia)', async () => {
      const EVENTO_ID = 'evt-edicion-exp-2026-v1';

      // Primer procesamiento del evento
      const aviso1 = await generador.generarDesdeEdicion(
        USUARIO_SENDERISTA,
        EXPEDICION_ID,
        'Se cambió la hora de retorno.',
        EVENTO_ID,
      );

      // Segundo procesamiento del mismo evento (ej. reintento o duplicación de mensaje)
      const aviso2 = await generador.generarDesdeEdicion(
        USUARIO_SENDERISTA,
        EXPEDICION_ID,
        'Se cambió la hora de retorno.',
        EVENTO_ID,
      );

      // Debe devolver el mismo aviso y no crear una segunda fila
      assert.equal(aviso1.id, aviso2.id);

      const listado = await servicio.listarAvisos(USUARIO_SENDERISTA);
      assert.equal(listado.avisos.length, 1, 'No debe existir duplicidad del mismo evento');
    });

    it('los avisos pertenecen únicamente al destinatario y enlazan al plan autorizado', async () => {
      await generador.generarDesdeEdicion(
        USUARIO_SENDERISTA,
        EXPEDICION_ID,
        'Plan del senderista',
        'evt-s1',
      );
      await generador.generarDesdeEdicion(
        OTRO_USUARIO,
        'exp-otro-usuario',
        'Plan de otro senderista',
        'evt-s2',
      );

      const avisosSenderista = await servicio.listarAvisos(USUARIO_SENDERISTA);
      const avisosOtro = await servicio.listarAvisos(OTRO_USUARIO);

      assert.equal(avisosSenderista.avisos.length, 1);
      assert.equal(avisosSenderista.avisos[0].expedicionId, EXPEDICION_ID);

      assert.equal(avisosOtro.avisos.length, 1);
      assert.equal(avisosOtro.avisos[0].expedicionId, 'exp-otro-usuario');

      // Intentar marcar un aviso ajeno produce error de autorización
      await assert.rejects(
        async () => {
          await servicio.marcarComoLeido(avisosOtro.avisos[0].id, USUARIO_SENDERISTA);
        },
        {
          message: 'Aviso no encontrado o no pertenece al usuario',
        },
      );
    });
  });
});
