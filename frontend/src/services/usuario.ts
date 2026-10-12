import { api } from './clienteApi';

export type FichaMedica = {
  tipoSangre: string;
  alergias: string;
  condiciones: string;
  medicamentos: string;
  consentimientoFirmado: boolean;
};

export type ContactoEmergencia = {
  id: string;
  nombreCompleto: string;
  parentesco: string;
  telefono: string;
  correoElectronico: string;
};

export function obtenerFichaMedica() {
  return api.get<{ fichaMedica: FichaMedica | null }>('/usuario/ficha-medica', true);
}

export function guardarFichaMedica(datos: FichaMedica & { consentimientoFirmado: true }) {
  return api.put<{ mensaje: string; fichaMedica: FichaMedica }>(
    '/usuario/ficha-medica',
    {
      tipoSangre: datos.tipoSangre,
      alergias: datos.alergias,
      condiciones: datos.condiciones,
      medicamentos: datos.medicamentos,
      consentimientoFirmado: true,
    },
    true,
  );
}

export function obtenerContactos() {
  return api.get<{ contactos: ContactoEmergencia[] }>('/usuario/contactos', true);
}

export function crearContacto(datos: {
  nombreCompleto: string;
  parentesco: string;
  telefono: string;
  correoElectronico: string;
}) {
  return api.post<{ contacto: ContactoEmergencia }>('/usuario/contactos', datos, true);
}

export function eliminarContacto(contactoId: string) {
  return api.delete<{ mensaje: string }>(`/usuario/contactos/${contactoId}`, true);
}

export type AccionRevocacion = 'eliminar_personal' | 'anonimizar_rutas';

export function revocarDatosPersonales(accion: AccionRevocacion) {
  return api.post<{
    mensaje: string;
    accion: AccionRevocacion;
    medicoEliminado?: boolean;
    contactosEliminados?: number;
    expedicionesEliminadas?: number;
    expedicionesAnonimizadas?: number;
  }>('/usuario/privacidad/revocar', { accion, confirmar: true }, true);
}
