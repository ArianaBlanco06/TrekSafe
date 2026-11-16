import assert from 'node:assert/strict';
import { it } from 'node:test';
import { ServicioExpedicion } from './servicioExpedicion.js';
import { ServicioNotificacionAlerta } from './servicioNotificacionAlerta.js';
import type { IRepositorioExpedicion } from '../ports/RepositorioExpedicion.js';
import type { IRepositorioUsuario } from '../ports/RepositorioUsuario.js';
import type { IRepositorioAutenticacionPostgres } from '../ports/RepositorioAutenticacionPostgres.js';
import type { IRepositorioAlerta } from '../ports/RepositorioAlerta.js';
import type { IRepositorioDespachoCorreo } from '../ports/RepositorioDespachoCorreo.js';

/** Un método no sustituido falla: la prueba no puede caer en un adaptador real. */
function puerto<T extends object>(parcial: Partial<T>): T {
  return new Proxy(parcial, {
    get(target, key) {
      if (!(key in target))
        throw new Error(`Método no previsto: ${String(key)}`);
      return Reflect.get(target, key);
    },
  }) as T;
}

it('crear expedición usa actor y reloj inyectados sin importar persistencia o contraseñas reales', async () => {
  const ahora = new Date('2030-01-01T10:00:00.000Z');
  const actores: string[] = [];
  let estadoPersistido: string | undefined;
  const repo = puerto<IRepositorioExpedicion>({
    tieneExpedicionBloqueante: async () => false,
    validarPropiedadContactos: async (actor) => {
      actores.push(actor);
    },
    crearExpedicion: async (actor, input) => {
      actores.push(actor);
      estadoPersistido = input.estado;
      return {
        id: 'expedicion',
        lugarInicio: input.lugarInicio,
        lugarFin: input.lugarFin,
        horaInicio: input.horaInicio,
        horaRetornoEstimada: input.horaRetornoEstimada,
        minutosTolerancia: input.minutosTolerancia,
        estado: input.estado,
        version: 1,
      };
    },
  });
  const usuario = puerto<IRepositorioUsuario>({
    verificarEsSenderista: async (actor) => {
      actores.push(actor);
    },
  });
  const servicio = new ServicioExpedicion(
    repo,
    usuario,
    puerto<IRepositorioAutenticacionPostgres>({}),
    async () => {
      throw new Error('No se verifica contraseña al crear');
    },
    { ahora: () => ahora },
  );
  const creada = await servicio.crearExpedicion('actor-jwt', {
    lugarInicio: 'Inicio',
    lugarFin: 'Destino',
    horaInicio: '2030-01-01T10:00:30.000Z',
    horaRetornoEstimada: '2030-01-01T14:00:00.000Z',
    minutosTolerancia: 30,
    minutosRecordatorio: 30,
    idsContactos: ['contacto'],
    nombresAcompanantes: ['Persona ficticia'],
  });
  assert.deepEqual(actores, ['actor-jwt', 'actor-jwt', 'actor-jwt']);
  assert.equal(estadoPersistido, 'en_progreso');
  assert.equal(creada.version, 1);
  assert.equal(creada.horaInicio, '2030-01-01T10:00:30.000Z');
  await assert.rejects(
    servicio.crearExpedicion('actor-jwt', {
      lugarInicio: 'Inicio',
      lugarFin: 'Destino',
      horaInicio: ahora.toISOString(),
      horaRetornoEstimada: '2030-01-01T14:00:00.000Z',
      minutosTolerancia: 30,
      minutosRecordatorio: 30,
      idsContactos: ['contacto'],
      nombresAcompanantes: ['Persona ficticia'],
    }),
    { codigo: 'HORA_INICIO_INVALIDA' },
  );
});

it('el transporte sustituido diferencia registro de desarrollo y envío sin guardar un despacho ficticio', async () => {
  for (const resultado of ['registrado', 'enviado'] as const) {
    let intentos = 0,
      despachos = 0;
    const alerta = puerto<IRepositorioAlerta>({
      buscarContextoAlerta: async () => ({
        expedicionId: 'expedicion',
        nombreCompletoSenderista: 'Persona ficticia',
        lugarInicio: 'Inicio',
        lugarFin: 'Destino',
        coordenadasInicio: null,
        coordenadasFin: null,
        horaRetornoEstimada: '2030-01-01T14:00:00Z',
        minutosTolerancia: 30,
        fechaLimite: '2030-01-01T14:30:00Z',
        contactos: [
          {
            nombreCompleto: 'Contacto ficticio',
            correoElectronico: 'prueba@example.invalid',
            parentesco: 'Amistad',
          },
          {
            nombreCompleto: 'Duplicado',
            correoElectronico: 'prueba@example.invalid',
            parentesco: 'Amistad',
          },
        ],
      }),
    });
    const servicio = new ServicioNotificacionAlerta(
      alerta,
      {
        enviar: async (mensaje) => {
          intentos++;
          assert.equal(mensaje.to, 'prueba@example.invalid');
          return resultado;
        },
        getModoTransporte: () =>
          resultado === 'registrado' ? 'dev-log' : 'smtp',
      },
      puerto<IRepositorioDespachoCorreo>({
        yaFueEnviado: async () => false,
        registrarEnvio: async () => {
          despachos++;
        },
      }),
    );
    const actual = await servicio.notificarContactosEmergencia('expedicion');
    assert.equal(intentos, 1);
    assert.equal(actual.enviados, resultado === 'enviado' ? 1 : 0);
    assert.equal(actual.registrados, resultado === 'registrado' ? 1 : 0);
    assert.equal(despachos, resultado === 'enviado' ? 1 : 0);
  }
});
