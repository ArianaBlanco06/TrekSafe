/** Identidades de negocio; el adaptador conserva los detalles de persistencia. */
export type UsuarioAutenticacion = {
  id: string;
  correoElectronico: string;
  hashContrasena: string;
  rol: 'senderista' | 'rescatista';
};
export type CredencialInstitucional = {
  institucion: string;
  numeroCredencial: string;
  nombreCompleto: string;
  fechaNacimiento: string;
  estaActivo: boolean;
};
export interface IRepositorioAutenticacionPostgres {
  buscarUsuarioPorCorreo(correo: string): Promise<UsuarioAutenticacion | null>;
  buscarUsuarioPorId(usuarioId: string): Promise<UsuarioAutenticacion | null>;
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
    correoElectronico: string;
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
    correoElectronico: string;
    rol: 'rescatista';
  }>;
}
