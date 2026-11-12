import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { ErrorCancelacionPlan } from '../../domain/errors/ErrorCancelacionPlan.js';
import { ErrorEdicionPlan } from '../../domain/errors/ErrorEdicionPlan.js';
import type {
  ComandoEditarPlan,
  IExpedicionDAO,
  PlanExpedicion,
  ResultadoCancelacionPlan,
  ResultadoEdicionPlan,
  SolicitudCancelacionPlan,
} from '../../domain/repositories/IExpedicionDAO.js';
import type { IReloj } from '../../domain/services/IReloj.js';
import { errorHandler } from '../../shared/errors/errorHandler.js';
import { ComandoCancelarPlan } from '../commands/ComandoCancelarPlan.js';
import { CancelarPlan } from './CancelarPlan.js';
import { EditarPlan } from './EditarPlan.js';

const AHORA = '2030-01-15T12:00:00.000Z';
const PROPIETARIO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AJENO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EXPEDICION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTRA_EXPEDICION = '99999999-9999-4999-8999-999999999999';
const CONTACTO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OPERACION = '11111111-1111-4111-8111-111111111111';
const OTRA_OPERACION = '22222222-2222-4222-8222-222222222222';

class RelojFijo implements IReloj {
  constructor(private readonly instante: string) {}
  ahora(): Date {
    return new Date(this.instante);
  }
}

type EventoPlan = {
  expedicionId: string;
  senderistaId: string;
  tipo: 'EDITADA' | 'CANCELADA';
  versionResultante: number;
  cambios: Record<string, unknown>;
  motivo: string | null;
  operacionId: string;
};

/** Doble de prueba con las mismas reglas que la RPC treksafe_cancelar_expedicion (005). */
class ExpedicionDAOEnMemoria implements IExpedicionDAO {
  readonly eventos: EventoPlan[] = [];
  llamadasCancelar = 0;
  /** Simula un cambio concurrente (p. ej. el cron) justo antes de que la RPC bloquee la fila. */
  antesDeCancelar?: () => void;

  /** `relojBd` hace de now() de la base, que es el que usa la RPC. */
  constructor(
    public plan: PlanExpedicion,
    private readonly relojBd: IReloj = new RelojFijo(AHORA),
  ) {}

  async obtenerPlan(expedicionId: string, senderistaId: string): Promise<PlanExpedicion | null> {
    if (this.plan.id !== expedicionId || this.plan.senderistaId !== senderistaId) return null;
    return structuredClone(this.plan);
  }

  async buscarOperacionRegistrada(): Promise<ResultadoEdicionPlan | null> {
    return null;
  }

  async editarPlan(comando: ComandoEditarPlan): Promise<ResultadoEdicionPlan> {
    if (this.plan.estado !== 'programada') throw new ErrorEdicionPlan('PLAN_NO_EDITABLE');
    this.plan = { ...this.plan, ...comando.datos, version: this.plan.version + 1 };
    return { id: this.plan.id, version: this.plan.version };
  }

  async cancelarPlan(solicitud: SolicitudCancelacionPlan): Promise<ResultadoCancelacionPlan> {
    this.llamadasCancelar++;
    this.antesDeCancelar?.();

    const registrado = this.eventos.find((e) => e.operacionId === solicitud.operacionId);
    if (registrado) {
      if (
        registrado.expedicionId !== solicitud.expedicionId ||
        registrado.senderistaId !== solicitud.senderistaId
      ) {
        throw new ErrorCancelacionPlan('EXPEDICION_NO_ENCONTRADA');
      }
      return { id: registrado.expedicionId, version: registrado.versionResultante, estado: 'cancelada' };
    }
    if (this.plan.id !== solicitud.expedicionId || this.plan.senderistaId !== solicitud.senderistaId) {
      throw new ErrorCancelacionPlan('EXPEDICION_NO_ENCONTRADA');
    }
    if (this.plan.estado === 'cancelada') {
      return { id: this.plan.id, version: this.plan.version, estado: 'cancelada' };
    }
    if (this.plan.estado !== 'programada') throw new ErrorCancelacionPlan('PLAN_NO_CANCELABLE');
    // HU-27 CA-01 (migración 018): la salida debe ser futura según el reloj de la base.
    if (new Date(this.plan.horaInicio).getTime() <= this.relojBd.ahora().getTime()) {
      throw new ErrorCancelacionPlan('PLAN_NO_CANCELABLE');
    }

    this.plan = { ...this.plan, estado: 'cancelada', version: this.plan.version + 1 };
    this.eventos.push({
      expedicionId: this.plan.id,
      senderistaId: solicitud.senderistaId,
      tipo: 'CANCELADA',
      versionResultante: this.plan.version,
      cambios: { estado: { antes: 'programada', despues: 'cancelada' } },
      motivo: solicitud.motivo,
      operacionId: solicitud.operacionId,
    });
    return { id: this.plan.id, version: this.plan.version, estado: 'cancelada' };
  }

  async contarAmpliaciones(): Promise<never> {
    throw new Error('HU-35: estas pruebas no amplían el retorno (ver AmpliarRetorno.test.ts)');
  }

  async ampliarRetorno(): Promise<never> {
    throw new Error('HU-35: estas pruebas no amplían el retorno (ver AmpliarRetorno.test.ts)');
  }
}

function planInicial(cambios: Partial<PlanExpedicion> = {}): PlanExpedicion {
  return {
    id: EXPEDICION,
    senderistaId: PROPIETARIO,
    lugarInicio: 'Cebollapampa',
    lugarFin: 'Laguna 69',
    coordenadasInicio: null,
    coordenadasFin: null,
    horaInicio: '2030-02-01T10:00:00.000Z',
    horaRetornoEstimada: '2030-02-01T18:00:00.000Z',
    minutosTolerancia: 30,
    estado: 'programada',
    version: 1,
    idsContactos: [CONTACTO],
    nombresAcompanantes: ['Ana Ríos'],
    ...cambios,
  };
}

/** Pasa el error por el manejador real para comprobar la respuesta HTTP que recibiría el cliente. */
function respuestaHttp(err: unknown): { estado: number; cuerpo: Record<string, unknown> } {
  const salida = { estado: 0, cuerpo: {} as Record<string, unknown> };
  const res = {
    status(codigo: number) {
      salida.estado = codigo;
      return this;
    },
    json(cuerpo: Record<string, unknown>) {
      salida.cuerpo = cuerpo;
      return this;
    },
  } as unknown as Response;
  errorHandler(err, {} as Request, res, () => undefined);
  return salida;
}

/** Construye el comando como lo hace el controlador; falla igual que él si el cuerpo es inválido. */
function comando(
  cuerpo: unknown = { operacionId: OPERACION },
  senderistaId = PROPIETARIO,
  expedicionId = EXPEDICION,
): ComandoCancelarPlan {
  return ComandoCancelarPlan.crear(senderistaId, expedicionId, cuerpo);
}

describe('CancelarPlan', () => {
  let dao: ExpedicionDAOEnMemoria;
  let ejecutor: CancelarPlan;

  function preparar(plan: PlanExpedicion = planInicial(), instante = AHORA): void {
    dao = new ExpedicionDAOEnMemoria(plan, new RelojFijo(instante));
    ejecutor = new CancelarPlan(dao, new RelojFijo(instante));
  }

  /** Construye y ejecuta el comando; devuelve la respuesta HTTP del rechazo. */
  async function rechazo(
    construir: () => ComandoCancelarPlan,
  ): Promise<{ estado: number; cuerpo: Record<string, unknown> }> {
    try {
      await ejecutor.ejecutar(construir());
    } catch (err) {
      return respuestaHttp(err);
    }
    return assert.fail('Se esperaba que la cancelación fuera rechazada');
  }

  beforeEach(() => preparar());

  describe('cancelación correcta', () => {
    it('deja el plan cancelado, sube la versión y registra un evento CANCELADA', async () => {
      const resultado = await ejecutor.ejecutar(
        comando({ operacionId: OPERACION, motivo: '  Se pronostica tormenta  ' }),
      );

      assert.deepEqual(resultado, { id: EXPEDICION, version: 2, estado: 'cancelada' });
      assert.equal(dao.plan.estado, 'cancelada');
      assert.equal(dao.plan.version, 2);
      assert.deepEqual(dao.eventos, [
        {
          expedicionId: EXPEDICION,
          senderistaId: PROPIETARIO,
          tipo: 'CANCELADA',
          versionResultante: 2,
          cambios: { estado: { antes: 'programada', despues: 'cancelada' } },
          motivo: 'Se pronostica tormenta',
          operacionId: OPERACION,
        },
      ]);
    });

    it('acepta omitir el motivo, o enviarlo vacío o nulo, y lo guarda como null', async () => {
      for (const cuerpo of [
        { operacionId: OPERACION },
        { operacionId: OPERACION, motivo: '   ' },
        { operacionId: OPERACION, motivo: null },
      ]) {
        preparar();
        await ejecutor.ejecutar(comando(cuerpo));
        assert.equal(dao.eventos[0]?.motivo, null);
      }
    });

    it('acepta un motivo de exactamente 200 caracteres', async () => {
      await ejecutor.ejecutar(comando({ operacionId: OPERACION, motivo: 'a'.repeat(200) }));

      assert.equal(dao.eventos[0]?.motivo?.length, 200);
    });
  });

  // HU-27 CA-01: "solo el propietario cancela un plan programado y futuro".
  describe('CA-01: solo se cancela un plan programado y con salida futura', () => {
    it('rechaza cancelar un plan programado cuya hora de salida ya pasó, sin escribir nada', async () => {
      preparar(planInicial({ horaInicio: '2030-01-15T11:00:00.000Z' }));

      const { estado, cuerpo } = await rechazo(() => comando());

      assert.equal(estado, 409);
      assert.equal(cuerpo.codigo, 'PLAN_NO_CANCELABLE');
      assert.match(String(cuerpo.mensaje), /programadas con hora de salida futura/);
      assert.equal(dao.llamadasCancelar, 0, 'se rechaza antes de llegar a la persistencia');
      assert.equal(dao.plan.estado, 'programada');
      assert.equal(dao.plan.version, 1);
      assert.equal(dao.eventos.length, 0);
    });

    it('rechaza cancelar cuando la salida es exactamente ahora (no es futura)', async () => {
      preparar(planInicial({ horaInicio: AHORA }));

      const { estado, cuerpo } = await rechazo(() => comando());

      assert.equal(estado, 409);
      assert.equal(cuerpo.codigo, 'PLAN_NO_CANCELABLE');
      assert.equal(dao.plan.estado, 'programada');
      assert.equal(dao.eventos.length, 0);
    });

    it('responde 409 si la base considera que la salida ya pasó aunque el reloj local diga lo contrario', async () => {
      // Reloj local 12:00:00 (salida 12:00:00.500, futura); reloj de la base 12:00:01 (ya pasó).
      dao = new ExpedicionDAOEnMemoria(
        planInicial({ horaInicio: '2030-01-15T12:00:00.500Z' }),
        new RelojFijo('2030-01-15T12:00:01.000Z'),
      );
      ejecutor = new CancelarPlan(dao, new RelojFijo(AHORA));

      const { estado, cuerpo } = await rechazo(() => comando());

      assert.equal(estado, 409);
      assert.equal(cuerpo.codigo, 'PLAN_NO_CANCELABLE');
      assert.equal(dao.llamadasCancelar, 1, 'la persistencia hizo la comprobación definitiva');
      assert.equal(dao.plan.estado, 'programada');
      assert.equal(dao.eventos.length, 0);
    });

    it('acepta cancelar cuando la salida es 1 ms posterior a ahora', async () => {
      preparar(planInicial({ horaInicio: '2030-01-15T12:00:00.001Z' }));

      const resultado = await ejecutor.ejecutar(comando());

      assert.equal(resultado.estado, 'cancelada');
      assert.equal(dao.eventos.length, 1);
    });

    it('repetir una cancelación ya hecha devuelve lo mismo aunque la salida ya haya pasado', async () => {
      preparar(planInicial({ estado: 'cancelada', version: 2, horaInicio: '2030-01-15T11:00:00.000Z' }));

      const resultado = await ejecutor.ejecutar(comando());

      assert.deepEqual(resultado, { id: EXPEDICION, version: 2, estado: 'cancelada' });
      assert.equal(dao.llamadasCancelar, 0);
      assert.equal(dao.eventos.length, 0);
    });

    it('el estado se evalúa antes que la salida: un plan en curso con salida pasada responde PLAN_NO_CANCELABLE', async () => {
      preparar(planInicial({ estado: 'en_progreso', horaInicio: '2030-01-15T11:00:00.000Z' }));

      const { estado, cuerpo } = await rechazo(() => comando());

      assert.equal(estado, 409);
      assert.equal(cuerpo.codigo, 'PLAN_NO_CANCELABLE');
    });
  });

  describe('propiedad', () => {
    it('responde 404 a un senderista ajeno sin cancelar nada', async () => {
      const { estado, cuerpo } = await rechazo(() => comando({ operacionId: OPERACION }, AJENO));

      assert.equal(estado, 404);
      assert.equal(cuerpo.codigo, 'EXPEDICION_NO_ENCONTRADA');
      assert.equal(dao.plan.estado, 'programada');
      assert.equal(dao.llamadasCancelar, 0);
    });

    it('responde 404 si la expedición no existe', async () => {
      const { estado } = await rechazo(() =>
        comando({ operacionId: OPERACION }, PROPIETARIO, OTRA_EXPEDICION),
      );

      assert.equal(estado, 404);
    });

    it('responde 404, y no 401, si la RPC no encuentra el plan por concurrencia', async () => {
      dao.antesDeCancelar = () => {
        dao.plan = { ...dao.plan, senderistaId: AJENO };
      };

      const { estado } = await rechazo(() => comando());

      assert.equal(estado, 404);
    });
  });

  describe('estados no cancelables', () => {
    for (const estadoPlan of ['en_progreso', 'alerta', 'completada']) {
      it(`responde 409 PLAN_NO_CANCELABLE si el plan está ${estadoPlan}`, async () => {
        preparar(planInicial({ estado: estadoPlan }));

        const { estado, cuerpo } = await rechazo(() => comando());

        assert.equal(estado, 409);
        assert.equal(cuerpo.codigo, 'PLAN_NO_CANCELABLE');
        assert.equal(dao.plan.estado, estadoPlan);
        assert.equal(dao.plan.version, 1);
        assert.equal(dao.eventos.length, 0);
      });
    }

    it('responde 409 si el cron promueve el plan entre la lectura y la cancelación', async () => {
      dao.antesDeCancelar = () => {
        dao.plan = { ...dao.plan, estado: 'en_progreso' };
      };

      const { estado, cuerpo } = await rechazo(() => comando());

      assert.equal(estado, 409);
      assert.equal(cuerpo.codigo, 'PLAN_NO_CANCELABLE');
      assert.equal(dao.eventos.length, 0);
    });
  });

  describe('idempotencia', () => {
    it('repetir la misma operación devuelve el mismo resultado sin duplicar efectos', async () => {
      const primera = await ejecutor.ejecutar(comando());
      const repetida = await ejecutor.ejecutar(comando());

      assert.deepEqual(repetida, primera);
      assert.equal(dao.plan.version, 2);
      assert.equal(dao.eventos.length, 1);
      assert.equal(dao.llamadasCancelar, 1);
    });

    it('una segunda cancelación con otra operación devuelve el mismo resultado sin nuevo evento', async () => {
      const primera = await ejecutor.ejecutar(comando({ operacionId: OPERACION }));
      const segunda = await ejecutor.ejecutar(
        comando({ operacionId: OTRA_OPERACION, motivo: 'Otro motivo' }),
      );

      assert.deepEqual(segunda, primera);
      assert.equal(dao.plan.version, 2);
      assert.equal(dao.eventos.length, 1);
      assert.equal(dao.eventos[0]?.motivo, null);
    });

    it('un reintento simultáneo que ya confirmó la RPC devuelve el resultado registrado', async () => {
      // El caso de uso leyó el plan programado, pero otra petición con la misma operación
      // lo canceló antes de que la RPC bloqueara la fila.
      dao.antesDeCancelar = () => {
        dao.antesDeCancelar = undefined;
        void dao.cancelarPlan({
          expedicionId: EXPEDICION,
          senderistaId: PROPIETARIO,
          operacionId: OPERACION,
          motivo: null,
        });
      };

      const resultado = await ejecutor.ejecutar(comando());

      assert.deepEqual(resultado, { id: EXPEDICION, version: 2, estado: 'cancelada' });
      assert.equal(dao.eventos.length, 1);
    });

    it('la cancelación de un senderista no le sirve a otro', async () => {
      await ejecutor.ejecutar(comando());

      assert.equal((await rechazo(() => comando({ operacionId: OPERACION }, AJENO))).estado, 404);
    });
  });

  describe('validación de la entrada', () => {
    it('responde 400 si el motivo supera los 200 caracteres', async () => {
      const { estado, cuerpo } = await rechazo(() =>
        comando({ operacionId: OPERACION, motivo: 'a'.repeat(201) }),
      );

      assert.equal(estado, 400);
      assert.equal(cuerpo.error, 'ErrorValidacion');
      assert.ok((cuerpo.detalles as Record<string, unknown>).motivo);
      assert.equal(dao.llamadasCancelar, 0);
    });

    for (const [caso, cuerpo] of [
      ['sin cuerpo', undefined],
      ['sin operacionId', {}],
      ['con operacionId que no es UUID', { operacionId: 'abc' }],
      ['con motivo que no es texto', { operacionId: OPERACION, motivo: 5 }],
    ] as const) {
      it(`responde 400 ${caso}`, async () => {
        const { estado } = await rechazo(() =>
          ComandoCancelarPlan.crear(PROPIETARIO, EXPEDICION, cuerpo),
        );

        assert.equal(estado, 400);
      });
    }

    it('responde 400 si la RPC rechaza los datos', async () => {
      dao.cancelarPlan = async () => {
        throw new ErrorCancelacionPlan('DATOS_INVALIDOS');
      };

      assert.equal((await rechazo(() => comando())).estado, 400);
    });
  });

  describe('después de cancelar', () => {
    it('editar una expedición cancelada sigue respondiendo 409 PLAN_NO_EDITABLE', async () => {
      await ejecutor.ejecutar(comando());
      const editar = new EditarPlan(dao, new RelojFijo(AHORA));

      try {
        await editar.ejecutar(PROPIETARIO, EXPEDICION, {
          lugarInicio: 'Pashpa',
          lugarFin: 'Ishinca',
          horaInicio: '2030-03-01T08:00:00.000Z',
          horaRetornoEstimada: '2030-03-01T18:00:00.000Z',
          minutosTolerancia: 30,
          idsContactos: [CONTACTO],
          nombresAcompanantes: ['Ana Ríos'],
          versionEsperada: 2,
          operacionId: OTRA_OPERACION,
        });
        assert.fail('Se esperaba que la edición fuera rechazada');
      } catch (err) {
        const { estado, cuerpo } = respuestaHttp(err);
        assert.equal(estado, 409);
        assert.equal(cuerpo.codigo, 'PLAN_NO_EDITABLE');
      }
      assert.equal(dao.plan.estado, 'cancelada');
    });
  });
});

describe('ComandoCancelarPlan', () => {
  it('es un objeto inmutable con identidad y parámetros', () => {
    const cancelar = comando({ operacionId: OPERACION, motivo: 'Lluvia' });

    assert.equal(cancelar.operacionId, OPERACION);
    assert.equal(cancelar.expedicionId, EXPEDICION);
    assert.equal(cancelar.senderistaId, PROPIETARIO);
    assert.equal(cancelar.motivo, 'Lluvia');
    assert.ok(Object.isFrozen(cancelar));
  });
});
