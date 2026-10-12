import { ErrorAplicacion } from '../../shared/errors/ErrorAplicacion.js';
import type {
  EntradaIniciarSesion,
  EntradaRegistrarRescatista,
  EntradaRegistrarSenderista,
} from '../dto/autenticacion.dto.js';
import { RepositorioAutenticacionPostgres } from '../../infrastructure/repositories/RepositorioAutenticacionPostgres.js';
import { hashearContrasena, verificarContrasena } from '../../infrastructure/security/password.js';
import { firmarToken } from '../../infrastructure/security/jwt.js';

export type RespuestaAutenticacion = {
  token: string;
  usuario: {
    id: string;
    correoElectronico: string;
    rol: 'senderista' | 'rescatista';
    nombreCompleto: string | null;
  };
};

export class ServicioAutenticacion {
  constructor(private readonly repo = new RepositorioAutenticacionPostgres()) {}

  async registrarSenderista(entrada: EntradaRegistrarSenderista): Promise<RespuestaAutenticacion> {
    const existente = await this.repo.buscarUsuarioPorCorreo(entrada.correoElectronico);
    if (existente) {
      throw new ErrorAplicacion(400, 'El correo electrónico ya está registrado', 'CORREO_EXISTE');
    }

    const documentoExiste = await this.repo.existeDocumentoSenderista(entrada.idDocumento);
    if (documentoExiste) {
      throw new ErrorAplicacion(400, 'El DNI ya está registrado', 'DOCUMENTO_EXISTE');
    }

    const hashContrasena = await hashearContrasena(entrada.contrasena);

    const usuario = await this.repo.registrarSenderista({
      correoElectronico: entrada.correoElectronico,
      hashContrasena,
      nombreCompleto: entrada.nombreCompleto,
      idDocumento: entrada.idDocumento,
      telefono: entrada.telefono,
    });

    const token = firmarToken({ sub: usuario.id, rol: usuario.rol });

    return {
      token,
      usuario: {
        id: usuario.id,
        correoElectronico: usuario.correo_electronico,
        rol: usuario.rol,
        nombreCompleto: entrada.nombreCompleto,
      },
    };
  }

  async iniciarSesion(entrada: EntradaIniciarSesion): Promise<RespuestaAutenticacion> {
    const usuario = await this.repo.buscarUsuarioPorCorreo(entrada.correoElectronico);
    if (!usuario) {
      throw new ErrorAplicacion(401, 'Credenciales inválidas', 'CREDENCIALES_INVALIDAS');
    }

    const valida = await verificarContrasena(entrada.contrasena, usuario.hash_contrasena);
    if (!valida) {
      throw new ErrorAplicacion(401, 'Credenciales inválidas', 'CREDENCIALES_INVALIDAS');
    }

    const token = firmarToken({ sub: usuario.id, rol: usuario.rol });
    const nombreCompleto = await this.repo.obtenerNombreCompletoPerfil(usuario.id, usuario.rol);

    return {
      token,
      usuario: {
        id: usuario.id,
        correoElectronico: usuario.correo_electronico,
        rol: usuario.rol,
        nombreCompleto,
      },
    };
  }

  async registrarRescatista(entrada: EntradaRegistrarRescatista): Promise<RespuestaAutenticacion> {
    const credencial = await this.repo.buscarCredencialInstitucionalActiva(
      entrada.institucion,
      entrada.numeroCredencial,
      entrada.nombreCompleto,
      entrada.fechaNacimiento,
    );

    if (!credencial) {
      throw new ErrorAplicacion(
        403,
        'No se pudo validar la credencial institucional. Verifique institución, número, nombre y fecha de nacimiento.',
        'VALIDACION_CREDENCIAL_FALLIDA',
      );
    }

    const existente = await this.repo.buscarUsuarioPorCorreo(entrada.correoElectronico);
    if (existente) {
      throw new ErrorAplicacion(400, 'El correo electrónico ya está registrado', 'CORREO_EXISTE');
    }

    const hashContrasena = await hashearContrasena(entrada.contrasena);

    const usuario = await this.repo.registrarRescatista({
      correoElectronico: entrada.correoElectronico,
      hashContrasena,
      nombreCompleto: entrada.nombreCompleto,
      numeroCredencial: entrada.numeroCredencial,
      fechaNacimiento: entrada.fechaNacimiento,
    });

    const token = firmarToken({ sub: usuario.id, rol: usuario.rol });

    return {
      token,
      usuario: {
        id: usuario.id,
        correoElectronico: usuario.correo_electronico,
        rol: usuario.rol,
        nombreCompleto: entrada.nombreCompleto,
      },
    };
  }
}
