/** Roles de acceso segregados */
export type RolUsuario = 'senderista' | 'rescatista';

/** Ciclo de vida de una expedición */
export type EstadoExpedicion = 'programada' | 'en_progreso' | 'completada' | 'alerta';

/** Estados operativos de la bitácora de rescate */
export type EstadoRescate = 'en_busqueda' | 'localizados' | 'cerrado';

/** Semáforo de riesgo en consola de rescate */
export type NivelRiesgoExpedicion = 'verde' | 'amarillo' | 'rojo';

/** Tipos de despacho de correo */
export type TipoDespachoCorreo = 'alerta_contacto' | 'alerta_rescate';

export const ESTADOS_EXPEDICION_BLOQUEANTES: EstadoExpedicion[] = ['en_progreso', 'alerta'];
