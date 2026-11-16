# HU-48 · Validación pendiente en DEV

Responsable de la historia: John. Aplicación de SQL coordinada con Sebastian/Ariana.

## Antes de probar

1. Numeración confirmada: John recibió del equipo la confirmación de que 031
   está libre para HU-48. Esto no confirma su aplicación en DEV.
2. Aplicar una sola vez `backend/migrations/031_hu48_exportacion_incidentes.sql`
   en el DEV del equipo, con 029 y sus dependencias presentes.
3. Confirmar archivo y registro aplicados mediante estas consultas de lectura:

```sql
SELECT version, nombre, aplicada_en
FROM public.treksafe_migraciones
WHERE version = '031';

SELECT to_regprocedure(
  'public.treksafe_leer_pagina_incidentes_reporte(uuid,timestamptz,timestamptz,text,text,text,uuid,integer)'
) AS rpc_hu48;
```

El primer resultado debe ser la versión 031 de `hu48_exportacion_incidentes`;
el segundo, una referencia no nula. No se reaplican 029/030 ni el esquema inicial.

## Prueba de John

1. Iniciar la app y API configuradas para el DEV del equipo y entrar como
   rescatista con perfil validado. Abrir «Estadísticas».
2. Aplicar un rango de fechas y destino. Descargar CSV y comparar ids y cantidad
   con el conjunto correspondiente al reporte. Comprobar los seis encabezados.
3. Editar el formulario sin pulsar «Consultar estadísticas» y descargar otra vez:
   debe conservar los filtros aplicados del reporte visible.
4. Consultar por cierre y resultado, descargar y verificar estados/resultados.
5. Consultar un conjunto vacío: debe producir solo encabezados. Si DEV no tiene
   incidentes, documentar ese resultado sin atribuirle las 1.205 filas locales.
6. Verificar un rechazo de un usuario senderista o un token sin perfil validado
   por la API, sin obtener un CSV. El backend ya cubre estos casos localmente;
   esta evidencia debe identificar que el destino fue DEV.
7. Abrir el archivo en la hoja de cálculo acordada con Marko. Revisar acentos,
   seis columnas y celdas protegidas como texto. Los casos con caracteres
   especiales están en la muestra ficticia de la evidencia local.

## Evidencia para issue #50 o PR

```markdown
### HU-48 · Prueba en DEV
- Responsable: John
- Fecha y versión probada:
- Proyecto: ibnwggvqgjpeqcretjak
- Migración 031 aplicada por:
- Fecha base y rango aplicados:
- Zona/resultado aplicados:
- Incidentes del reporte / filas del CSV:
- Resultado observado:
- Capturas o archivo de prueba:
```

La evidencia local completa está en `docs/evidencias/hu-48-local/evidencia.md`.
El cierre compartido requiere la prueba de DEV, aceptación de Marko y revisión
e integración del PR hacia `develop`.
