import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { PaginaAvisos, type FuentesAvisos } from './PaginaAvisos';
import type { Aviso } from '../services/avisos';

describe('FE-01 HU-37: Enlaces seguros en PaginaAvisos', () => {
  const expedicionId = 'exp-123-abc';

  it('los avisos de cancelación y recordatorio no enlazan a edición sino a cambios y expedición activa', async () => {
    const eventos = new EventTarget();
    const navegador = { onLine: true };
    const prevWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const prevNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

    Object.defineProperty(globalThis, 'window', { configurable: true, value: eventos });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navegador });

    const avisosMock: Aviso[] = [
      {
        id: 'aviso-1',
        expedicionId,
        eventoId: 'evt-1',
        tipo: 'cancelacion',
        titulo: 'Expedición cancelada',
        mensaje: 'La expedición ha sido cancelada.',
        leido: false,
        creadoEn: '2026-11-09T10:00:00Z',
      },
      {
        id: 'aviso-2',
        expedicionId,
        eventoId: 'evt-2',
        tipo: 'recordatorio',
        titulo: 'Recordatorio próximo',
        mensaje: 'Faltan 30 minutos.',
        leido: false,
        creadoEn: '2026-11-09T11:00:00Z',
      },
      {
        id: 'aviso-3',
        expedicionId,
        eventoId: 'evt-3',
        tipo: 'edicion',
        titulo: 'Plan modificado',
        mensaje: 'Se actualizaron datos.',
        leido: false,
        creadoEn: '2026-11-09T12:00:00Z',
      },
      {
        id: 'aviso-4',
        expedicionId,
        eventoId: 'evt-4',
        tipo: 'ampliacion',
        titulo: 'Retorno ampliado',
        mensaje: 'Se amplió el tiempo.',
        leido: true,
        creadoEn: '2026-11-09T13:00:00Z',
      },
    ];

    const fuentesMock: FuentesAvisos = {
      listarAvisos: async () => ({ datos: avisosMock }),
      marcarAvisoLeido: async (id: string) => ({
        datos: { ...avisosMock.find((a) => a.id === id)!, leido: true },
      }),
      marcarTodosLosAvisosLeidos: async () => ({ datos: { actualizados: 3 } }),
    };

    let arbol!: ReactTestRenderer;
    try {
      await act(async () => {
        arbol = create(
          <MemoryRouter>
            <PaginaAvisos fuentes={fuentesMock} />
          </MemoryRouter>,
        );
      });

      const enlaces = arbol.root.findAllByType('a');
      const hrefs = enlaces.map((e) => e.props.href);

      // 1. Debe haber enlace a "Ver cambios" para cada aviso con expedicionId
      const enlacesCambios = hrefs.filter((h) =>
        h.includes(`/senderista/expedicion/${expedicionId}/cambios`),
      );
      assert.strictEqual(enlacesCambios.length, 4, 'Los 4 avisos deben enlazar a Ver cambios');

      // 2. Solo el aviso de tipo "edicion" debe tener enlace a editar plan
      const enlacesEditar = hrefs.filter((h) =>
        h.includes(`/expediciones/${expedicionId}/editar`),
      );
      assert.strictEqual(enlacesEditar.length, 1, 'Solo el aviso de edición puede enlazar a editar');

      // 3. El aviso de recordatorio debe enlazar a la expedición activa
      const enlacesActiva = hrefs.filter((h) => h === '/senderista/expedicion/activa');
      assert.strictEqual(enlacesActiva.length, 1, 'El recordatorio debe enlazar a expedición activa');
    } finally {
      if (prevWindow) Object.defineProperty(globalThis, 'window', prevWindow);
      else Reflect.deleteProperty(globalThis, 'window');
      if (prevNavigator) Object.defineProperty(globalThis, 'navigator', prevNavigator);
      else Reflect.deleteProperty(globalThis, 'navigator');
    }
  });
});
