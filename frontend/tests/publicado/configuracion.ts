import { readFileSync } from 'node:fs';

type Entorno = Record<string, string | undefined>;
export type CuentaPublicada = { correo: string; clave: string };
export type ConfiguracionPublicada = {
  entorno: 'academico'; frontendUrl: string; apiUrl: string; commit: string; esquema: string;
  modo: 'lectura' | 'aceptacion';
  cuentas?: { senderistaA: CuentaPublicada; senderistaB: CuentaPublicada; rescatista: CuentaPublicada };
};

/** Contrato compartido con el roadmap. Nunca imprime valores de credenciales ni el manifiesto. */
export function leerConfiguracionPublicada(env: Entorno = process.env): ConfiguracionPublicada {
  let manifiesto: Record<string, unknown> = {};
  if (env.TREKSAFE_PUBLICADO_MANIFIESTO) {
    try { manifiesto = JSON.parse(readFileSync(env.TREKSAFE_PUBLICADO_MANIFIESTO, 'utf8')) as Record<string, unknown>; }
    catch { throw new Error('No se pudo leer el manifiesto publicado: debe ser JSON válido y accesible.'); }
    if (!manifiesto || typeof manifiesto !== 'object' || Array.isArray(manifiesto)) throw new Error('El manifiesto publicado debe ser un objeto JSON.');
  }
  const valor = (clave: string, campo: string): string => {
    const resultado = env[`TREKSAFE_PUBLICADO_${clave}`] ?? manifiesto[campo];
    if (typeof resultado !== 'string' || !resultado.trim()) throw new Error(`Falta TREKSAFE_PUBLICADO_${clave} o ${campo} en el manifiesto; no se ejecutaron comprobaciones publicadas.`);
    return resultado.trim();
  };
  const url = (clave: string, campo: string) => {
    const texto = valor(clave, campo);
    let resultado: URL;
    try { resultado = new URL(texto); } catch { throw new Error(`${campo} debe ser una URL HTTPS pública válida.`); }
    const host = resultado.hostname.toLowerCase();
    if (resultado.protocol !== 'https:' || resultado.username || resultado.password || resultado.search || resultado.hash
      || host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || host.includes(':')
      || /^\d+(?:\.\d+){3}$/.test(host) || !host.includes('.') || host.endsWith('.local') || host.endsWith('.invalid')) {
      throw new Error(`${campo} debe identificar un dominio HTTPS público, sin credenciales, consulta ni fragmento.`);
    }
    return resultado.href.replace(/\/$/, '');
  };
  if (valor('ENTORNO', 'entorno') !== 'academico') throw new Error('El manifiesto debe identificar explícitamente entorno=academico.');
  const commit = valor('COMMIT', 'commit');
  if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error('commit debe ser el SHA completo de 40 caracteres publicado.');
  const modo = env.TREKSAFE_PUBLICADO_MODO ?? 'aceptacion';
  if (modo !== 'lectura' && modo !== 'aceptacion') throw new Error('TREKSAFE_PUBLICADO_MODO debe ser lectura o aceptacion.');
  const config: ConfiguracionPublicada = {
    entorno: 'academico', frontendUrl: url('FRONTEND_URL', 'frontendUrl'), apiUrl: url('API_URL', 'apiUrl'),
    commit, esquema: valor('ESQUEMA', 'esquema'), modo,
  };
  if (new URL(config.frontendUrl).pathname !== '/') throw new Error('frontendUrl debe ser el origen público de la aplicación.');
  if (modo === 'aceptacion') {
    if (env.TREKSAFE_PUBLICADO_PERMITIR_ESCRITURAS !== '1' || env.TREKSAFE_PUBLICADO_CUENTAS_FICTICIAS !== '1') {
      throw new Error('La prueba autenticada requiere los opt-ins TREKSAFE_PUBLICADO_PERMITIR_ESCRITURAS=1 y TREKSAFE_PUBLICADO_CUENTAS_FICTICIAS=1. Incluye POST de login.');
    }
    const cuenta = (prefijo: string): CuentaPublicada => {
      const correo = env[`TREKSAFE_PUBLICADO_${prefijo}_CORREO`];
      const clave = env[`TREKSAFE_PUBLICADO_${prefijo}_CLAVE`];
      if (!correo || !clave) throw new Error(`Faltan las credenciales ficticias ${prefijo}_CORREO/CLAVE en variables de entorno.`);
      return { correo, clave };
    };
    config.cuentas = { senderistaA: cuenta('SENDERISTA_A'), senderistaB: cuenta('SENDERISTA_B'), rescatista: cuenta('RESCATISTA') };
    if (config.cuentas.senderistaA.correo === config.cuentas.senderistaB.correo) throw new Error('Las cuentas ficticias senderista A y B deben ser distintas.');
  }
  return config;
}
