import assert from 'node:assert/strict';
import { it } from 'node:test';
import { guardarArchivoDescargado } from './guardarArchivoDescargado';

it('HU-48: solicita la descarga y libera el enlace y Blob tras entregarlo al navegador', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const anterior = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let clics = 0, retiradas = 0;
  const enlace = { href: '', download: '', click: () => { clics++; }, remove: () => { retiradas++; } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => enlace, body: { appendChild: (e: unknown) => assert.equal(e, enlace) },
  } });
  t.after(() => { if (anterior) Object.defineProperty(globalThis, 'document', anterior); else Reflect.deleteProperty(globalThis, 'document'); });
  const crear = t.mock.method(URL, 'createObjectURL', () => 'blob:fixture');
  const revocar = t.mock.method(URL, 'revokeObjectURL', () => {});
  const contenido = new Blob(['CSV'], { type: 'text/csv' });
  guardarArchivoDescargado({ contenido, nombre: 'incidentes.csv' });
  assert.equal(crear.mock.calls[0].arguments[0], contenido);
  assert.equal(enlace.href, 'blob:fixture'); assert.equal(enlace.download, 'incidentes.csv');
  assert.equal(clics, 1); assert.equal(retiradas, 1); assert.equal(revocar.mock.callCount(), 0);
  t.mock.timers.tick(1000); assert.equal(revocar.mock.callCount(), 1);
});
