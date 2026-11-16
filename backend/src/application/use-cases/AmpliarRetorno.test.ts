import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { calcularFechaLimite } from '../../domain/entities/Expedicion.js';
import { ErrorAmpliacionRetorno } from '../../domain/errors/ErrorAmpliacionRetorno.js';
import type {
  IExpedicionDAO,
  PlanExpedicion,
  ResultadoAmpliacionRetorno,
  ResultadoEdicionPlan,
  SolicitudAmpliacionRetorno,
} from '../../domain/repositories/IExpedicionDAO.js';
import type { IReloj } from '../../domain/services/IReloj.js';
import { MAX_AMPLIACIONES } from '../../domain/value-objects/ampliacionRetorno.js';
import { errorHandler } from '../../shared/errors/errorHandler.js';
import { ComandoAmpliarRetorno } from '../commands/ComandoAmpliarRetorno.js';
import { AmpliarRetorno } from './AmpliarRetorno.js';

// Retorno a las 12:00 con 30 min de tolerancia: el límite es 12:30.
const AHORA = '2030-01-15T12:10:00.000Z';
const RETORNO = '2030-01-15T12:00:00.000Z';
const LIMITE = '2030-01-15T12:30:00.000Z';
const PROPIETARIO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AJENO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EXPEDICION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTRA_EXPEDICION = '99999999-9999-4999-8999-999999999999';
const OPERACION = '11111111-1111-4111-8111-111111111111';
const OTRA_OPERACION = '22222222-2222-4222-8222-222222222222';

class RelojFijo implements IReloj {
  constructor(public instante: string) {}
  ahora(): Date {
    return new Date(this.instante);
  }
}

type EventoPlan = {
  expedicionId: string;
  senderistaId: string;
  tipo: 'EDITADA' | 'CANCELADA' | 'RETORNO_AMPLIADO';
  versionResultante: number;
  cambios: Record<string, unknown>;
  motivo: string | null;
  operacionId: string;
};

const sumarMinutos = (iso: string, minutos: number) =>
  new Date(new Date(iso).getTime() + minutos * 60_000).toISOString();

/**
 * Doble de prueba con las mismas reglas y el mismo orden que la RPC
 * treksafe_ampliar_retorno (007). `relojBd` hace de NOW() de la base.
 */
class ExpedicionDAOEnMemoria implements IExpedicionDAO {
  readonly eventos: EventoPlan[] = [];
  llamadasAmpliar = 0;
  /** Simula un cambio concurrente (p. ej. el cron) justo antes de que la RPC bloquee la fila. */
  antesDeAmpliar?: () => void;

  constructor(
    public plan: PlanExpedicion,
    private readonly relojBd: IReloj,
  ) {}

  async obtenerPlan(expedicionId: string, senderistaId: string): Promise<PlanExpedicion | null> {
    if (this.plan.id !== expedicionId || this.plan.senderistaId !== senderistaId) return null;
    return structuredClone(this.plan);
  }

  async buscarOperacionRegistrada(
    operacionId: string,
    expedicionId: string,
    senderistaId: string,
  ): Promise<ResultadoEdicionPlan | null> {
    const e = this.eventos.find(
      (ev) =>
        ev.operacionId === operacionId &&
        ev.expedicionId === expedicionId &&
        ev.senderistaId === senderistaId,
    );
    return e ? { id: e.expedicionId, version: e.versionResultante } : null;
  }

  async editarPlan(): Promise<never> {
    throw new Error('HU-35: estas pruebas no editan planes');
  }

  async cancelarPlan(): Promise<never> {
    throw new Error('HU-35: estas pruebas no cancelan planes');
  }

  async contarAmpliaciones(expedicionId: string): Promise<number> {
    return this.cantidadAmpliaciones(expedicionId);
  }

  /** Síncrono: la RPC cuenta y escribe sin ceder el turno, con la fila bloqueada. */
  private cantidadAmpliaciones(expedicionId: string): number {
    return this.eventos.filter((e) => e.expedicionId === expedicionId && e.tipo === 'RETORNO_AMPLIADO')
      .length;
  }

  private resultadoDe(evento: EventoPlan): ResultadoAmpliacionRetorno {
    const hora = (evento.cambios.horaRetornoEstimada as { despues: string }).despues;
    return {
      id: evento.expedicionId,
      version: evento.versionResultante,
      horaRetornoEstimada: hora,
      fechaLimite: calcularFechaLimite(hora, this.plan.minutosTolerancia),
    };
  }

  async ampliarRetorno(s: SolicitudAmpliacionRetorno): Promise<ResultadoAmpliacionRetorno> {
    this.llamadasAmpliar++;
    this.antesDeAmpliar?.();

    const registrado = this.eventos.find((e) => e.operacionId === s.operacionId);
    if (registrado) {
      if (registrado.expedicionId !== s.expedicionId || registrado.senderistaId !== s.senderistaId) {
        throw new ErrorAmpliacionRetorno('EXPEDICION_NO_ENCONTRADA');
      }
      if (registrado.tipo !== 'RETORNO_AMPLIADO') throw new ErrorAmpliacionRetorno('DATOS_INVALIDOS');
      return this.resultadoDe(registrado);
    }

    const motivo = s.motivo.trim();
    if (!Number.isInteger(s.minutos) || s.minutos < 1 || s.minutos > 120) {
      throw new ErrorAmpliacionRetorno('DATOS_INVALIDOS');
    }
    if (motivo.length < 3 || motivo.length > 200) throw new ErrorAmpliacionRetorno('DATOS_INVALIDOS');

    if (this.plan.id !== s.expedicionId || this.plan.senderistaId !== s.senderistaId) {
      throw new ErrorAmpliacionRetorno('EXPEDICION_NO_ENCONTRADA');
    }
    if (this.plan.estado === 'alerta') throw new ErrorAmpliacionRetorno('ALERTA_YA_DECLARADA');
    if (this.plan.estado !== 'en_progreso') throw new ErrorAmpliacionRetorno('RETORNO_NO_AMPLIABLE');
    const limite = calcularFechaLimite(this.plan.horaRetornoEstimada, this.plan.minutosTolerancia);
    if (this.relojBd.ahora().getTime() >= new Date(limite).getTime()) {
      throw new ErrorAmpliacionRetorno('PLAZO_VENCIDO');
    }
    if (this.plan.version !== s.versionEsperada) {
      throw new ErrorAmpliacionRetorno('VERSION_OBSOLETA', this.plan.version);
    }
    if (this.cantidadAmpliaciones(s.expedicionId) >= MAX_AMPLIACIONES) {
      throw new ErrorAmpliacionRetorno('AMPLIACION_NO_DISPONIBLE');
    }

    const antes = this.plan.horaRetornoEstimada;
    const despues = sumarMinutos(antes, s.minutos);
    this.plan = { ...this.plan, horaRetornoEstimada: despues, version: this.plan.version + 1 };
    const evento: EventoPlan = {
      expedicionId: s.expedicionId,
      senderistaId: s.senderistaId,
      tipo: 'RETORNO_AMPLIADO',
      versionResultante: this.plan.version,
      cambios: { horaRetornoEstimada: { antes, despues } },
      motivo,
      operacionId: s.operacionId,
    };
    this.eventos.push(evento);
    return this.resultadoDe(evento);
  }
}

function planEnCurso(cambios: Partial<PlanExpedicion> = {}): PlanExpedicion {
  return {
    id: EXPEDICION,
    senderistaId: PROPIETARIO,
    lugarInicio: 'Cebollapampa',
    lugarFin: 'Laguna 69',
    coordenadasInicio: null,
    coordenadasFin: null,
    horaInicio: '2030-01-15T06:00:00.000Z',
    horaRetornoEstimada: RETORNO,
    minutosTolerancia: 30,
    estado: 'en_progreso',
    version: 1,
    idsContactos: [],
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

const CUERPO = {
  versionEsperada: 1,
  operacionId: OPERACION,
  minutos: 30,
  motivo: 'Demora por nieve en el paso',
};

/** Construye el comando como lo hace el controlador; falla igual que él si el cuerpo es inválido. */
function comando(
  cambios: Record<string, unknown> = {},
  senderistaId = PROPIETARIO,
  expedicionId = EXPEDICION,
): ComandoAmpliarRetorno {
  return ComandoAmpliarRetorno.crear(senderistaId, expedicionId, { ...CUERPO, ...cambios });
}

describe('AmpliarRetorno', () => {
  let reloj: RelojFijo;
  let dao: ExpedicionDAOEnMemoria;
  let ejecutor: AmpliarRetorno;

  function preparar(plan: PlanExpedicion = planEnCurso(), instante = AHORA): void {
    reloj = new RelojFijo(instante);
    dao = new ExpedicionDAOEnMemoria(plan, reloj);
    ejecutor = new AmpliarRetorno(dao, reloj);
  }

  async function rechazo(
    construir: () => ComandoAmpliarRetorno,
  ): Promise<{ estado: number; cuerpo: Record<string, unknown> }> {
    try {
      await ejecutor.ejecutar(construir());
    } catch (err) {
      return respuestaHttp(err);
    }
    return assert.fail('Se esperaba que la ampliación fuera rechazada');
  }

  function sinCambios(): void {
    assert.equal(dao.plan.horaRetornoEstimada, RETORNO);
    assert.equal(dao.plan.version, 1);
    assert.equal(dao.eventos.length, 0);
  }

  beforeEach(() => preparar());

  describe('ampliación correcta', () => {
    it('suma los minutos a la hora de retorno (no a "ahora"), sube la versión y devuelve la nueva fechaLimite', async () => {
      const resultado = await ejecutor.ejecutar(comando());

      assert.deepEqual(resultado, {
        id: EXPEDICION,
        version: 2,
        horaRetornoEstimada: '2030-01-15T12:30:00.000Z',
        fechaLimite: '2030-01-15T13:00:00.000Z',
      });
      assert.equal(dao.plan.horaRetornoEstimada, '2030-01-15T12:30:00.000Z');
      assert.equal(dao.plan.version, 2);
      assert.equal(dao.plan.estado, 'en_progreso');
    });

    it('registra RETORNO_AMPLIADO con la hora anterior, la nueva y el motivo recortado', async () => {
      await ejecutor.ejecutar(comando({ motivo: '  Demora por nieve en el paso  ' }));

      assert.deepEqual(dao.eventos, [
        {
          expedicionId: EXPEDICION,
          senderistaId: PROPIETARIO,
          tipo: 'RETORNO_AMPLIADO',
          versionResultante: 2,
          cambios: {
            horaRetornoEstimada: { antes: RETORNO, despues: '2030-01-15T12:30:00.000Z' },
          },
          motivo: 'Demora por nieve en el paso',
          operacionId: OPERACION,
        },
      ]);
    });

    for (const minutos of [1, 120]) {
      it(`acepta ${minutos} minuto(s)`, async () => {
        const resultado = await ejecutor.ejecutar(comando({ minutos }));

        assert.equal(resultado.horaRetornoEstimada, sumarMinutos(RETORNO, minutos));
        assert.equal(resultado.fechaLimite, sumarMinutos(LIMITE, minutos));
      });
    }

    for (const motivo of ['abc', 'a'.repeat(200)]) {
      it(`acepta un motivo de ${motivo.length} caracteres`, async () => {
        await ejecutor.ejecutar(comando({ motivo }));

        assert.equal(dao.eventos[0]?.motivo, motivo);
      });
    }

    it('amplía durante la tolerancia: el retorno ya pasó pero el límite no', async () => {
      preparar(planEnCurso(), '2030-01-15T12:29:59.000Z');

      assert.equal((await ejecutor.ejecutar(comando())).version, 2);
    });
  });

  describe('validación de la entrada', () => {
    for (const [caso, cambios] of [
      ['0 minutos', { minutos: 0 }],
      ['121 minutos', { minutos: 121 }],
      ['minutos decimales', { minutos: 1.5 }],
      ['minutos como texto', { minutos: '30' }],
      ['sin minutos', { minutos: undefined }],
      ['motivo vacío', { motivo: '' }],
      ['motivo en blanco', { motivo: '    ' }],
      ['motivo de 2 caracteres', { motivo: 'ab' }],
      ['motivo de 201 caracteres', { motivo: 'a'.repeat(201) }],
      ['sin motivo', { motivo: undefined }],
      ['sin versionEsperada', { versionEsperada: undefined }],
      ['operacionId que no es UUID', { operacionId: 'abc' }],
    ] as const) {
      it(`responde 400 con ${caso}, sin llamar a la persistencia`, async () => {
        const { estado, cuerpo } = await rechazo(() => comando(cambios));

        assert.equal(estado, 400);
        assert.equal(cuerpo.error, 'ErrorValidacion');
        assert.equal(dao.llamadasAmpliar, 0);
        sinCambios();
      });
    }

    it('responde 400 sin cuerpo', async () => {
      const { estado } = await rechazo(() =>
        ComandoAmpliarRetorno.crear(PROPIETARIO, EXPEDICION, undefined),
      );

      assert.equal(estado, 400);
    });

    it('responde 400 si la RPC rechaza los datos', async () => {
      dao.ampliarRetorno = async () => {
        throw new ErrorAmpliacionRetorno('DATOS_INVALIDOS');
      };

      const { estado, cuerpo } = await rechazo(() => comando());

      assert.equal(estado, 400);
      assert.equal(cuerpo.codigo, 'DATOS_INVALIDOS');
    });
  });

  describe('estado y plazo', () => {
    for (const estadoPlan of ['programada', 'completada', 'cancelada']) {
      it(`responde 409 RETORNO_NO_AMPLIABLE si la expedición está ${estadoPlan}`, async () => {
        preparar(planEnCurso({ estado: estadoPlan }));

        const { estado, cuerpo } = await rechazo(() => comando());

        assert.equal(estado, 409);
        assert.equal(cuerpo.codigo, 'RETORNO_NO_AMPLIABLE');
        assert.equal(dao.llamadasAmpliar, 0);
        sinCambios();
      });
    }

    it('responde 409 ALERTA_YA_DECLARADA si el cron ya declaró la alerta', async () => {
      preparar(planEnCurso({ estado: 'alerta' }));

      const { estado, cuerpo } = await rechazo(() => comando());

      assert.equal(estado, 409);
      assert.equal(cuerpo.codigo, 'ALERTA_YA_DECLARADA');
      sinCambios();
    });

    it('responde 409 PLAZO_VENCIDO aunque la expedición siga en_progreso', async () => {
      preparar(planEnCurso(), '2030-01-15T12:31:00.000Z');

      const { estado, cuerpo } = await rechazo(() => comando());

      assert.equal(estado, 409);
      assert.equal(cuerpo.codigo, 'PLAZO_VENCIDO');
      assert.equal(dao.llamadasAmpliar, 0);
      sinCambios();
    });

    it('en el instante exacto del límite ya no se amplía', async () => {
      preparar(planEnCurso(), LIMITE);

      assert.equal((await rechazo(() => comando())).cuerpo.codigo, 'PLAZO_VENCIDO');
    });

    it('si el cron declara la alerta entre la lectura y la RPC, responde 409 ALERTA_YA_DECLARADA', async () => {
      dao.antesDeAmpliar = () => {
        dao.plan = { ...dao.plan, estado: 'alerta' };
      };

      const { estado, cuerpo } = await rechazo(() => comando());

      assert.equal(estado, 409);
      assert.equal(cuerpo.codigo, 'ALERTA_YA_DECLARADA');
      assert.equal(dao.eventos.length, 0);
    });

    it('si el plazo vence entre la lectura y la RPC, la base lo rechaza con PLAZO_VENCIDO', async () => {
      dao.antesDeAmpliar = () => {
        reloj.instante = LIMITE;
      };

      const { estado, cuerpo } = await rechazo(() => comando());

      assert.equal(estado, 409);
      assert.equal(cuerpo.codigo, 'PLAZO_VENCIDO');
      sinCambios();
    });
  });

  describe('versión y cantidad de ampliaciones', () => {
    it('responde 409 VERSION_OBSOLETA con la versión actual', async () => {
      preparar(planEnCurso({ version: 3 }));

      const { estado, cuerpo } = await rechazo(() => comando({ versionEsperada: 2 }));

      assert.equal(estado, 409);
      assert.equal(cuerpo.codigo, 'VERSION_OBSOLETA');
      assert.equal(cuerpo.versionActual, 3);
      assert.equal(dao.llamadasAmpliar, 0);
    });

    it('responde 409 VERSION_OBSOLETA si la versión cambia entre la lectura y la RPC', async () => {
      dao.antesDeAmpliar = () => {
        dao.plan = { ...dao.plan, version: 2 };
      };

      const { estado, cuerpo } = await rechazo(() => comando());

      assert.equal(estado, 409);
      assert.equal(cuerpo.codigo, 'VERSION_OBSOLETA');
      assert.equal(cuerpo.versionActual, 2);
    });

    it('una segunda ampliación con otra operación responde 409 AMPLIACION_NO_DISPONIBLE', async () => {
      await ejecutor.ejecutar(comando());

      const { estado, cuerpo } = await rechazo(() =>
        comando({ operacionId: OTRA_OPERACION, versionEsperada: 2 }),
      );

      assert.equal(estado, 409);
      assert.equal(cuerpo.codigo, 'AMPLIACION_NO_DISPONIBLE');
      assert.equal(dao.plan.version, 2);
      assert.equal(dao.eventos.length, 1);
      assert.equal(dao.llamadasAmpliar, 1);
    });
  });

  describe('propiedad', () => {
    it('responde 404, y no 401, a un senderista ajeno sin ampliar nada', async () => {
      const { estado, cuerpo } = await rechazo(() => comando({}, AJENO));

      assert.equal(estado, 404);
      assert.equal(cuerpo.codigo, 'EXPEDICION_NO_ENCONTRADA');
      assert.equal(dao.llamadasAmpliar, 0);
      sinCambios();
    });

    it('responde 404 si la expedición no existe', async () => {
      assert.equal((await rechazo(() => comando({}, PROPIETARIO, OTRA_EXPEDICION))).estado, 404);
    });
  });

  describe('idempotencia', () => {
    it('el mismo operacionId no suma dos veces y devuelve el resultado registrado', async () => {
      const primera = await ejecutor.ejecutar(comando());
      const repetida = await ejecutor.ejecutar(comando());

      assert.deepEqual(repetida, primera);
      assert.equal(dao.plan.horaRetornoEstimada, '2030-01-15T12:30:00.000Z');
      assert.equal(dao.plan.version, 2);
      assert.equal(dao.eventos.length, 1);
    });

    it('el reintento devuelve lo registrado aunque la versión ya no coincida ni quede ampliación', async () => {
      const primera = await ejecutor.ejecutar(comando());

      // El cliente reintenta con la versión 1 y el mismo operacionId.
      assert.deepEqual(await ejecutor.ejecutar(comando({ versionEsperada: 1 })), primera);
    });

    it('un reintento simultáneo que ya confirmó la RPC devuelve el resultado registrado', async () => {
      dao.antesDeAmpliar = () => {
        dao.antesDeAmpliar = undefined;
        void dao.ampliarRetorno({
          expedicionId: EXPEDICION,
          senderistaId: PROPIETARIO,
          versionEsperada: 1,
          operacionId: OPERACION,
          minutos: 30,
          motivo: CUERPO.motivo,
        });
      };

      const resultado = await ejecutor.ejecutar(comando());

      assert.equal(resultado.version, 2);
      assert.equal(dao.eventos.length, 1);
    });

    it('la ampliación de un senderista no le sirve a otro', async () => {
      await ejecutor.ejecutar(comando());

      assert.equal((await rechazo(() => comando({}, AJENO))).estado, 404);
    });

    it('un operacionId ya usado por otra operación del plan responde 400', async () => {
      dao.eventos.push({
        expedicionId: EXPEDICION,
        senderistaId: PROPIETARIO,
        tipo: 'EDITADA',
        versionResultante: 1,
        cambios: {},
        motivo: null,
        operacionId: OPERACION,
      });

      const { estado, cuerpo } = await rechazo(() => comando());

      assert.equal(estado, 400);
      assert.equal(cuerpo.codigo, 'DATOS_INVALIDOS');
      assert.equal(dao.plan.version, 1);
    });
  });
});

describe('ComandoAmpliarRetorno', () => {
  it('es un objeto inmutable con identidad y parámetros validados', () => {
    const ampliar = comando({ motivo: '  Lluvia fuerte  ' });

    assert.equal(ampliar.operacionId, OPERACION);
    assert.equal(ampliar.expedicionId, EXPEDICION);
    assert.equal(ampliar.senderistaId, PROPIETARIO);
    assert.equal(ampliar.versionEsperada, 1);
    assert.equal(ampliar.minutos, 30);
    assert.equal(ampliar.motivo, 'Lluvia fuerte');
    assert.ok(Object.isFrozen(ampliar));
  });
});
