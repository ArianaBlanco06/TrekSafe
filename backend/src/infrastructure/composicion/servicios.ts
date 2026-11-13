import { ServicioAutenticacion } from '../../application/services/servicioAutenticacion.js';
import { ServicioUsuario } from '../../application/services/servicioUsuario.js';
import { ServicioExpedicion } from '../../application/services/servicioExpedicion.js';
import { ServicioRescate } from '../../application/services/servicioRescate.js';
import { ServicioNotificacionAlerta } from '../../application/services/servicioNotificacionAlerta.js';
import { ServicioAlertaRescate } from '../../application/services/servicioAlertaRescate.js';
import { ServicioRecordatorioExpedicion } from '../../application/services/servicioRecordatorioExpedicion.js';
import {
  GeneradorAvisosEvento,
  ServicioBandejaAvisos,
} from '../../application/services/servicioBandejaAvisos.js';
import { AvisadorCambiosPlan } from '../../application/services/AvisadorCambiosPlan.js';
import { FachadaEntregaAvisosIncidente } from '../../application/services/FachadaEntregaAvisosIncidente.js';
import { FachadaFichaMedicaIncidente } from '../../application/services/FachadaFichaMedicaIncidente.js';
import { ObtenerPlan } from '../../application/use-cases/ObtenerPlan.js';
import { EditarPlan } from '../../application/use-cases/EditarPlan.js';
import { CancelarPlan } from '../../application/use-cases/CancelarPlan.js';
import { AmpliarRetorno } from '../../application/use-cases/AmpliarRetorno.js';
import { AsignarResponsable } from '../../application/use-cases/AsignarResponsable.js';
import { ProponerRelevo } from '../../application/use-cases/ProponerRelevo.js';
import { AceptarRelevo } from '../../application/use-cases/AceptarRelevo.js';
import { RechazarRelevo } from '../../application/use-cases/RechazarRelevo.js';
import { CancelarRelevo } from '../../application/use-cases/CancelarRelevo.js';
import { AgregarEntradaBitacora } from '../../application/use-cases/AgregarEntradaBitacora.js';
import { ConsultarBitacoraIncidente } from '../../application/use-cases/ConsultarBitacoraIncidente.js';
import { CerrarIncidente } from '../../application/use-cases/CerrarIncidente.js';
import { ConsultarCierreIncidente } from '../../application/use-cases/ConsultarCierreIncidente.js';
import { MarcarIncidenteLocalizado } from '../../application/use-cases/MarcarIncidenteLocalizado.js';
import { RepositorioAutenticacionPostgres } from '../repositories/RepositorioAutenticacionPostgres.js';
import { RepositorioUsuario } from '../repositories/RepositorioUsuario.js';
import { RepositorioExpedicion } from '../repositories/RepositorioExpedicion.js';
import { RepositorioRescate } from '../repositories/RepositorioRescate.js';
import { RepositorioAlerta } from '../repositories/RepositorioAlerta.js';
import { RepositorioDespachoCorreo } from '../repositories/RepositorioDespachoCorreo.js';
import { RepositorioAvisosSupabase } from '../repositories/RepositorioAvisosSupabase.js';
import { RepositorioOutboxSupabase } from '../repositories/RepositorioOutboxSupabase.js';
import { ExpedicionDAOSupabase } from '../repositories/ExpedicionDAOSupabase.js';
import { IncidenteDAOSupabase } from '../repositories/IncidenteDAOSupabase.js';
import { BitacoraIncidenteDAOSupabase } from '../repositories/BitacoraIncidenteDAOSupabase.js';
import { CierreIncidenteDAOSupabase } from '../repositories/CierreIncidenteDAOSupabase.js';
import { FichaMedicaIncidenteDAOSupabase } from '../repositories/FichaMedicaIncidenteDAOSupabase.js';
import { DescifradorFichaMedicaAesGcm } from '../security/DescifradorFichaMedicaAesGcm.js';
import { RescatistasDAOSupabase } from '../repositories/RescatistasDAOSupabase.js';
import type { IRescatistasDAO } from '../../domain/repositories/IRescatistasDAO.js';
import { ServicioCorreo } from '../email/ServicioCorreo.js';
import { RelojSistema } from '../services/RelojSistema.js';
import {
  hashearContrasena,
  verificarContrasena,
} from '../security/password.js';
import { firmarToken } from '../security/jwt.js';
import { getSupabaseAdmin } from '../database/supabase.js';

/** Composición explícita: importar este módulo no construye servicios ni clientes. */
export function crearServicioAutenticacion() {
  return new ServicioAutenticacion(new RepositorioAutenticacionPostgres(), {
    hashearContrasena,
    verificarContrasena,
    firmarToken,
  });
}
export function crearServicioUsuario() {
  return new ServicioUsuario(new RepositorioUsuario());
}
export function crearServiciosAvisos() {
  const repo = new RepositorioAvisosSupabase();
  const servicio = new ServicioBandejaAvisos(repo);
  return {
    servicio,
    avisador: new AvisadorCambiosPlan(
      repo,
      new GeneradorAvisosEvento(servicio),
    ),
  };
}
export function crearModuloExpediciones() {
  const dao = new ExpedicionDAOSupabase(getSupabaseAdmin());
  const reloj = new RelojSistema();
  return {
    servicio: new ServicioExpedicion(
      new RepositorioExpedicion(),
      new RepositorioUsuario(),
      new RepositorioAutenticacionPostgres(),
      verificarContrasena,
      reloj,
    ),
    obtener: new ObtenerPlan(dao),
    editar: new EditarPlan(dao, reloj),
    cancelar: new CancelarPlan(dao, reloj),
    ampliar: new AmpliarRetorno(dao, reloj),
    avisador: crearServiciosAvisos().avisador,
  };
}
export type ModuloRescate = {
  servicio: ServicioRescate;
  asignarResponsable: AsignarResponsable;
  /** Relevo de la coordinación (HU-40): proponer, aceptar, rechazar y cancelar. */
  proponerRelevo: ProponerRelevo;
  aceptarRelevo: AceptarRelevo;
  rechazarRelevo: RechazarRelevo;
  cancelarRelevo: CancelarRelevo;
  /** Catálogo de rescatistas validados para elegir destinatario (HU-40). */
  rescatistas: IRescatistasDAO;
  consultarBitacoraIncidente: ConsultarBitacoraIncidente;
  agregarEntradaBitacora: AgregarEntradaBitacora;
  // HU-42: cierre del incidente con informe.
  cerrarIncidente: CerrarIncidente;
  marcarIncidenteLocalizado: MarcarIncidenteLocalizado;
  consultarCierreIncidente: ConsultarCierreIncidente;
  entregaAvisos: FachadaEntregaAvisosIncidente;
  fichaMedica: FachadaFichaMedicaIncidente; // HU-50
};

export function crearModuloRescate(
  dependencias: Partial<ModuloRescate> = {},
): ModuloRescate {
  let incidentes: IncidenteDAOSupabase | undefined;
  let bitacora: BitacoraIncidenteDAOSupabase | undefined;
  let cierre: CierreIncidenteDAOSupabase | undefined;
  let ficha: FichaMedicaIncidenteDAOSupabase | undefined;
  const obtenerIncidentes = () =>
    (incidentes ??= new IncidenteDAOSupabase(getSupabaseAdmin()));
  const obtenerBitacora = () =>
    (bitacora ??= new BitacoraIncidenteDAOSupabase(getSupabaseAdmin()));
  const obtenerCierre = () =>
    (cierre ??= new CierreIncidenteDAOSupabase(getSupabaseAdmin()));
  const obtenerFicha = () =>
    (ficha ??= new FichaMedicaIncidenteDAOSupabase(getSupabaseAdmin()));
  return {
    servicio:
      dependencias.servicio ??
      new ServicioRescate(
        new RepositorioRescate(),
        new RepositorioAlerta(),
        obtenerIncidentes(),
        new RelojSistema(),
      ),
    asignarResponsable:
      dependencias.asignarResponsable ??
      new AsignarResponsable(obtenerIncidentes()),
    proponerRelevo:
      dependencias.proponerRelevo ?? new ProponerRelevo(obtenerIncidentes()),
    aceptarRelevo:
      dependencias.aceptarRelevo ?? new AceptarRelevo(obtenerIncidentes()),
    rechazarRelevo:
      dependencias.rechazarRelevo ?? new RechazarRelevo(obtenerIncidentes()),
    cancelarRelevo:
      dependencias.cancelarRelevo ?? new CancelarRelevo(obtenerIncidentes()),
    rescatistas:
      dependencias.rescatistas ??
      new RescatistasDAOSupabase(getSupabaseAdmin()),
    consultarBitacoraIncidente:
      dependencias.consultarBitacoraIncidente ??
      new ConsultarBitacoraIncidente(obtenerBitacora()),
    agregarEntradaBitacora:
      dependencias.agregarEntradaBitacora ??
      new AgregarEntradaBitacora(obtenerBitacora()),
    // HU-42: un solo DAO compartido por los tres casos de uso.
    cerrarIncidente:
      dependencias.cerrarIncidente ?? new CerrarIncidente(obtenerCierre()),
    marcarIncidenteLocalizado:
      dependencias.marcarIncidenteLocalizado ??
      new MarcarIncidenteLocalizado(obtenerCierre()),
    consultarCierreIncidente:
      dependencias.consultarCierreIncidente ??
      new ConsultarCierreIncidente(obtenerCierre()),
    entregaAvisos:
      dependencias.entregaAvisos ??
      new FachadaEntregaAvisosIncidente(
        new RepositorioOutboxSupabase(),
        new RepositorioOutboxSupabase(),
      ),
    // HU-50: un solo DAO cumple los tres puertos (contexto, lectura cifrada y auditoría).
    fichaMedica:
      dependencias.fichaMedica ??
      new FachadaFichaMedicaIncidente(
        obtenerFicha(),
        obtenerFicha(),
        obtenerFicha(),
        new DescifradorFichaMedicaAesGcm(),
      ),
  };
}
export function crearDependenciasCron() {
  const repo = new RepositorioExpedicion();
  const correo = new ServicioCorreo();
  const alerta = new RepositorioAlerta();
  const despacho = new RepositorioDespachoCorreo();
  return {
    repo,
    alertasContacto: new ServicioNotificacionAlerta(alerta, correo, despacho),
    alertasRescate: new ServicioAlertaRescate(
      alerta,
      new RepositorioRescate(),
      correo,
      despacho,
    ),
    recordatorios: new ServicioRecordatorioExpedicion(
      repo,
      crearServiciosAvisos().servicio,
      new RelojSistema(),
    ),
    modoCorreo: correo.getModoTransporte(),
  };
}
