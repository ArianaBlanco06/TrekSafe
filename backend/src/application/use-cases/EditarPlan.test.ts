import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { ErrorEdicionPlan } from '../../domain/errors/ErrorEdicionPlan.js';
import type {
  ComandoEditarPlan,
  IExpedicionDAO,
  PlanExpedicion,
  ResultadoEdicionPlan,
} from '../../domain/repositories/IExpedicionDAO.js';
import type { IReloj } from '../../domain/services/IReloj.js';
import { errorHandler } from '../../shared/errors/errorHandler.js';
import { crearExpedicionSchema } from '../dto/usuario.dto.js';
import { EditarPlan } from './EditarPlan.js';
import { ObtenerPlan } from './ObtenerPlan.js';

const AHORA = '2030-01-15T12:00:00.000Z';
const PROPIETARIO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AJENO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EXPEDICION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONTACTO_PROPIO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CONTACTO_NUEVO = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CONTACTO_AJENO = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const OPERACION = '11111111-1111-4111-8111-111111111111';
const OTRA_OPERACION = '22222222-2222-4222-8222-222222222222';

class RelojFijo implements IReloj {
  constructor(private readonly instante: string) {}
  ahora(): Date {
    return new Date(this.instante);
  }
}

/** Doble de prueba con las mismas reglas que la RPC treksafe_editar_expedicion. */
class ExpedicionDAOEnMemoria implements IExpedicionDAO {
  readonly operaciones = new Map<string, ResultadoEdicionPlan & { senderistaId: string }>();
  llamadasEditar = 0;

  constructor(
    public plan: PlanExpedicion,
    private readonly reloj: IReloj,
    private readonly contactosDelPropietario: string[],
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
    const registrada = this.operaciones.get(operacionId);
    if (!registrada || registrada.id !== expedicionId || registrada.senderistaId !== senderistaId) {
      return null;
    }
    return { id: registrada.id, version: registrada.version };
  }

  async editarPlan(comando: ComandoEditarPlan): Promise<ResultadoEdicionPlan> {
    this.llamadasEditar++;
    const ahoraMs = this.reloj.ahora().getTime();

    if (this.plan.id !== comando.expedicionId || this.plan.senderistaId !== comando.senderistaId) {
      throw new ErrorEdicionPlan('EXPEDICION_NO_ENCONTRADA');
    }
    if (this.plan.estado !== 'programada') throw new ErrorEdicionPlan('PLAN_NO_EDITABLE');
    if (new Date(this.plan.horaInicio).getTime() <= ahoraMs) {
      throw new ErrorEdicionPlan('SALIDA_YA_INICIADA');
    }
    if (this.plan.version !== comando.versionEsperada) {
      throw new ErrorEdicionPlan('VERSION_OBSOLETA', this.plan.version);
    }
    if (comando.datos.idsContactos.some((id) => !this.contactosDelPropietario.includes(id))) {
      throw new ErrorEdicionPlan('CONTACTOS_INVALIDOS');
    }

    this.plan = { ...this.plan, ...structuredClone(comando.datos), version: this.plan.version + 1 };
    const resultado = { id: this.plan.id, version: this.plan.version };
    this.operaciones.set(comando.operacionId, { ...resultado, senderistaId: comando.senderistaId });
    return resultado;
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
    idsContactos: [CONTACTO_PROPIO],
    nombresAcompanantes: ['Ana Ríos'],
    ...cambios,
  };
}

function entradaValida(cambios: Record<string, unknown> = {}) {
  return {
    lugarInicio: 'Pashpa',
    lugarFin: 'Nevado Ishinca',
    coordenadasInicio: '-9.5105, -77.5275',
    coordenadasFin: '-9.0105, -77.6042',
    horaInicio: '2030-03-01T08:00:00.000Z',
    horaRetornoEstimada: '2030-03-02T17:00:00.000Z',
    minutosTolerancia: 45,
    idsContactos: [CONTACTO_NUEVO],
    nombresAcompanantes: ['Luis Paredes', 'Ana Ríos'],
    versionEsperada: 1,
    operacionId: OPERACION,
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

describe('EditarPlan', () => {
  let reloj: RelojFijo;
  let dao: ExpedicionDAOEnMemoria;
  let casoDeUso: EditarPlan;

  function preparar(plan: PlanExpedicion = planInicial(), instante = AHORA): void {
    reloj = new RelojFijo(instante);
    dao = new ExpedicionDAOEnMemoria(plan, reloj, [CONTACTO_PROPIO, CONTACTO_NUEVO]);
    casoDeUso = new EditarPlan(dao, reloj);
  }

  async function rechazo(
    entrada: unknown = entradaValida(),
    senderistaId = PROPIETARIO,
  ): Promise<{ estado: number; cuerpo: Record<string, unknown> }> {
    try {
      await casoDeUso.ejecutar(senderistaId, EXPEDICION, entrada);
    } catch (err) {
      return respuestaHttp(err);
    }
    return assert.fail('Se esperaba que la edición fuera rechazada');
  }

  beforeEach(() => preparar());

  describe('edición correcta', () => {
    it('incrementa la versión y devuelve el plan con los cambios', async () => {
      const resultado = await casoDeUso.ejecutar(PROPIETARIO, EXPEDICION, entradaValida());

      assert.equal(resultado.version, 2);
      assert.equal(resultado.lugarInicio, 'Pashpa');
      assert.equal(resultado.lugarFin, 'Nevado Ishinca');
      assert.equal(resultado.horaInicio, '2030-03-01T08:00:00.000Z');
      assert.equal(resultado.horaRetornoEstimada, '2030-03-02T17:00:00.000Z');
      assert.equal(resultado.minutosTolerancia, 45);
      assert.deepEqual(resultado.idsContactos, [CONTACTO_NUEVO]);
      assert.deepEqual(resultado.nombresAcompanantes, ['Luis Paredes', 'Ana Ríos']);
      assert.equal(dao.plan.version, 2);
    });

    it('queda programada aunque la salida esté a menos de un minuto', async () => {
      const resultado = await casoDeUso.ejecutar(
        PROPIETARIO,
        EXPEDICION,
        entradaValida({ horaInicio: '2030-01-15T12:00:30.000Z' }),
      );

      assert.equal(resultado.estado, 'programada');
    });

    it('normaliza coordenadas y horas antes de persistir', async () => {
      await casoDeUso.ejecutar(
        PROPIETARIO,
        EXPEDICION,
        entradaValida({ horaInicio: '2030-03-01T03:00:00-05:00' }),
      );

      assert.equal(dao.plan.coordenadasInicio, '-9.51050, -77.52750');
      assert.equal(dao.plan.horaInicio, '2030-03-01T08:00:00.000Z');
    });

    it('elimina las coordenadas cuando no se envían', async () => {
      preparar(planInicial({ coordenadasInicio: '-9.51050, -77.52750' }));

      await casoDeUso.ejecutar(
        PROPIETARIO,
        EXPEDICION,
        entradaValida({ coordenadasInicio: undefined }),
      );

      assert.equal(dao.plan.coordenadasInicio, null);
    });

    it('ignora contactos repetidos', async () => {
      await casoDeUso.ejecutar(
        PROPIETARIO,
        EXPEDICION,
        entradaValida({ idsContactos: [CONTACTO_NUEVO, CONTACTO_NUEVO] }),
      );

      assert.deepEqual(dao.plan.idsContactos, [CONTACTO_NUEVO]);
    });

    it('usa el reloj inyectado y no la hora real', async () => {
      preparar(
        planInicial({
          horaInicio: '2020-06-01T10:00:00.000Z',
          horaRetornoEstimada: '2020-06-01T18:00:00.000Z',
        }),
        '2020-01-01T00:00:00.000Z',
      );

      const resultado = await casoDeUso.ejecutar(
        PROPIETARIO,
        EXPEDICION,
        entradaValida({
          horaInicio: '2020-07-01T10:00:00.000Z',
          horaRetornoEstimada: '2020-07-01T18:00:00.000Z',
        }),
      );

      assert.equal(resultado.version, 2);
    });
  });

  describe('propietario', () => {
    it('un usuario ajeno recibe 404 y no se modifica nada', async () => {
      const antes = structuredClone(dao.plan);

      const { estado, cuerpo } = await rechazo(entradaValida(), AJENO);

      assert.equal(estado, 404);
      assert.equal(cuerpo.codigo, 'EXPEDICION_NO_ENCONTRADA');
      assert.deepEqual(dao.plan, antes);
      assert.equal(dao.llamadasEditar, 0);
    });

    it('una expedición inexistente recibe 404', async () => {
      preparar(planInicial({ id: 'otra-expedicion' }));

      assert.equal((await rechazo()).estado, 404);
    });
  });

  describe('estado', () => {
    for (const estadoPlan of ['en_progreso', 'alerta', 'completada']) {
      it(`un plan ${estadoPlan} recibe 409 y no se modifica`, async () => {
        preparar(planInicial({ estado: estadoPlan }));
        const antes = structuredClone(dao.plan);

        const { estado, cuerpo } = await rechazo();

        assert.equal(estado, 409);
        assert.equal(cuerpo.codigo, 'PLAN_NO_EDITABLE');
        assert.deepEqual(dao.plan, antes);
      });
    }
  });

  describe('salida', () => {
    it('una salida del plan ya pasada según el reloj recibe 422', async () => {
      preparar(planInicial(), '2030-02-01T10:00:01.000Z');
      const antes = structuredClone(dao.plan);

      const { estado, cuerpo } = await rechazo();

      assert.equal(estado, 422);
      assert.equal(cuerpo.codigo, 'SALIDA_YA_INICIADA');
      assert.deepEqual(dao.plan, antes);
    });

    it('una salida del plan exactamente igual al reloj recibe 422', async () => {
      preparar(planInicial(), '2030-02-01T10:00:00.000Z');

      assert.equal((await rechazo()).estado, 422);
    });

    it('una nueva hora de salida ya pasada recibe 422', async () => {
      const { estado, cuerpo } = await rechazo(
        entradaValida({ horaInicio: '2030-01-15T11:59:59.000Z' }),
      );

      assert.equal(estado, 422);
      assert.equal(cuerpo.codigo, 'SALIDA_EN_PASADO');
      assert.equal(dao.llamadasEditar, 0);
    });
  });

  describe('validación de datos', () => {
    it('un retorno anterior al inicio recibe 400', async () => {
      const { estado } = await rechazo(
        entradaValida({ horaRetornoEstimada: '2030-03-01T07:59:59.000Z' }),
      );

      assert.equal(estado, 400);
      assert.equal(dao.plan.version, 1);
    });

    it('un retorno igual al inicio recibe 400', async () => {
      const { estado } = await rechazo(
        entradaValida({ horaRetornoEstimada: '2030-03-01T08:00:00.000Z' }),
      );

      assert.equal(estado, 400);
    });

    it('coordenadas mal formadas reciben 400', async () => {
      assert.equal((await rechazo(entradaValida({ coordenadasInicio: 'no-coords' }))).estado, 400);
    });

    it('coordenadas fuera de Perú reciben 400', async () => {
      assert.equal(
        (await rechazo(entradaValida({ coordenadasFin: '40.7128, -74.0060' }))).estado,
        400,
      );
    });

    it('un contacto ajeno recibe 400 y no se modifica nada', async () => {
      const antes = structuredClone(dao.plan);

      const { estado, cuerpo } = await rechazo(entradaValida({ idsContactos: [CONTACTO_AJENO] }));

      assert.equal(estado, 400);
      assert.equal(cuerpo.codigo, 'CONTACTOS_INVALIDOS');
      assert.deepEqual(dao.plan, antes);
    });

    const invalidas: [string, Record<string, unknown>][] = [
      ['sin contactos', { idsContactos: [] }],
      ['sin acompañantes', { nombresAcompanantes: [] }],
      ['sin tolerancia', { minutosTolerancia: undefined }],
      ['tolerancia cero', { minutosTolerancia: 0 }],
      ['hora sin zona horaria', { horaInicio: '2030-03-01T08:00:00' }],
      ['lugar demasiado largo', { lugarFin: 'x'.repeat(501) }],
      ['sin versión esperada', { versionEsperada: undefined }],
      ['operación que no es UUID', { operacionId: 'no-uuid' }],
    ];
    for (const [nombre, cambios] of invalidas) {
      it(`${nombre} recibe 400`, async () => {
        assert.equal((await rechazo(entradaValida(cambios))).estado, 400);
        assert.equal(dao.llamadasEditar, 0);
      });
    }
  });

  describe('versión', () => {
    it('una versión obsoleta recibe 409 VERSION_OBSOLETA con la actual, sin modificar nada', async () => {
      preparar(planInicial({ version: 4 }));
      const antes = structuredClone(dao.plan);

      const { estado, cuerpo } = await rechazo(entradaValida({ versionEsperada: 3 }));

      assert.equal(estado, 409);
      assert.equal(cuerpo.codigo, 'VERSION_OBSOLETA');
      assert.equal(cuerpo.versionActual, 4);
      assert.deepEqual(dao.plan, antes);
      assert.equal(dao.llamadasEditar, 0);
    });

    it('traduce el conflicto que la persistencia detecta dentro de la transacción', async () => {
      dao.editarPlan = async () => {
        throw new ErrorEdicionPlan('VERSION_OBSOLETA', 9);
      };

      const { estado, cuerpo } = await rechazo();

      assert.equal(estado, 409);
      assert.equal(cuerpo.codigo, 'VERSION_OBSOLETA');
      assert.equal(cuerpo.versionActual, 9);
    });
  });

  describe('idempotencia', () => {
    it('un operacionId repetido no aplica dos veces', async () => {
      const primera = await casoDeUso.ejecutar(PROPIETARIO, EXPEDICION, entradaValida());
      const segunda = await casoDeUso.ejecutar(PROPIETARIO, EXPEDICION, entradaValida());

      assert.equal(primera.version, 2);
      assert.equal(segunda.version, 2);
      assert.equal(dao.llamadasEditar, 1);
      assert.equal(dao.plan.version, 2);
    });

    it('un reintento no da conflicto aunque el plan ya haya avanzado de versión', async () => {
      await casoDeUso.ejecutar(PROPIETARIO, EXPEDICION, entradaValida());
      await casoDeUso.ejecutar(
        PROPIETARIO,
        EXPEDICION,
        entradaValida({ versionEsperada: 2, operacionId: OTRA_OPERACION, lugarFin: 'Pisco' }),
      );

      const reintento = await casoDeUso.ejecutar(PROPIETARIO, EXPEDICION, entradaValida());

      assert.equal(reintento.version, 3);
      assert.equal(reintento.lugarFin, 'Pisco');
      assert.equal(dao.llamadasEditar, 2);
    });

    it('un reintento no falla aunque el cron ya haya activado el plan', async () => {
      await casoDeUso.ejecutar(PROPIETARIO, EXPEDICION, entradaValida());
      dao.plan = { ...dao.plan, estado: 'en_progreso' };

      await casoDeUso.ejecutar(PROPIETARIO, EXPEDICION, entradaValida());

      assert.equal(dao.llamadasEditar, 1);
    });

    it('la operación de un senderista no le sirve a otro', async () => {
      await casoDeUso.ejecutar(PROPIETARIO, EXPEDICION, entradaValida());

      assert.equal((await rechazo(entradaValida(), AJENO)).estado, 404);
    });
  });
});

describe('ObtenerPlan', () => {
  const dao = new ExpedicionDAOEnMemoria(planInicial(), new RelojFijo(AHORA), []);
  const casoDeUso = new ObtenerPlan(dao);

  it('devuelve el plan completo a su propietario', async () => {
    const plan = await casoDeUso.ejecutar(PROPIETARIO, EXPEDICION);

    assert.equal(plan.version, 1);
    assert.deepEqual(plan.idsContactos, [CONTACTO_PROPIO]);
    assert.deepEqual(plan.nombresAcompanantes, ['Ana Ríos']);
  });

  it('responde 404 a un usuario ajeno', async () => {
    await assert.rejects(casoDeUso.ejecutar(AJENO, EXPEDICION), (err) => {
      assert.equal(respuestaHttp(err).estado, 404);
      return true;
    });
  });
});

describe('crearExpedicionSchema tras extraer el objeto base', () => {
  const crear = {
    lugarInicio: 'Pashpa',
    lugarFin: 'Ishinca',
    horaInicio: '2030-03-01T08:00:00.000Z',
    horaRetornoEstimada: '2030-03-01T18:00:00.000Z',
    idsContactos: [CONTACTO_PROPIO],
    nombresAcompanantes: ['Ana Ríos'],
  };

  it('conserva la tolerancia por defecto', () => {
    assert.equal(crearExpedicionSchema.parse(crear).minutosTolerancia, 30);
  });

  it('sigue aceptando horas sin zona horaria', () => {
    assert.ok(
      crearExpedicionSchema.safeParse({
        ...crear,
        horaInicio: '2030-03-01T08:00:00',
        horaRetornoEstimada: '2030-03-01T18:00:00',
      }).success,
    );
  });

  it('sigue rechazando un retorno anterior a la salida', () => {
    assert.equal(
      crearExpedicionSchema.safeParse({ ...crear, horaRetornoEstimada: '2030-03-01T07:00:00.000Z' })
        .success,
      false,
    );
  });
});
