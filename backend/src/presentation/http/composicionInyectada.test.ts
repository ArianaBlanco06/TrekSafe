import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { crearRutasUsuario } from './routes/rutasUsuario.js';
import { ServicioUsuario } from '../../application/services/servicioUsuario.js';
import type { IRepositorioUsuario } from '../../application/ports/RepositorioUsuario.js';
import { firmarToken } from '../../infrastructure/security/jwt.js';
import { iniciarApi } from '../../api.js';

Object.assign(process.env, {
  NODE_ENV: 'test',
  SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_SERVICE_ROLE_KEY: 'ficticia',
  JWT_SECRET: 'jwt-prueba-inyeccion-00000000000000000000',
  MEDICAL_ENCRYPTION_KEY: 'medico-prueba-inyeccion-00000000000',
  CRON_ENABLED: 'false',
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
