import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import type { Page } from '@playwright/test';
import type { FullConfig, FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { rellenarAcceso } from './rellenarAcceso';
import ReporteroSeguro from './reporteroSeguro';

const cuenta = { correo: 'persona-ficticia@example.invalid', clave: 'ficticia-qa-no-secreto' };
const falloCrudo = `locator.fill: Timeout. Call log: fill("${cuenta.clave}"); correo=${cuenta.correo}`;

it('el fallo de cualquiera de los campos de acceso no transporta correo o clave al error', async () => {
  for (const campoFallido of ['Correo electrónico', 'Contraseña']) {
    const pagina = { getByLabel(nombre: string) {
      return { async fill() { if (nombre === campoFallido) throw new Error(falloCrudo); } };
    } } as unknown as Pick<Page, 'getByLabel'>;
    await assert.rejects(rellenarAcceso(pagina, cuenta), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, 'No se pudo completar el formulario de acceso publicado.');
      assert.equal(error.cause, undefined);
      assert.equal(String(error.stack).includes(cuenta.clave), false);
      assert.equal(String(error.stack).includes(cuenta.correo), false);
      return true;
    });
  }
});

it('el reporter publicado conserva un fallo sin exponer errores, pasos, adjuntos ni salida cruda', (t) => {
  const carpeta = mkdtempSync(path.join(tmpdir(), 'treksafe-reporte-privado-'));
  t.after(() => rmSync(carpeta, { recursive: true, force: true }));
  const archivo = path.join(carpeta, 'resultado.json');
  const salida: string[] = [];
  t.mock.method(process.stdout, 'write', (texto: unknown) => { salida.push(String(texto)); return true; });
  t.mock.method(process.stderr, 'write', (texto: unknown) => { salida.push(String(texto)); return true; });
  const reportero = new ReporteroSeguro({ outputFile: archivo });
  reportero.onBegin({ metadata: { entorno: 'academico', commitDeclarado: 'a'.repeat(40),
    cuentas: cuenta } } as unknown as FullConfig);
  // Un timeout global o una dependencia puede entregar el error crudo aunque el helper lo oculte.
  const interfaz: Reporter = reportero;
  interfaz.onStdOut?.(falloCrudo, undefined, undefined);
  interfaz.onStdErr?.(falloCrudo, undefined, undefined);
  interfaz.onError?.({ message: falloCrudo });
  reportero.onTestEnd({ title: 'Acceso académico controlado', expectedStatus: 'passed',
    parent: { project: () => ({ name: 'publicado-parcial' }) } } as unknown as TestCase, {
    status: 'failed', duration: 1, retry: 0, errors: [{ message: falloCrudo }],
    stdout: [falloCrudo], stderr: [falloCrudo],
    steps: [{ title: falloCrudo }], attachments: [{ body: Buffer.from(falloCrudo) }],
  } as unknown as TestResult);
  reportero.onEnd({ status: 'failed', duration: 1 } as FullResult);
  const contenido = readFileSync(archivo, 'utf8');
  for (const texto of [contenido, salida.join('\n')]) {
    assert.equal(texto.includes(cuenta.clave), false);
    assert.equal(texto.includes(cuenta.correo), false);
    assert.equal(texto.includes('locator.fill'), false);
  }
  const resultado = JSON.parse(contenido) as { estado: string; pruebas: { estado: string }[] };
  assert.equal(resultado.estado, 'failed');
  assert.equal(resultado.pruebas[0].estado, 'failed', 'ocultar datos no convierte el fallo en aprobación');
});
