import assert from 'node:assert/strict';
import { beforeEach, it, mock } from 'node:test';
import { AmpliarRetorno } from '../../application/use-cases/AmpliarRetorno.js';
import { ComandoAmpliarRetorno } from '../../application/commands/ComandoAmpliarRetorno.js';
import type { ServicioAlertaRescate } from '../../application/services/servicioAlertaRescate.js';
import type { ServicioNotificacionAlerta } from '../../application/services/servicioNotificacionAlerta.js';
import { calcularFechaLimite } from '../../domain/entities/Expedicion.js';
import { ErrorAmpliacionRetorno } from '../../domain/errors/ErrorAmpliacionRetorno.js';
import type {
  IExpedicionDAO,
  PlanExpedicion,
  ResultadoAmpliacionRetorno,
  SolicitudAmpliacionRetorno,
} from '../../domain/repositories/IExpedicionDAO.js';
import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import { RepositorioExpedicion } from '../repositories/RepositorioExpedicion.js';
import { RelojSistema } from '../services/RelojSistema.js';
import { ejecutarTickFechaLimite } from './cronFechaLimiteExpedicion.js';

// HU-35: ampliar el retorno y el cron no deben pisarse.
// Solo configuración ficticia y un cliente Supabase en memoria; nunca consulta una base.
// La vía RPC del cron se probó en SQL (PGlite); aquí se ejercita la alternativa en
// TypeScript, que es la que tenía la carrera (riesgo R4 del análisis).
const entornoFicticio = {
  SUPABASE_URL: 'https://dev-test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-ficticia-no-usar',
  JWT_SECRET: 'jwt-ficticio-exclusivo-pruebas-00000000',
  MEDICAL_ENCRYPTION_KEY: 'medico-ficticio-exclusivo-pruebas-0000',
};
for (const [nombre, valor] of Object.entries(entornoFicticio)) process.env[nombre] ??= valor;

type Fila = {
  id: string;
  senderista_id: string;
  estado: string;
  hora_inicio: string;
  hora_retorno_estimada: string;
  minutos_tolerancia: number;
  version: number;
  actualizado_en?: string;
};

const PROPIETARIO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPERACION = '11111111-1111-4111-8111-111111111111';

/** El cron usa el reloj real; las filas se arman relativas a él. */
const haceMinutos = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();
const sumarMinutos = (iso: string, minutos: number) =>
  new Date(new Date(iso).getTime() + minutos * 60_000).toISOString();

/**
 * Subconjunto del query builder de supabase-js que usa el cron (mismo criterio que
 * cronFechaLimiteExpedicion.canceladas.test.ts): evalúa de verdad los filtros sobre
 * filas en memoria, incluida la igualdad de la hora que añadió HU-35.
 */
class ConsultaFalsa implements PromiseLike<{ data: unknown; error: null }> {
  private readonly filtros: ((fila: Fila) => boolean)[] = [];
  private valores: Partial<Fila> | null = null;
  private unica = false;

  constructor(
    private readonly filas: Fila[],
    private readonly alLeer: () => void,
  ) {}

  select(): this {
    return this;
  }
  update(valores: Partial<Fila>): this {
    this.valores = valores;
    return this;
  }
  eq(columna: keyof Fila, valor: unknown): this {
    this.filtros.push((fila) => fila[columna] === valor);
    return this;
  }
  in(columna: keyof Fila, valores: unknown[]): this {
    this.filtros.push((fila) => valores.includes(fila[columna]));
    return this;
  }
  lte(columna: keyof Fila, valor: string): this {
    this.filtros.push((fila) => Date.parse(String(fila[columna])) <= Date.parse(valor));
    return this;
  }
  order(): this {
    return this;
  }
  limit(): this {
    return this;
  }
  maybeSingle(): this {
    this.unica = true;
    return this;
  }

  then<R1, R2>(
    resolver?: ((valor: { data: unknown; error: null }) => R1 | PromiseLike<R1>) | null,
    rechazar?: ((motivo: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const coincidentes = this.filas.filter((fila) => this.filtros.every((f) => f(fila)));
    if (this.valores) {
      for (const fila of coincidentes) Object.assign(fila, this.valores);
    } else {
      this.alLeer();
    }
    const copia = coincidentes.map((fila) => ({ ...fila }));
    const data = this.unica ? (copia[0] ?? null) : copia;
    return Promise.resolve({ data, error: null }).then(resolver, rechazar);
  }
}

function repositorioConFilas(filas: Fila[], alLeer: () => void = () => undefined) {
  const cliente = {
    from: (tabla: string) => {
      assert.equal(tabla, 'expediciones');
      return new ConsultaFalsa(filas, alLeer);
    },
    // Sin la función SQL, el repositorio usa su alternativa en TypeScript.
    rpc: async () => ({ data: null, error: { message: 'function does not exist' } }),
  };
  const repo = new RepositorioExpedicion();
  Object.assign(repo, { supabase: cliente });
  return repo;
}

/**
 * DAO sobre las mismas filas que ve el cron, con las reglas de la RPC 007 que importan
 * aquí: estado, límite con el reloj y compare-and-swap de la hora.
 */
class DAOSobreFilas implements IExpedicionDAO {
  constructor(private readonly filas: Fila[]) {}

  async obtenerPlan(expedicionId: string, senderistaId: string): Promise<PlanExpedicion | null> {
    const f = this.filas.find((x) => x.id === expedicionId && x.senderista_id === senderistaId);
    if (!f) return null;
    return {
      id: f.id,
      senderistaId: f.senderista_id,
      lugarInicio: 'A',
      lugarFin: 'B',
      coordenadasInicio: null,
      coordenadasFin: null,
      horaInicio: f.hora_inicio,
      horaRetornoEstimada: f.hora_retorno_estimada,
      minutosTolerancia: f.minutos_tolerancia,
      estado: f.estado,
      version: f.version,
      idsContactos: [],
      nombresAcompanantes: [],
    };
  }
  async buscarOperacionRegistrada() {
    return null;
  }
  async editarPlan(): Promise<never> {
    throw new Error('no aplica');
  }
  async cancelarPlan(): Promise<never> {
    throw new Error('no aplica');
  }
  async contarAmpliaciones() {
    return 0;
  }
  async ampliarRetorno(s: SolicitudAmpliacionRetorno): Promise<ResultadoAmpliacionRetorno> {
    const f = this.filas.find((x) => x.id === s.expedicionId)!;
    if (f.estado === 'alerta') throw new ErrorAmpliacionRetorno('ALERTA_YA_DECLARADA');
    if (Date.now() >= Date.parse(calcularFechaLimite(f.hora_retorno_estimada, f.minutos_tolerancia))) {
      throw new ErrorAmpliacionRetorno('PLAZO_VENCIDO');
    }
    f.hora_retorno_estimada = sumarMinutos(f.hora_retorno_estimada, s.minutos);
    f.version += 1;
    return {
      id: f.id,
      version: f.version,
      horaRetornoEstimada: f.hora_retorno_estimada,
      fechaLimite: calcularFechaLimite(f.hora_retorno_estimada, f.minutos_tolerancia),
    };
  }
}

function ampliar(filas: Fila[], id: string, minutos = 30) {
  return new AmpliarRetorno(new DAOSobreFilas(filas), new RelojSistema()).ejecutar(
    ComandoAmpliarRetorno.crear(PROPIETARIO, id, {
      versionEsperada: 1,
      operacionId: OPERACION,
      minutos,
      motivo: 'Demora por nieve',
    }),
  );
}

let notificadas: string[];
const alertasContacto = {
  notificarContactosEmergencia: async (id: string) => {
    notificadas.push(id);
    return { enviados: 1, registrados: 0 };
  },
} as unknown as ServicioNotificacionAlerta;
const alertasRescate = {
  notificarEquiposRescate: async (id: string) => {
    notificadas.push(id);
    return { enviados: 1, registrados: 0 };
  },
} as unknown as ServicioAlertaRescate;

let errores: unknown[][];
beforeEach(() => {
  notificadas = [];
  errores = [];
  mock.restoreAll();
  mock.method(console, 'error', (...args: unknown[]) => errores.push(args));
});

function fila(id: string, retornoHaceMin: number, tolerancia = 30): Fila {
  return {
    id,
    senderista_id: PROPIETARIO,
    estado: 'en_progreso',
    hora_inicio: haceMinutos(300),
    hora_retorno_estimada: haceMinutos(retornoHaceMin),
    minutos_tolerancia: tolerancia,
    version: 1,
  };
}

it('tras ampliar antes del límite, el tick no alerta ni notifica', async () => {
  // Retorno hace 29 min con 30 de tolerancia: queda 1 minuto.
  const filas = [fila('ampliada', 29)];

  const resultado = await ampliar(filas, 'ampliada');
  assert.ok(Date.parse(resultado.fechaLimite) > Date.now());

  const tick = await ejecutarTickFechaLimite(repositorioConFilas(filas), alertasContacto, alertasRescate);

  assert.equal(tick.enAlerta, 0);
  assert.deepEqual(notificadas, []);
  assert.equal(filas[0]?.estado, 'en_progreso');
});

it('si el cron declaró la alerta primero, la ampliación se rechaza con 409 ALERTA_YA_DECLARADA', async () => {
  // Retorno hace 31 min con 30 de tolerancia: ya venció.
  const filas = [fila('vencida', 31)];

  const tick = await ejecutarTickFechaLimite(repositorioConFilas(filas), alertasContacto, alertasRescate);
  assert.equal(tick.enAlerta, 1);

  await assert.rejects(ampliar(filas, 'vencida'), (err) => {
    assert.ok(err instanceof ErrorAplicacion);
    assert.equal(err.codigoEstado, 409);
    assert.equal(err.codigo, 'ALERTA_YA_DECLARADA');
    return true;
  });
  assert.equal(filas[0]?.estado, 'alerta');
});

it('el fallback no alerta una fila ampliada entre su lectura y su escritura (R4)', async () => {
  // El fallback lee la fila con la hora vieja (ya vencida para él) y, antes de su UPDATE,
  // se confirma una ampliación. El UPDATE exige la hora leída, así que no la marca.
  const filas = [fila('carrera', 31), fila('control', 31)];
  const horaLeida = filas[0]!.hora_retorno_estimada;
  let lecturas = 0;
  const repo = repositorioConFilas(filas, () => {
    if (++lecturas === 1) {
      queueMicrotask(() => {
        filas[0]!.hora_retorno_estimada = sumarMinutos(horaLeida, 30);
        filas[0]!.version = 2;
      });
    }
  });

  const ids = await repo.marcarEnProgresoExpiradaComoAlerta();

  assert.deepEqual(ids, ['control']);
  assert.equal(filas[0]?.estado, 'en_progreso');
  assert.equal(filas[0]?.actualizado_en, undefined);
  assert.equal(filas[1]?.estado, 'alerta');
});

it('el fallback registra el fallo de la RPC en lugar de ignorarlo', async () => {
  await repositorioConFilas([]).marcarEnProgresoExpiradaComoAlerta();

  assert.equal(errores.length, 1);
  assert.match(String(errores[0]?.[0]), /treksafe_marcar_expiradas_en_progreso_como_alerta/);
  assert.equal(errores[0]?.[1], 'function does not exist');
});

it('control: con la RPC disponible no usa el fallback ni registra errores', async () => {
  const repo = new RepositorioExpedicion();
  Object.assign(repo, {
    supabase: {
      rpc: async () => ({ data: ['x'], error: null }),
      from: () => assert.fail('no debe consultar la tabla'),
    },
  });

  assert.deepEqual(await repo.marcarEnProgresoExpiradaComoAlerta(), ['x']);
  assert.equal(errores.length, 0);
});
