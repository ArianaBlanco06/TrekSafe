import { expect, type Page } from '@playwright/test';

/** Recorre el aviso del login como una persona, sin forzar clics detrás del modal. */
export async function cerrarAyudaInstalacion(page: Page): Promise<void> {
  const ayuda = page.getByRole('dialog', { name: 'TrekSafe en tu pantalla de inicio', exact: true });
  await expect(ayuda).toBeVisible();
  await ayuda.getByRole('button', { name: 'Entendido', exact: true }).click();
  await expect(ayuda).not.toBeVisible();
}
