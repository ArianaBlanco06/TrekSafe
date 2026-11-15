import assert from 'node:assert/strict';
import React from 'react';
import { it } from 'node:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { AnfitrionRecordatorioSenderista } from '../../src/components/AnfitrionRecordatorioSenderista';
import { PaginaExpedicionActiva } from '../../src/pages/PaginaExpedicionActiva';

it('mide dos consumidores reales del mismo recurso durante ventanas visibles y ocultas de cinco minutos', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const storage = new Map([
    ['treksafe:token', 'token-ficticio'],
    ['treksafe:usuario', JSON.stringify({ id: 'cuenta-ficticia', rol: 'senderista' })],
    ['treksafe:offline-scope', 'fixture-medicion'],
  ]);
  const documentFixture = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  for (const [key, value] of Object.entries({
    document: documentFixture,
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key));
  }
  let solicitudes = 0;
  t.mock.method(globalThis, 'fetch', async () => { solicitudes += 1; return Response.json({ expedicion: null }); });
  let arbol!: ReactTestRenderer;
  t.after(async () => { if (arbol) await act(async () => arbol.unmount()); });
  await act(async () => { arbol = create(<MemoryRouter><AnfitrionRecordatorioSenderista /><PaginaExpedicionActiva /></MemoryRouter>); });
  const avance = async () => { for (let n = 0; n < 10; n += 1) await act(async () => t.mock.timers.tick(30_000)); };
  await avance();
  const visible = solicitudes;
  documentFixture.visibilityState = 'hidden';
  await act(async () => documentFixture.dispatchEvent(new Event('visibilitychange')));
  await avance();
  const oculto = solicitudes - visible;
  documentFixture.visibilityState = 'visible';
  await act(async () => documentFixture.dispatchEvent(new Event('visibilitychange')));
  const retornoVisible = solicitudes - visible - oculto;
  const resultado = { visible_5_min: visible, oculto_5_min: oculto, retorno_visible: retornoVisible, reloj: 'simulado; fetch local con respuesta vacía idéntica' };
  t.diagnostic(JSON.stringify(resultado));
  const baseline = process.env.TREKSAFE_MEDICION_BASELINE === '1';
  assert.deepEqual([visible, oculto, retornoVisible], baseline ? [22, 20, 0] : [11, 0, 1]);
});
