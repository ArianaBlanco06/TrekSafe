import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers:'block' });
const id='11111111-1111-4111-8111-111111111111';
const puntoId='22222222-2222-4222-8222-222222222222';
async function preparar(page:Page, incierto=false, estado='en_progreso') {
  const solicitudes:Record<string,unknown>[]=[];let ultimo:unknown=null;
  await page.addInitScript(()=>{
    sessionStorage.setItem('treksafe:token','fixture-hu34');
    sessionStorage.setItem('treksafe:usuario',JSON.stringify({id:'cuenta-a',rol:'senderista'}));
  });
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/expediciones/activa'))return route.fulfill({json:{expedicion:{id,estado,
      lugarInicio:'Inicio',lugarFin:'Destino',horaInicio:'2026-01-01T12:00:00Z',horaRetornoEstimada:'2099-01-01T18:00:00Z',
      fechaLimite:'2099-01-01T18:30:00Z',minutosTolerancia:30,minutosRecordatorio:30,version:1,
      cantidadAcompanantes:1,cantidadContactos:1,acompanantes:['Compañero'],contactos:[],ampliacionesRestantes:1}}});
    if(url.pathname.endsWith('/puntos'))return route.fulfill({json:{expedicion:{id,estado,version:1},puntos:[
      {id:puntoId,nombre:'Mirador',latitud:-9.03,longitud:-77.6,orden:1}]}});
    if(url.pathname.endsWith('/avances/ultimo'))return route.fulfill({json:{ultimoAvance:ultimo}});
    if(url.pathname.endsWith('/avances')){
      const body=route.request().postDataJSON();solicitudes.push(body);
      ultimo ??= {id:'33333333-3333-4333-8333-333333333333',expedicionId:id,solicitudId:body.solicitudId,
        punto:{id:puntoId,nombre:'Mirador',orden:1},registradoEn:'2030-01-01T12:00:00.000Z',nota:body.nota};
      if(incierto&&solicitudes.length===1)return route.fulfill({status:500,json:{mensaje:'Respuesta incierta'}});
      return route.fulfill({status:solicitudes.length===1?201:200,json:{avance:ultimo,repetida:solicitudes.length>1}});
    }
    return route.fulfill({json:{avisos:[],total:0,noLeidos:0}});
  });
  await page.goto('/senderista/expedicion/activa');await expect(page.getByLabel('Punto alcanzado')).toBeVisible();
  return solicitudes;
}
test('HU-34: registra desde la expedición activa sin enviar hora ni propietario',async ({page})=>{
  const solicitudes=await preparar(page);
  await page.getByLabel('Punto alcanzado').selectOption(puntoId);
  await page.getByLabel('Nota del avance (opcional)').fill('  Llegué al mirador  ');
  await page.getByRole('button',{name:'Registrar avance',exact:true}).click();
  await expect(page.getByLabel('Último avance')).toContainText('Llegué al mirador');
  expect(solicitudes).toEqual([{solicitudId:expect.any(String),puntoId,nota:'Llegué al mirador'}]);
  await expect(page.getByRole('button',{name:'Registrar retorno seguro',exact:true})).toBeEnabled();
});
test('HU-34: reintento explícito conserva la solicitud y desconexión no envía',async ({page,context})=>{
  const solicitudes=await preparar(page,true);
  await page.getByLabel('Punto alcanzado').selectOption(puntoId);
  await page.getByRole('button',{name:'Registrar avance',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reintentar envío de avance'})).toBeVisible();
  await expect(page.getByLabel('Punto alcanzado')).toBeDisabled();
  await context.setOffline(true);await expect(page.getByRole('button',{name:'Reintentar envío de avance'})).toBeDisabled();
  await context.setOffline(false);await expect(page.getByRole('button',{name:'Reintentar envío de avance'})).toBeEnabled();
  expect(solicitudes).toHaveLength(1);
  await page.getByRole('button',{name:'Reintentar envío de avance'}).click();
  await expect(page.getByText('El avance ya estaba registrado. Recuperamos su confirmación.')).toBeVisible();
  expect(solicitudes).toHaveLength(2);expect(solicitudes[0]).toEqual(solicitudes[1]);
});
test('HU-34: en alerta bloquea nuevas llegadas y mantiene retorno disponible',async ({page})=>{
  await preparar(page,false,'alerta');
  await expect(page.getByRole('button',{name:'Registrar avance',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Registrar retorno seguro',exact:true})).toBeEnabled();
});
