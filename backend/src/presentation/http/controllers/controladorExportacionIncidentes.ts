import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { DescargaReporteIncidentes, ExportarReporteIncidentes } from '../../../application/use-cases/ExportarReporteIncidentes.js';
import type { SolicitudAutenticada } from '../middleware/middlewareAutenticacion.js';

export function crearControladorExportacionIncidentes(caso: ExportarReporteIncidentes) {
  return async (req: Request, res: Response): Promise<void> => {
    const control = new AbortController();
    const alCerrar = () => { if (!res.writableFinished) control.abort(); };
    res.once('close', alCerrar);
    let descarga: DescargaReporteIncidentes | undefined;
    try {
      descarga = await caso.ejecutar((req as SolicitudAutenticada).user.id, req.query);
      if (control.signal.aborted || res.destroyed) return;
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${descarga.nombreArchivo}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      // pipeline respeta la contrapresión y destruye la respuesta si el recorrido
      // falla después de empezar. El cliente debe rechazar ese cuerpo truncado.
      await pipeline(Readable.from(descarga.contenido), res, { signal: control.signal });
    } catch (error) {
      if (!res.headersSent && !res.destroyed) throw error;
    } finally {
      res.off('close', alCerrar);
      await descarga?.cancelar();
    }
  };
}
