import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FullConfig, FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/** Reporta resultados, nunca errores, pasos, adjuntos o salida cruda de una sesión privada. */
export default class ReporteroSeguro implements Reporter {
  private readonly pruebas: object[] = [];
  private metadata: object = {};
  private erroresEjecutor = 0;
  private readonly archivo: string;

  constructor(opciones: { outputFile?: string } = {}) {
    this.archivo = path.resolve(opciones.outputFile ?? './test-results/publicado/resultados.json');
  }

  printsToStdio() { return true; }

  onBegin(config: FullConfig) {
    const m = config.metadata;
    this.metadata = {
      entorno: m.entorno, frontendUrl: m.frontendUrl, apiUrl: m.apiUrl,
      commitDeclarado: m.commitDeclarado, esquemaDeclarado: m.esquemaDeclarado, alcance: m.alcance,
    };
  }

  onTestEnd(prueba: TestCase, resultado: TestResult) {
    this.pruebas.push({
      titulo: prueba.title, proyecto: prueba.parent.project()?.name,
      estado: resultado.status, estadoEsperado: prueba.expectedStatus,
      duracionMs: resultado.duration, reintento: resultado.retry,
      ...(resultado.errors.length ? { diagnostico: 'Fallo; detalles privados omitidos del informe.' } : {}),
    });
    process.stdout.write(`${resultado.status}: ${prueba.title}\n`);
  }

  onError() {
    this.erroresEjecutor += 1;
    process.stderr.write('Error del ejecutor publicado; detalles privados omitidos.\n');
  }

  // Incluso DEBUG o una dependencia podrían emitir credenciales. No reenviar esa salida.
  onStdOut() {}
  onStdErr() {}

  onEnd(resultado: FullResult) {
    mkdirSync(path.dirname(this.archivo), { recursive: true });
    writeFileSync(this.archivo, JSON.stringify({
      estado: resultado.status, duracionMs: resultado.duration, metadata: this.metadata,
      erroresEjecutor: this.erroresEjecutor, pruebas: this.pruebas,
      privacidad: 'Sin errores, pasos, adjuntos, stdout o stderr crudos; sin trazas, capturas ni video.',
    }, null, 2) + '\n');
    process.stdout.write(`Resultado publicado: ${resultado.status}; ${this.pruebas.length} pruebas.\n`);
  }
}
