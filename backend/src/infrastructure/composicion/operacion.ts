import { RepositorioExpedicion } from '../repositories/RepositorioExpedicion.js';
import { VencimientosOutboxSupabase } from '../repositories/VencimientosOutboxSupabase.js';
import { ServicioRecordatorioExpedicion } from '../../application/services/servicioRecordatorioExpedicion.js';
import { RelojSistema } from '../services/RelojSistema.js';
import { crearServiciosAvisos } from './servicios.js';
import type { DependenciasPlazosOperativos } from '../../application/use-cases/ProcesarPlazosOperativos.js';

/** Ningún transporte externo se construye en el productor. */
export function crearDependenciasPlazosOperativos(): DependenciasPlazosOperativos {
  const expediciones = new RepositorioExpedicion();
  return {
    expediciones,
    vencimientos: new VencimientosOutboxSupabase(),
    recordatorios: new ServicioRecordatorioExpedicion(
      expediciones, crearServiciosAvisos().servicio, new RelojSistema(),
    ),
  };
}
