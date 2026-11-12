import { loadEnv } from '../../infrastructure/config/env.js';
import { cronHealth } from '../../infrastructure/jobs/cronState.js';
import { ServicioCorreo } from '../../infrastructure/email/ServicioCorreo.js';
import { crearRutasAutenticacion } from '../../presentation/http/routes/rutasAutenticacion.js';
import { crearRutasExpedicion } from '../../presentation/http/routes/rutasExpedicion.js';
import { ensamblarModuloPlantillas } from '../../infrastructure/composicion/moduloPlantillas.js';
import { crearRutasPlantillas } from '../../presentation/http/routes/rutasPlantillas.js';
import { crearRutasRescate } from '../../presentation/http/routes/rutasRescate.js';
import { crearRutasUsuario } from '../../presentation/http/routes/rutasUsuario.js';
import { crearRutasPuntosRuta } from '../../presentation/http/routes/rutasPuntosRuta.js';
import { crearServicioPuntosRuta } from '../../infrastructure/composicion/puntosRuta.js';
import { RepositorioAvancesExpedicion } from '../../infrastructure/repositories/RepositorioAvancesExpedicion.js';
import { RegistrarAvance } from '../../application/use-cases/RegistrarAvance.js';
import { crearRutasAvancesExpedicion } from '../../presentation/http/routes/rutasAvancesExpedicion.js';
import { RepositorioPuntosRuta } from '../../infrastructure/repositories/RepositorioPuntosRuta.js';
import { ExpedicionDAOSupabase } from '../../infrastructure/repositories/ExpedicionDAOSupabase.js';
import { FachadaPlanExpedicion } from '../../application/services/FachadaPlanExpedicion.js';
import { crearRutasRecorrido } from '../../presentation/http/routes/rutasRecorrido.js';
import { crearRutasListasEquipo } from '../../presentation/http/routes/rutasListasEquipo.js';
import { ServicioListasEquipo } from '../../application/services/servicioListasEquipo.js';
import { RepositorioListasEquipoSupabase } from '../../infrastructure/repositories/RepositorioListasEquipoSupabase.js';
import { getSupabaseAdmin } from '../../infrastructure/database/supabase.js';
import { ServicioPreparacionExpedicion } from '../../application/services/servicioPreparacionExpedicion.js';
import { RepositorioPreparacionExpedicionSupabase } from '../../infrastructure/repositories/RepositorioPreparacionExpedicionSupabase.js';
import { crearRutasPreparacionExpedicion } from '../../presentation/http/routes/rutasPreparacionExpedicion.js';
import { CreadorDesdeHistorial } from '../../application/creacion-plan/CreadorDesdeHistorial.js';
import { DAOContactosVigentesSupabase } from '../../infrastructure/repositories/DAOContactosVigentesSupabase.js';
import { HistorialExpedicionesDAOSupabase } from '../../infrastructure/repositories/HistorialExpedicionesDAOSupabase.js';
import { crearRutasRepetirExpedicion } from '../../presentation/http/routes/rutasRepetirExpedicion.js';
import { ConsultarHistorialCambios } from '../../application/use-cases/ConsultarHistorialCambios.js';
import { EventosPlanDAOSupabase } from '../../infrastructure/repositories/EventosPlanDAOSupabase.js';
import { PropiedadExpedicionSupabase } from '../../infrastructure/repositories/PropiedadExpedicionSupabase.js';
import { crearRutasHistorialCambios } from '../../presentation/http/routes/rutasHistorialCambios.js';
import { crearRutasAvisos } from '../../presentation/http/routes/rutasAvisos.js';

import type { Router } from 'express';
import type { DependenciasHttp } from '../../presentation/http/app.js';

export function ensamblarHttp(): DependenciasHttp {
  const env = loadEnv();
  const rutas: DependenciasHttp['rutas'] = [];
  const registrar = (prefijo: string, router: Router) =>
    rutas.push({ prefijo, router });
  registrar('/auth', crearRutasAutenticacion());
  const servicioEquipo = new ServicioListasEquipo(
    new RepositorioListasEquipoSupabase(getSupabaseAdmin()),
  );
  registrar('/usuario/listas-equipo', crearRutasListasEquipo(servicioEquipo));
  registrar('/usuario', crearRutasUsuario());
  registrar('/expediciones', crearRutasPuntosRuta(crearServicioPuntosRuta()));
  const avances = new RepositorioAvancesExpedicion(getSupabaseAdmin());
  registrar(
    '/expediciones',
    crearRutasAvancesExpedicion(
      (orden) => new RegistrarAvance(orden, avances),
      avances,
    ),
  );
  const servicioPreparacion = new ServicioPreparacionExpedicion(
    new RepositorioPreparacionExpedicionSupabase(getSupabaseAdmin()),
  );
  registrar(
    '/expediciones',
    crearRutasRecorrido(
      new FachadaPlanExpedicion(
        new ExpedicionDAOSupabase(getSupabaseAdmin()),
        new RepositorioPuntosRuta(getSupabaseAdmin()),
        servicioPreparacion,
      ),
    ),
  );
  registrar(
    '/expediciones',
    crearRutasPreparacionExpedicion(servicioPreparacion),
  );
  const creadorDesdeHistorial = new CreadorDesdeHistorial(
    new DAOContactosVigentesSupabase(getSupabaseAdmin()),
    new HistorialExpedicionesDAOSupabase(getSupabaseAdmin()),
  );
  registrar(
    '/expediciones',
    crearRutasRepetirExpedicion(creadorDesdeHistorial),
  );
  const consultarHistorialCambios = new ConsultarHistorialCambios(
    new PropiedadExpedicionSupabase(getSupabaseAdmin()),
    new EventosPlanDAOSupabase(getSupabaseAdmin()),
  );
  registrar(
    '/expediciones',
    crearRutasHistorialCambios(consultarHistorialCambios),
  );
  registrar('/expediciones', crearRutasExpedicion());
  registrar('/plantillas', crearRutasPlantillas(ensamblarModuloPlantillas()));
  registrar('/rescate', crearRutasRescate());
  registrar('/avisos', crearRutasAvisos());

  return {
    config: { apiPrefix: env.apiPrefix, corsOrigin: env.corsOrigin },
    rutas,
    salud: () => {
      const correo = new ServicioCorreo();
      return {
        estado: 'ok',
        servicio: 'treksafe-api',
        correo: {
          configurado: correo.estaConfigurado(),
          modo: correo.getModoTransporte(),
        },
        cron: cronHealth,
      };
    },
  };
}
