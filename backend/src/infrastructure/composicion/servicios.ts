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
import { ObtenerPlan } from '../../application/use-cases/ObtenerPlan.js';
import { EditarPlan } from '../../application/use-cases/EditarPlan.js';
import { CancelarPlan } from '../../application/use-cases/CancelarPlan.js';
import { AmpliarRetorno } from '../../application/use-cases/AmpliarRetorno.js';
import { AsignarResponsable } from '../../application/use-cases/AsignarResponsable.js';
import { AgregarEntradaBitacora } from '../../application/use-cases/AgregarEntradaBitacora.js';
import { ConsultarBitacoraIncidente } from '../../application/use-cases/ConsultarBitacoraIncidente.js';
import { RepositorioAutenticacionPostgres } from '../repositories/RepositorioAutenticacionPostgres.js';
import { RepositorioUsuario } from '../repositories/RepositorioUsuario.js';
import { RepositorioExpedicion } from '../repositories/RepositorioExpedicion.js';
import { RepositorioRescate } from '../repositories/RepositorioRescate.js';
import { RepositorioAlerta } from '../repositories/RepositorioAlerta.js';
import { RepositorioAuditoriaAccesoMedico } from '../repositories/RepositorioAuditoriaAccesoMedico.js';
import { RepositorioDespachoCorreo } from '../repositories/RepositorioDespachoCorreo.js';
import { RepositorioAvisosSupabase } from '../repositories/RepositorioAvisosSupabase.js';
import { ExpedicionDAOSupabase } from '../repositories/ExpedicionDAOSupabase.js';
import { IncidenteDAOSupabase } from '../repositories/IncidenteDAOSupabase.js';
import { BitacoraIncidenteDAOSupabase } from '../repositories/BitacoraIncidenteDAOSupabase.js';
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
  consultarBitacoraIncidente: ConsultarBitacoraIncidente;
  agregarEntradaBitacora: AgregarEntradaBitacora;
};

export function crearModuloRescate(
  dependencias: Partial<ModuloRescate> = {},
): ModuloRescate {
  let incidentes: IncidenteDAOSupabase | undefined;
  let bitacora: BitacoraIncidenteDAOSupabase | undefined;
  const obtenerIncidentes = () =>
    (incidentes ??= new IncidenteDAOSupabase(getSupabaseAdmin()));
  const obtenerBitacora = () =>
    (bitacora ??= new BitacoraIncidenteDAOSupabase(getSupabaseAdmin()));
  return {
    servicio:
      dependencias.servicio ??
      new ServicioRescate(
        new RepositorioRescate(),
        new RepositorioAlerta(),
        new RepositorioUsuario(),
        new RepositorioAuditoriaAccesoMedico(),
        obtenerIncidentes(),
        new RelojSistema(),
      ),
    asignarResponsable:
      dependencias.asignarResponsable ??
      new AsignarResponsable(obtenerIncidentes()),
    consultarBitacoraIncidente:
      dependencias.consultarBitacoraIncidente ??
      new ConsultarBitacoraIncidente(obtenerBitacora()),
    agregarEntradaBitacora:
      dependencias.agregarEntradaBitacora ??
      new AgregarEntradaBitacora(obtenerBitacora()),
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
      new RepositorioUsuario(),
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
