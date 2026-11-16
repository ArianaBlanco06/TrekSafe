import type { Page } from '@playwright/test';
import type { CuentaPublicada } from './configuracion';

/** Los errores de fill pueden incluir el valor escrito en el call log de Playwright. */
export async function rellenarAcceso(page: Pick<Page, 'getByLabel'>, cuenta: CuentaPublicada): Promise<void> {
  try {
    await page.getByLabel('Correo electrónico', { exact: true }).fill(cuenta.correo, { timeout: 10_000 });
    await page.getByLabel('Contraseña', { exact: true }).fill(cuenta.clave, { timeout: 10_000 });
  } catch {
    // Sin cause ni mensaje original: no transportar credenciales al reporter.
    throw new Error('No se pudo completar el formulario de acceso publicado.');
  }
}
