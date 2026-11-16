import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { crearRutasUsuario } from './routes/rutasUsuario.js';
import { ServicioUsuario } from '../../application/services/servicioUsuario.js';
import type { IRepositorioUsuario } from '../../application/ports/RepositorioUsuario.js';
import { firmarToken } from '../../infrastructure/security/jwt.js';
import { iniciarApi } from '../../api.js';
import { ServicioExpedicion } from '../../application/services/servicioExpedicion.js';
import { ServicioAutenticacion } from '../../application/services/servicioAutenticacion.js';
import type { IRepositorioExpedicion } from '../../application/ports/RepositorioExpedicion.js';
import type { IRepositorioAutenticacionPostgres } from '../../application/ports/RepositorioAutenticacionPostgres.js';
import { crearRutasExpedicion } from './routes/rutasExpedicion.js';
import { crearRutasAutenticacion } from './routes/rutasAutenticacion.js';

Object.assign(process.env, {
  NODE_ENV: 'test',
  SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'ficticia',
  JWT_SECRET: 'jwt-prueba-inyeccion-00000000000000000000',
  MEDICAL_ENCRYPTION_KEY: 'medico-prueba-inyeccion-00000000000',
  CRON_ENABLED: 'false',
});

it('lecturas normalizadas preservan el JSON público de expediciones, retorno y autenticación', async () => {
  const lectura = {
    id: 'expedicion', lugarInicio: 'Inicio', lugarFin: 'Destino',
    horaInicio: '2030-01-01T10:00:00Z', horaRetornoEstimada: '2030-01-01T14:00:00Z',
    minutosTolerancia: 30, estado: 'en_progreso', version: 2,
    creadoEn: '2030-01-01T08:00:00Z', actualizadoEn: '2030-01-01T15:00:00Z',
  };
  const actores: string[] = [];
  const repoExpedicion: Partial<IRepositorioExpedicion> = {
    listarExpediciones: async () => [lectura],
    buscarActivaPorSenderista: async () => ({
      ...lectura, acompanantes: ['Acompañante ficticio'],
      contactos: [{ nombreCompleto: 'Contacto ficticio', correoElectronico: 'contacto@example.invalid' }],
      cantidadAmpliaciones: 1,
    }),
    buscarPorIdParaSenderista: async () => lectura,
    completarConfirmacionRetorno: async () => ({ ...lectura, estado: 'completada' }),
  };
  const repoUsuario: Partial<IRepositorioUsuario> = {
    verificarEsSenderista: async (actor) => { actores.push(actor); },
  };
  const usuario = { id: 'actor-jwt', correoElectronico: 'ficticio@example.invalid', hashContrasena: 'hash-ficticio', rol: 'senderista' as const };
  const repoAuth: Partial<IRepositorioAutenticacionPostgres> = {
    buscarUsuarioPorId: async () => usuario,
    buscarUsuarioPorCorreo: async () => usuario,
    obtenerNombreCompletoPerfil: async () => 'Persona ficticia',
  };
  const verificar = async (_texto: string, hash: string) => {
    assert.equal(hash, 'hash-ficticio');
    return true;
  };
  const servicio = new ServicioExpedicion(
    repoExpedicion as IRepositorioExpedicion, repoUsuario as IRepositorioUsuario,
    repoAuth as IRepositorioAutenticacionPostgres, verificar, { ahora: () => new Date('2030-01-01T15:00:00Z') },
  );
  const auth = new ServicioAutenticacion(repoAuth as IRepositorioAutenticacionPostgres, {
    hashearContrasena: async () => { throw new Error('No se registra en esta prueba'); },
    verificarContrasena: verificar,
    firmarToken,
  });
  // Las operaciones de edición no se ejecutan en esta regresión de lecturas/retorno.
  const modulo = { servicio } as Parameters<typeof crearRutasExpedicion>[0];
  const app = createApp({
    config: { apiPrefix: '/api', corsOrigin: '*' },
    rutas: [
      { prefijo: '/expediciones', router: crearRutasExpedicion(modulo) },
      { prefijo: '/auth', router: crearRutasAutenticacion(auth) },
    ],
    salud: () => ({}),
  });
  const api = await iniciarApi({
    port: 0, host: '127.0.0.1', verificarBase: async () => {},
    crearAplicacion: () => app, cerrarRecursos: async () => {},
  });
  const base = `http://127.0.0.1:${(api.servidor.address() as AddressInfo).port}/api`;
  const headers = { Authorization: `Bearer ${firmarToken({ sub: 'actor-jwt', rol: 'senderista' })}`, 'Content-Type': 'application/json' };
  try {
    const listado = await fetch(`${base}/expediciones`, { headers });
    assert.equal(listado.status, 200);
    assert.deepEqual(await listado.json(), { expediciones: [lectura] });
    const activa = await fetch(`${base}/expediciones/activa`, { headers });
    assert.equal(activa.status, 200);
    assert.deepEqual(await activa.json(), { expedicion: {
      id: lectura.id, lugarInicio: lectura.lugarInicio, lugarFin: lectura.lugarFin,
      horaInicio: lectura.horaInicio, horaRetornoEstimada: lectura.horaRetornoEstimada,
      minutosTolerancia: 30, fechaLimite: '2030-01-01T14:30:00.000Z', estado: 'en_progreso', version: 2,
      cantidadAcompanantes: 1, cantidadContactos: 1, acompanantes: ['Acompañante ficticio'],
      contactos: [{ nombreCompleto: 'Contacto ficticio', correoElectronico: 'contacto@example.invalid' }],
      ampliacionesRestantes: 0,
    } });
    const retorno = await fetch(`${base}/expediciones/expedicion/confirmar-retorno`, {
      method: 'POST', headers, body: JSON.stringify({ contrasena: 'Ficticia123' }),
    });
    assert.equal(retorno.status, 200);
    assert.deepEqual(await retorno.json(), {
      mensaje: 'Retorno seguro registrado', expedicion: { ...lectura, estado: 'completada' },
      confirmadoEn: lectura.actualizadoEn,
    });
    const login = await fetch(`${base}/auth/iniciar-sesion`, {
      method: 'POST', headers, body: JSON.stringify({ correoElectronico: usuario.correoElectronico, contrasena: 'Ficticia123' }),
    });
    assert.equal(login.status, 200);
    const resultado = await login.json() as { token: string; usuario: unknown };
    assert.equal(typeof resultado.token, 'string');
    assert.deepEqual(resultado.usuario, { id: 'actor-jwt', correoElectronico: usuario.correoElectronico, rol: 'senderista', nombreCompleto: 'Persona ficticia' });
    assert.deepEqual(actores, ['actor-jwt', 'actor-jwt', 'actor-jwt']);
  } finally {
    await api.detener();
  }
});

it('el ensamblaje HTTP inyectado conserva JWT/roles y usa al actor autenticado sin Supabase', async () => {
  const actores: string[] = [];
  const repo = new Proxy(
    {
      verificarEsSenderista: async (id: string) => {
        actores.push(id);
      },
      listarContactos: async (id: string) => [
        {
          id: 'contacto',
          nombreCompleto: id,
          parentesco: 'Amistad',
          telefono: '999999999',
          correoElectronico: 'contacto@example.invalid',
        },
      ],
    },
    {
      get(target, key) {
        if (!(key in target))
          throw new Error(`Método no previsto: ${String(key)}`);
        return Reflect.get(target, key);
      },
    },
  ) as IRepositorioUsuario;
  const app = createApp({
    config: { apiPrefix: '/api', corsOrigin: 'https://prueba.example.invalid' },
    rutas: [
      {
        prefijo: '/usuario',
        router: crearRutasUsuario(new ServicioUsuario(repo)),
      },
    ],
    salud: () => ({ estado: 'ficticio' }),
  });
  const api = await iniciarApi({
    port: 0,
    host: '127.0.0.1',
    verificarBase: async () => {},
    crearAplicacion: () => app,
    cerrarRecursos: async () => {},
  });
  const base = `http://127.0.0.1:${(api.servidor.address() as AddressInfo).port}/api`;
  try {
    assert.equal((await fetch(`${base}/usuario/contactos`)).status, 401);
    const rescate = firmarToken({ sub: 'rescatista', rol: 'rescatista' });
    assert.equal(
      (
        await fetch(`${base}/usuario/contactos`, {
          headers: { Authorization: `Bearer ${rescate}` },
        })
      ).status,
      403,
    );
    const senderista = firmarToken({ sub: 'actor-jwt', rol: 'senderista' });
    const response = await fetch(
      `${base}/usuario/contactos?senderistaId=otro`,
      { headers: { Authorization: `Bearer ${senderista}` } },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(
      ((await response.json()) as { contactos: { nombreCompleto: string }[] })
        .contactos[0]?.nombreCompleto,
      'actor-jwt',
    );
    assert.deepEqual(actores, ['actor-jwt']);
  } finally {
    await api.detener();
  }
});
