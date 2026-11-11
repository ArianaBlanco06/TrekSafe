/** Contrato de aplicación para el adaptador histórico; conserva las formas existentes. */
export type UsuarioBd = {
  id: string;
  correo_electronico: string;
  hash_contrasena: string;
  rol: 'senderista' | 'rescatista';
};
export type CredencialInstitucional = {
  institucion: string;
  numero_credencial: string;
  nombre_completo: string;
  fecha_nacimiento: string;
  esta_activo: boolean;
};
export interface IRepositorioAutenticacionPostgres {
  buscarUsuarioPorCorreo(correo: string): Promise<UsuarioBd | null>;
  buscarUsuarioPorId(usuarioId: string): Promise<UsuarioBd | null>;
  obtenerNombreCompletoPerfil(
    usuarioId: string,
    rol: 'senderista' | 'rescatista',
  ): Promise<string | null>;
  existeDocumentoSenderista(idDocumento: string): Promise<boolean>;
  buscarCredencialInstitucionalActiva(
    institucion: string,
    numeroCredencial: string,
    nombreCompleto: string,
    fechaNacimiento: string,
  ): Promise<CredencialInstitucional | null>;
  registrarSenderista(datos: {
    correoElectronico: string;
    hashContrasena: string;
    nombreCompleto: string;
    idDocumento: string;
    telefono: string;
  }): Promise<{
    id: string;
    correo_electronico: string;
    rol: 'senderista';
  }>;
  registrarRescatista(datos: {
    correoElectronico: string;
    hashContrasena: string;
    nombreCompleto: string;
    numeroCredencial: string;
    fechaNacimiento: string;
  }): Promise<{
    id: string;
    correo_electronico: string;
    rol: 'rescatista';
  }>;
}
