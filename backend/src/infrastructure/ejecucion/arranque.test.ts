import assert from 'node:assert/strict';
import { it } from 'node:test';
import { setImmediate as siguienteTurno } from 'node:timers/promises';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { iniciarApi } from '../../api.js';
import { iniciarWorker } from '../../worker.js';
import { iniciarCompatibilidad } from '../../main.js';
import { registrarSenales } from './cicloVida.js';

it('API atiende HTTP con dependencias inyectadas, sin SMTP ni tareas, y cierra una vez', async () => {
  const eventos: string[] = [];
  const app = express();
  app.get('/prueba', (_req, res) => res.json({ estado: 'ficticio' }));
  const api = await iniciarApi({
    port: 0,
    host: '127.0.0.1',
    verificarBase: async () => {
      eventos.push('base');
    },
    crearAplicacion: () => {
      eventos.push('http');
      return app;
    },
    cerrarRecursos: async () => {
      eventos.push('cerrar');
    },
  });
  try {
    const port = (api.servidor.address() as AddressInfo).port;
    assert.deepEqual(
      await (await fetch(`http://127.0.0.1:${port}/prueba`)).json(),
      { estado: 'ficticio' },
    );
  } finally {
    await Promise.all([api.detener(), api.detener()]);
  }
  assert.deepEqual(eventos, ['base', 'http', 'cerrar']);
  assert.equal(api.servidor.listening, false);
});

it('API libera recursos cuando falla la base o la construcción de la aplicación', async () => {
  for (const fase of ['base', 'http']) {
    let cierres = 0;
    await assert.rejects(
      iniciarApi({
        port: 0,
        verificarBase: async () => {
          if (fase === 'base') throw new Error('base ficticia');
        },
        crearAplicacion: () => {
          throw new Error('http ficticio');
        },
        cerrarRecursos: async () => {
          cierres++;
        },
      }),
      new RegExp(fase),
    );
    assert.equal(cierres, 1);
  }
});

it('API informa un puerto ocupado y libera recursos sin cerrar al servidor ajeno', async () => {
  const ocupante = express().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => ocupante.once('listening', resolve));
  let cierres = 0;
  try {
    await assert.rejects(
      iniciarApi({
        port: (ocupante.address() as AddressInfo).port,
        host: '127.0.0.1',
        verificarBase: async () => {},
        crearAplicacion: express,
        cerrarRecursos: async () => {
          cierres++;
        },
      }),
      { code: 'EADDRINUSE' },
    );
    assert.equal(cierres, 1);
    assert.equal(ocupante.listening, true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      ocupante.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it('worker desactivado no verifica DB/correo ni inicia tareas y cierra una sola vez', async () => {
  let cierres = 0;
  const noLlamar = async () => {
    throw new Error('No debe llamarse');
  };
  const worker = await iniciarWorker({
    habilitado: false,
    verificarBase: noLlamar,
    verificarCorreo: noLlamar,
    iniciarTareas: () => {
      throw new Error('No debe iniciar');
    },
    cerrarRecursos: async () => {
      cierres++;
    },
  });
  await Promise.all([worker.detener(), worker.detener()]);
  assert.equal(cierres, 1);
});

it('worker espera las tareas antes de cerrar recursos, sin abrir HTTP', async () => {
  const eventos: string[] = [];
  let liberar!: () => void;
  const pendiente = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  const worker = await iniciarWorker({
    habilitado: true,
    verificarBase: async () => {
      eventos.push('base');
    },
    verificarCorreo: async () => {
      eventos.push('correo');
    },
    iniciarTareas: () => {
      eventos.push('tareas');
      return async () => {
        await pendiente;
        eventos.push('fin-tareas');
      };
    },
    cerrarRecursos: async () => {
      eventos.push('cerrar');
    },
  });
  const cierre = worker.detener();
  await siguienteTurno();
  assert.deepEqual(eventos, ['base', 'correo', 'tareas']);
  liberar();
  await cierre;
  await worker.detener();
  assert.deepEqual(eventos, [
    'base',
    'correo',
    'tareas',
    'fin-tareas',
    'cerrar',
  ]);
});

it('worker no inicia tareas si falla DB o correo, y limpia recursos', async () => {
  for (const fase of ['base', 'correo']) {
    let cierres = 0;
    let tareas = 0;
    await assert.rejects(
      iniciarWorker({
        habilitado: true,
        verificarBase: async () => {
          if (fase === 'base') throw new Error(fase);
        },
        verificarCorreo: async () => {
          throw new Error(fase);
        },
        iniciarTareas: () => {
          tareas++;
          return async () => {};
        },
        cerrarRecursos: async () => {
          cierres++;
        },
      }),
      new RegExp(fase),
    );
    assert.equal(tareas, 0);
    assert.equal(cierres, 1);
  }
});

it('dos señales durante el cierre no duplican la parada y se retiran los listeners', async () => {
  const inicialInt = process.listenerCount('SIGINT');
  const inicialTerm = process.listenerCount('SIGTERM');
  let llamadas = 0;
  let liberar!: () => void;
  const pendiente = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  const limpiar = registrarSenales(async () => {
    llamadas++;
    await pendiente;
  });
  try {
    process.emit('SIGTERM');
    process.emit('SIGINT');
    assert.equal(llamadas, 1);
    liberar();
    await siguienteTurno();
    assert.equal(process.listenerCount('SIGINT'), inicialInt);
    assert.equal(process.listenerCount('SIGTERM'), inicialTerm);
  } finally {
    limpiar();
  }
});

it('arranque compatible limpia recursos al fallar DB/correo o HTTP después de iniciar tareas', async () => {
  for (const fase of ['base', 'correo', 'api']) {
    const eventos: string[] = [];
    await assert.rejects(
      iniciarCompatibilidad({
        verificarBase: async () => {
          eventos.push('base');
          if (fase === 'base') throw new Error(fase);
        },
        verificarCorreo: async () => {
          eventos.push('correo');
          if (fase === 'correo') throw new Error(fase);
        },
        iniciarWorker: async () => {
          eventos.push('worker');
          return {
            detener: async () => {
              eventos.push('fin-worker');
            },
          };
        },
        iniciarApi: async () => {
          throw new Error(fase);
        },
        cerrarRecursos: async () => {
          eventos.push('cerrar');
        },
      }),
      new RegExp(fase),
    );
    assert.equal(eventos.filter((e) => e === 'cerrar').length, 1);
    assert.equal(eventos.includes('fin-worker'), fase === 'api');
  }
});

it('cierre compatible detiene ambos programas y libera recursos incluso si una parada falla', async () => {
  const eventos: string[] = [];
  const compatible = await iniciarCompatibilidad({
    verificarBase: async () => {},
    verificarCorreo: async () => {},
    iniciarWorker: async () => ({
      detener: async () => {
        eventos.push('worker');
        throw new Error('fallo cierre');
      },
    }),
    iniciarApi: async () => ({
      detener: async () => {
        eventos.push('api');
      },
    }),
    cerrarRecursos: async () => {
      eventos.push('cerrar');
    },
  });
  const primero = compatible.detener();
  assert.equal(compatible.detener(), primero);
  await assert.rejects(primero, /fallo cierre/);
  assert.deepEqual(eventos, ['worker', 'api', 'cerrar']);
});
