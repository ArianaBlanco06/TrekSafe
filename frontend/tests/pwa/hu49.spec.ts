import { test, expect, type Page } from '@playwright/test';
import { cerrarAyudaInstalacion } from '../helpers/ayudaInstalacion.js';

async function login(page: Page, cuenta = 'a') {
  await page.goto('/iniciar-sesion');
  await cerrarAyudaInstalacion(page);
  await page.getByLabel('Correo electrónico', { exact:true }).fill(`cuenta-${cuenta}@example.invalid`);
  await page.getByLabel('Contraseña', { exact:true }).fill('Fixture123!');
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(page).toHaveURL('/senderista');
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>undefined));
  if(!await page.evaluate(()=>!!navigator.serviceWorker.controller)) await page.reload();
}
async function guardar(page: Page, destino: string) {
  await page.goto('/senderista/expedicion/nueva');
  await page.getByRole('checkbox',{name:/Contacto privado A/}).check();
  await page.getByLabel('Ubicación inicial',{exact:true}).fill('Salida HU49');
  await page.getByLabel('Destino / Nevado',{exact:true}).fill(destino);
  await page.getByLabel('Fecha y hora de salida',{exact:true}).fill('2099-11-15T08:00');
  await page.getByLabel('Retorno estimado',{exact:true}).fill('2099-11-15T18:00');
  await page.getByPlaceholder('Nombre completo',{exact:true}).fill('Compañera ficticia');
  await page.context().setOffline(true);
  await page.getByRole('button',{name:'Guardar borrador offline',exact:true}).click();
  await expect(page.getByText('Borrador guardado para sincronizar',{exact:false})).toBeVisible();
}
async function revisar(page: Page) {
  await page.getByRole('button',{name:'Revisar borrador',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:/Contacto privado A/})).toBeVisible();
  await page.getByLabel('He revisado los contactos de alerta para esta nueva expedición.').check();
  await page.getByLabel('He revisado las fechas de salida y retorno para este borrador.').check();
}
test('HU-49: reconexión sin envío automático, revisión, respuesta perdida y dos reintentos sin duplicados',async({page,context,request})=>{
  await login(page);await guardar(page,'Destino respuesta perdida HU49');
  await page.getByRole('link',{name:'Revisar cola de borradores'}).click();
  await expect(page.getByText('Estado: Pendiente')).toBeVisible();
  await context.setOffline(false);
  expect((await (await request.get('/__tests__/creadas')).json()).filter((x:{lugarFin:string})=>x.lugarFin==='Destino respuesta perdida HU49')).toHaveLength(0);
  await revisar(page);
  await request.post('/__tests__/hu49',{data:{cuenta:'a',perderRespuesta:true}});
  await page.getByRole('button',{name:'Confirmar y sincronizar borrador'}).click();
  await expect(page.getByText('Estado: Error')).toBeVisible();
  await expect(page.getByRole('button',{name:'Comprobar envío'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Revisar borrador',exact:true})).toHaveCount(0);
  await page.reload();
  await page.getByRole('button',{name:'Comprobar envío'}).dblclick();
  await expect(page.getByText('Estado: Sincronizado')).toBeVisible();
  const creadas=(await (await request.get('/__tests__/creadas')).json()).filter((x:{lugarFin:string})=>x.lugarFin==='Destino respuesta perdida HU49');
  expect(creadas).toHaveLength(1);
  expect(creadas[0].minutosRecordatorio).toBe(30);
});
test('HU-49: cerrar y abrir la PWA conserva la cola propia; logout y segunda cuenta la eliminan',async({page,context},info)=>{
  await login(page);await guardar(page,'Destino persistente HU49');
  await page.close();
  const nueva=await context.newPage();await context.setOffline(false);
  await login(nueva);
  await nueva.goto('/senderista/expedicion/borradores');
  await expect(nueva.getByText('Salida HU49 → Destino persistente HU49')).toBeVisible();
  await info.attach('cola-propia-tras-reabrir.png',{body:await nueva.screenshot(),contentType:'image/png'});
  await context.setOffline(true);await nueva.reload();
  await expect(nueva.getByText('Estado: Pendiente')).toBeVisible();
  await nueva.getByRole('button',{name:'Cerrar sesión'}).click();
  await expect(nueva).toHaveURL('/iniciar-sesion');
  await expect.poll(()=>nueva.evaluate(async()=> (await caches.keys()).filter(x=>x.startsWith('treksafe-offline-v2-cola-')))).toEqual([]);
  await info.attach('cache-storage-tras-logout.json',{body:JSON.stringify(await nueva.evaluate(()=>caches.keys()),null,2),contentType:'application/json'});
  await context.setOffline(false);await login(nueva,'b');await nueva.goto('/senderista/expedicion/borradores');
  await expect(nueva.getByText('No tienes borradores guardados.')).toBeVisible();
  await expect(nueva.getByText('Salida HU49 → Destino persistente HU49')).toHaveCount(0);
});
test('HU-49: migra solo borradores de la sesión propietaria y no importa otra cuenta',async({page})=>{
  await page.goto('/__tests__/vacio');
  const resultado=await page.evaluate(async()=>{
    const ruta='/__tests__/probe.js';const probe=await import(ruta);
    const cuenta={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',rol:'senderista'};
    probe.sesion.guardarSesion('fixture-a',cuenta);
    const datos={id:crypto.randomUUID(),guardadoEn:new Date().toISOString(),lugarInicio:'Anterior A',lugarFin:'Destino anterior',
      coordenadasInicio:'',coordenadasFin:'',horaInicio:'2099-01-01T12:00:00Z',horaRetornoEstimada:'2099-01-01T18:00:00Z',
      minutosTolerancia:30,idsContactos:[],nombresAcompanantes:[]};
    await probe.offline.writeOfflineJson('expedition-drafts',[datos]);
    const propia=await probe.rutas.listarBorradoresExpedicion();
    // Simula una ventana nueva: se pierde el nonce, pero no Cache Storage.
    sessionStorage.clear();probe.sesion.guardarSesion('fixture-a',cuenta);
    const recuperada=await probe.rutas.listarBorradoresExpedicion();
    probe.sesion.guardarSesion('fixture-b',{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',rol:'senderista'});
    return {propia,recuperada,otra:await probe.rutas.listarBorradoresExpedicion()};
  });
  expect(resultado.propia).toHaveLength(1);expect(resultado.recuperada[0].id).toBe(resultado.propia[0].id);
  expect(resultado.otra).toEqual([]);
});
test('HU-49: rechazo visible, edición, fecha vencida bloqueada y descarte explícito',async({page,context,request})=>{
  await login(page);await guardar(page,'Destino corregible HU49');await context.setOffline(false);
  await page.getByRole('link',{name:'Revisar cola de borradores'}).click();await revisar(page);
  await request.post('/__tests__/hu49',{data:{cuenta:'a',contacto:true}});
  await page.getByRole('button',{name:'Confirmar y sincronizar borrador'}).click();
  await expect(page.getByText('Estado: Error')).toBeVisible();await revisar(page);
  await page.getByLabel('Fecha y hora de salida',{exact:true}).fill('2020-01-01T08:00');
  await page.getByLabel('Retorno estimado',{exact:true}).fill('2020-01-01T18:00');
  await page.getByLabel('He revisado las fechas de salida y retorno para este borrador.').check();
  await page.getByRole('button',{name:'Confirmar y sincronizar borrador'}).click();
  await expect(page.getByRole('alert').filter({hasText:'Elige una salida futura'})).toBeVisible();
  await page.getByLabel('Fecha y hora de salida',{exact:true}).fill('2099-11-16T08:00');
  await page.getByLabel('Retorno estimado',{exact:true}).fill('2099-11-16T18:00');
  await context.setOffline(true);
  await page.getByRole('button',{name:'Guardar correcciones'}).click();
  await expect(page.getByText('Estado: Pendiente')).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Descartar',exact:true}).click();
  await expect(page.getByText('No tienes borradores guardados.')).toBeVisible();
});
test('HU-49: una escritura pendiente no reconstruye la cola después de logout',async({page})=>{
  await page.goto('/__tests__/vacio');
  const resultado=await page.evaluate(async()=>{
    const ruta='/__tests__/probe.js';const probe=await import(ruta);
    probe.sesion.guardarSesion('fixture-a',{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',rol:'senderista'});
    const original=Cache.prototype.put;let liberar!:()=>void;let avisar!:()=>void;
    const bloqueada=new Promise<void>(resolve=>{avisar=resolve;});const continuar=new Promise<void>(resolve=>{liberar=resolve;});
    Cache.prototype.put=async function(request,response){avisar();await continuar;return original.call(this,request,response);};
    try {
      const pendiente=probe.rutas.guardarBorradorExpedicion({lugarInicio:'Privado A',lugarFin:'Destino A',coordenadasInicio:'',coordenadasFin:'',
        horaInicio:'2099-01-01T12:00:00Z',horaRetornoEstimada:'2099-01-01T18:00:00Z',minutosTolerancia:30,idsContactos:[],nombresAcompanantes:[]})
        .then(()=>false,()=>true);
      await bloqueada;await probe.sesion.limpiarSesion();
      probe.sesion.guardarSesion('fixture-b',{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',rol:'senderista'});
      liberar();const rechazada=await pendiente;
      return {rechazada,datos:await probe.rutas.listarBorradoresExpedicion(),caches:await caches.keys()};
    }finally{Cache.prototype.put=original;}
  });
  expect(resultado.rechazada).toBe(true);expect(resultado.datos).toEqual([]);
  expect(resultado.caches.filter((x:string)=>x.startsWith('treksafe-offline-v2-cola-'))).toEqual([]);
});
