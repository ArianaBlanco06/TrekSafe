import path from 'node:path';
import { test, expect } from '@playwright/test';
import { validarHu28Dev } from '../../../backend/src/testing/validacionHu28Dev';
import { isoADatetimeLocal } from '../../src/lib/fechaLocal';

test('HU-28: PWA, login, API y persistencia reales en Supabase DEV', async ({ page, context }, info) => {
  expect(process.env.HU28_DEV_RUN, 'Ejecutar únicamente con HU28_DEV_RUN=1 y backend/.env de DEV.').toBe('1');
  const resultado = await validarHu28Dev({
    permitirDev: true, carpetaSalida: info.outputPath('evidencia'),
    informar: (mensaje) => console.log(`[HU-28 DEV] ${mensaje}`),
    verificarInterfaz: async ({ origenWeb, origenId, destinoOriginal, cuentas, contrasena, directorioEvidencia, fechas }) => {
      // El navegador nunca envía credenciales a otra API ni consulta servicios de mapas externos.
      await context.route('**/*', async (ruta) => {
        const url = new URL(ruta.request().url());
        if (url.origin === origenWeb) await ruta.continue();
        else await ruta.abort();
      });
      const capturas: string[] = [];
      async function capturar(nombre: string) {
        const archivo = path.join(directorioEvidencia, nombre);
        await page.screenshot({ path: archivo, fullPage: true });
        capturas.push(archivo);
      }
      async function login(indice: number) {
        await page.goto(`${origenWeb}/iniciar-sesion`);
        await page.getByLabel('Correo electrónico', { exact: true }).fill(cuentas[indice].correo);
        await page.getByLabel('Contraseña', { exact: true }).fill(contrasena);
        await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
        await expect(page).toHaveURL(`${origenWeb}/senderista`);
      }
      await login(0);
      await page.goto(`${origenWeb}/senderista/perfil/historial`);
      await expect(page.getByText(destinoOriginal, { exact: true })).toBeVisible();
      await capturar('01-historial-dev.png');
      await page.getByRole('link', { name: `Repetir expedición a ${destinoOriginal}`, exact: true }).click();
      await expect(page.getByText('Ruta cargada desde tu historial', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Destino / Nevado', { exact: true })).toHaveValue(destinoOriginal);
      await expect(page.getByLabel('Fecha y hora de salida', { exact: true })).toHaveValue('');
      await expect(page.getByLabel('Retorno estimado', { exact: true })).toHaveValue('');
      await page.getByRole('button', { name: 'Editar coordenadas manualmente' }).click();
      await expect(page.getByLabel('Coordenadas de salida', { exact: true })).toHaveValue('-9.04700, -77.60900');
      await expect(page.getByLabel('Coordenadas de destino', { exact: true })).toHaveValue('-9.01050, -77.60420');
      const registrar = page.getByRole('button', { name: 'Registrar expedición', exact: true });
      await expect(registrar).toBeDisabled();
      // Vista estrecha y alta para mostrar ambos campos sin que el nav fijo los tape.
      await page.setViewportSize({ width: 390, height: 2300 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await capturar('02-borrador-fechas-vacias-dev.png');
      await page.setViewportSize({ width: 1100, height: 850 });
      await page.getByLabel('Fecha y hora de salida', { exact: true }).fill(isoADatetimeLocal(fechas.salida));
      await page.getByLabel('Retorno estimado', { exact: true }).fill(isoADatetimeLocal(fechas.retorno));
      await expect(registrar).toBeDisabled();
      await page.getByRole('checkbox', { name: 'He revisado los contactos de alerta para esta nueva expedición.', exact: true }).check();
      await expect(registrar).toBeEnabled();
      const destinoNuevo = `Nueva salida HU28 DEV ${origenId.slice(0, 8)}`;
      await page.getByLabel('Destino / Nevado', { exact: true }).fill(destinoNuevo);
      const respuestaCreacion = page.waitForResponse((respuesta) =>
        respuesta.url() === `${origenWeb}/api/expediciones` && respuesta.request().method() === 'POST');
      await registrar.click();
      const respuesta = await respuestaCreacion;
      expect(respuesta.status()).toBe(201);
      const creada = await respuesta.json() as { expedicion: { id: string; estado: string } };
      expect(creada.expedicion.id).not.toBe(origenId);
      expect(creada.expedicion.estado).toBe('programada');
      const payload = respuesta.request().postDataJSON() as Record<string, unknown>;
      for (const campo of ['id', 'origenId', 'estado', 'alertas', 'confirmadoEn', 'fichaMedica']) expect(payload).not.toHaveProperty(campo);
      await expect(page).toHaveURL(`${origenWeb}/senderista/expedicion`);
      await expect(page.getByText(destinoNuevo, { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText(destinoNuevo, { exact: true })).toBeVisible();
      await expect(page.getByText(destinoOriginal, { exact: true })).toBeVisible();
      await capturar('03-nueva-expedicion-persistida-dev.png');

      await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
      await expect(page).toHaveURL(`${origenWeb}/iniciar-sesion`);
      await login(1);
      await page.goto(`${origenWeb}/senderista/perfil/historial`);
      await expect(page.getByRole('link', { name: /Repetir expedición a Ruta HU28 DEV B/ })).toBeVisible();
      await expect(page.getByText(destinoOriginal, { exact: true })).toHaveCount(0);
      const respuestaAjena = page.waitForResponse((respuesta) => respuesta.url() === `${origenWeb}/api/expediciones/${origenId}/borrador`);
      await page.goto(`${origenWeb}/senderista/expedicion/nueva?repetir=${origenId}`);
      expect((await respuestaAjena).status()).toBe(404);
      await expect(page.getByText('Expedición completada no encontrada', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Destino / Nevado', { exact: true })).toHaveCount(0);
      await capturar('04-usuario-B-origen-ajeno-404-dev.png');
      return { nuevaId: creada.expedicion.id, capturas };
    },
  });
  await info.attach('validacion-hu28-dev', { path: resultado.archivoInforme, contentType: 'application/json' });
  expect(resultado.informe.limpieza).toContain('verificada');
});
