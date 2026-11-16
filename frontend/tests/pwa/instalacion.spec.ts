import { expect, test } from '@playwright/test';
import { cerrarAyudaInstalacion } from '../helpers/ayudaInstalacion.js';

test('instalación: el aviso del navegador se cierra y reaparece al volver a entrar', async ({ page }) => {
  await page.goto('/iniciar-sesion');
  await cerrarAyudaInstalacion(page);
  await page.getByLabel('Correo electrónico', { exact: true }).fill('cuenta-a@example.invalid');
  await page.getByRole('button', { name: 'Cómo instalar TrekSafe', exact: true }).click();
  const ayuda = page.getByRole('dialog', { name: 'TrekSafe en tu pantalla de inicio', exact: true });
  await expect(ayuda).toBeVisible();
  await ayuda.getByRole('button', { name: 'Cerrar instrucciones de instalación', exact: true }).click();
  await expect(ayuda).not.toBeVisible();
  await page.reload();
  await cerrarAyudaInstalacion(page);
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
});

test('instalación: navigator.standalone simulado oculta la ayuda en modo app', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }));
  await page.goto('/iniciar-sesion');
  // El formulario acredita que React ya montó el login; no se instala una PWA física.
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cómo instalar TrekSafe', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
