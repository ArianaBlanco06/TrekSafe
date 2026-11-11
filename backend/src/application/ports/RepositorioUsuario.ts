/** Contrato de aplicación para el adaptador histórico; conserva las formas existentes. */
import type { CargaUtilMedica } from '../../domain/value-objects/CargaUtilMedica.js';
export type ContactoResumen = {
  id: string;
  nombreCompleto: string;
  parentesco: string;
  telefono: string;
  correoElectronico: string;
};
export interface IRepositorioUsuario {
  verificarEsSenderista(usuarioId: string): Promise<void>;
  actualizarFichaMedica(
    senderistaId: string,
    tipoSangre: string,
    condicionesEncriptadas: string,
  ): Promise<void>;
  obtenerFichaMedica(senderistaId: string): Promise<{
    tipoSangre: string;
    carga: CargaUtilMedica;
    consentimientoFirmado: boolean;
  } | null>;
  encriptarCarga(carga: CargaUtilMedica): string;
  listarContactos(senderistaId: string): Promise<ContactoResumen[]>;
  crearContacto(
    senderistaId: string,
    contacto: {
      nombreCompleto: string;
      parentesco: string;
      telefono: string;
      correoElectronico: string;
    },
  ): Promise<ContactoResumen>;
  eliminarContacto(senderistaId: string, contactoId: string): Promise<void>;
  tieneExpedicionBloqueante(senderistaId: string): Promise<boolean>;
  eliminarDatosPersonales(senderistaId: string): Promise<{
    fichaMedicaEliminada: boolean;
    contactosEliminados: number;
    expedicionesEliminadas: number;
    cuentaEliminada: boolean;
  }>;
  anonimizarHistorialRutas(senderistaId: string): Promise<{
    expedicionesAnonimizadas: number;
  }>;
}
