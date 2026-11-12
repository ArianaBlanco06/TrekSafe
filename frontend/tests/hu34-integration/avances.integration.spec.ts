import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const planId='b1d0d5c0-8327-4af1-9cc1-2e83ae7e0320';
const puntoId='42f581d6-8731-4fa6-8ace-e710b97c45f9';
const api=`/api/expediciones/${planId}/avances`;
type Auth={token:string;usuario:{id:string;rol:string;correoElectronico:string}};
let owner: Auth; let other: Auth; let rescue: Auth;
const headers=(auth=owner)=>({Authorization:`Bearer ${auth.token}`});
async function control(request:APIRequestContext,path:string,data:unknown={}) {
  const response=await request.post(`/__hu32__/${path}`,{headers:{'x-hu32-control':process.env.TREKSAFE_HU32_CONTROL_TOKEN!},data});
  expect(response.ok(),await response.text()).toBe(true); return response;
}
async function login(request:APIRequestContext,correoElectronico:string):Promise<Auth> {
  const response=await request.post('/api/auth/iniciar-sesion',{data:{correoElectronico,contrasena:'Treksafe123!'}});
  expect(response.status(),await response.text()).toBe(200);return response.json();
}
async function abrir(page:Page) {
  await page.addInitScript(auth=>{
    sessionStorage.setItem('treksafe:token',auth.token);sessionStorage.setItem('treksafe:usuario',JSON.stringify(auth.usuario));
  },owner);
  await page.route('**/*.tile.openstreetmap.org/**',route=>route.abort());
  await page.goto('/senderista/expedicion/activa');
  await expect(page.getByLabel('Punto alcanzado')).toBeEnabled();
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>undefined));
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
}
test.beforeAll(async ({request})=>{
  await control(request,'reset');
  owner=await login(request,'senderista@treksafe.pe');other=await login(request,'otro@example.invalid');rescue=await login(request,'rescatista@treksafe.pe');
});
test.beforeEach(async ({request})=>{
  await control(request,'reset');
  const response=await request.put(`/api/expediciones/${planId}/puntos`,{headers:headers(),data:{versionEsperada:1,puntos:[
    {id:puntoId,nombre:'Mirador real',latitud:-9.03,longitud:-77.6,orden:1},
  ]}});
  expect(response.status(),await response.text()).toBe(200);
  await control(request,'estado',{estado:'en_progreso',salidaPasada:true});
});

test('HU-34: formulario → API → SDK → PostgREST → SQL, sin cambiar el plan',async ({page,request},info)=>{
  const before=await (await request.get(`/__hu32__/snapshot/${planId}`,{headers:{'x-hu32-control':process.env.TREKSAFE_HU32_CONTROL_TOKEN!}})).json();
  await abrir(page); await page.getByLabel('Punto alcanzado').selectOption(puntoId);
  await page.getByLabel('Nota del avance (opcional)').fill('Llegada de prueba real');
  await page.getByRole('button',{name:'Registrar avance',exact:true}).click();
  await expect(page.getByText('Avance registrado.',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Último avance')).toContainText('Llegada de prueba real');
  const after=await (await request.get(`/__hu32__/snapshot/${planId}`,{headers:{'x-hu32-control':process.env.TREKSAFE_HU32_CONTROL_TOKEN!}})).json();
  expect(after).toEqual(before);
  const last=await request.get(`${api}/ultimo`,{headers:headers()});expect(last.headers()['cache-control']).toBe('no-store');
  expect((await last.json()).ultimoAvance.punto.id).toBe(puntoId);
  await info.attach('avance-real',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});
test('HU-34: misma solicitud devuelve el original y cuerpo distinto es conflicto',async ({request})=>{
  const data={solicitudId:randomUUID(),puntoId,nota:'Nota original'};
  const first=await request.post(api,{headers:headers(),data});expect(first.status()).toBe(201);const original=await first.json();
  const repeated=await request.post(api,{headers:headers(),data});expect(repeated.status()).toBe(200);
  expect(await repeated.json()).toEqual({...original,repetida:true});
  expect((await request.post(api,{headers:headers(),data:{...data,nota:'Otra'}})).status()).toBe(409);
  await control(request,'estado',{estado:'completada'});
  expect((await request.post(api,{headers:headers(),data})).status()).toBe(200);
  expect((await request.post(api,{headers:headers(),data:{...data,solicitudId:randomUUID()}})).status()).toBe(409);
});
test('HU-34: autenticación, rol, cuenta, punto y campos controlados por servidor',async ({request})=>{
  const data={solicitudId:randomUUID(),puntoId};
  expect((await request.post(api,{data})).status()).toBe(401);
  expect((await request.post(api,{headers:headers(rescue),data})).status()).toBe(403);
  expect((await request.post(api,{headers:headers(other),data})).status()).toBe(404);
  expect((await request.get(`${api}/ultimo`,{headers:headers(other)})).status()).toBe(404);
  expect((await request.post(api,{headers:headers(),data:{...data,puntoId:randomUUID()}})).status()).toBe(409);
  expect((await request.post(api,{headers:headers(),data:{...data,registradoEn:'2000-01-01'}})).status()).toBe(400);
});
test('HU-34: respuesta perdida después del commit reutiliza el mismo envío',async ({page})=>{
  await abrir(page);const ids:string[]=[];let firstId='';
  await page.route(`**${api}`,async route=>{
    ids.push(route.request().postDataJSON().solicitudId);
    const response=await route.fetch();const body=await response.json();
    if(ids.length===1){firstId=body.avance.id;return route.abort('failed');}
    expect(body.repetida).toBe(true);expect(body.avance.id).toBe(firstId);return route.fulfill({response});
  });
  await page.getByLabel('Punto alcanzado').selectOption(puntoId);
  await page.getByLabel('Nota del avance (opcional)').fill('Respuesta perdida');
  await page.getByRole('button',{name:'Registrar avance',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reintentar envío de avance'})).toBeVisible();
  await expect(page.getByLabel('Nota del avance (opcional)')).toBeDisabled();
  await page.getByRole('button',{name:'Reintentar envío de avance'}).click();
  await expect(page.getByText('El avance ya estaba registrado. Recuperamos su confirmación.')).toBeVisible();
  expect(ids).toHaveLength(2);expect(ids[0]).toBe(ids[1]);
});
test('HU-34: sin red no envía y no recupera notas desde caché al recargar',async ({page,context,request})=>{
  await request.post(api,{headers:headers(),data:{solicitudId:randomUUID(),puntoId,nota:'Nota privada HU34'}});
  await abrir(page);await expect(page.getByLabel('Último avance')).toContainText('Nota privada HU34');
  const urls=await page.evaluate(async()=>{const result:string[]=[];for(const name of await caches.keys())for(const entry of await(await caches.open(name)).keys())result.push(entry.url);return result;});
  expect(urls.some(url=>url.includes('/avances'))).toBe(false);
  await context.setOffline(true);await expect(page.getByRole('button',{name:'Registrar avance',exact:true})).toBeDisabled();
  await page.reload();await expect(page.getByText('Nota privada HU34',{exact:true})).toHaveCount(0);
});
