# HU-32 — Guía de demostración y revisión

Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi). Alcance: puntos intermedios de una expedición propia programada. Evidencia técnica completa: [fase 6](fase-6-integracion.md).

## 1. Validación aislada disponible

Esta opción reproduce la evidencia local con datos ficticios, sin depender de DEV ni de claves reales de Supabase.

Requisitos: Node 22, dependencias de backend/frontend instaladas desde sus lockfiles, PostgreSQL nativo y PostgREST. En Windows se utiliza Edge ya instalado; en otros sistemas se requiere el Chromium de Playwright. La ruta del ejecutable PostgREST debe reemplazarse por su ubicación local.

Desde la raíz:

```powershell
node --version
npm.cmd ci --prefix backend
npm.cmd ci --prefix frontend
node backend/scripts/test-hu32-sql.mjs --pg-bin "C:\Program Files\PostgreSQL\18\bin" --with-browser --postgrest "C:\ruta\PostgREST\postgrest.exe"
```

Mostrar en la salida los typechecks/builds correctos, 43 pruebas backend, 12 de interfaz, 35 comprobaciones SQL, 24 de contrato y 9 escenarios integrados. Los casos de memoria se repiten entre ejecuciones; no sumar los grupos como casos únicos.

El runner fija `/api` para el build, crea su clúster, emite credenciales ficticias y prueba la PWA con worker activo contra la API y PostgREST reales. Al finalizar cierra los servidores. Produce una demostración automatizada; no deja una API temporal abierta para navegar después.

Las capturas móviles clara/oscura de las pruebas de interfaz quedan bajo `frontend/test-results/`. Los logs de PostgreSQL/PostgREST quedan en el directorio temporal que imprime el runner. Mostrar la inyección de fallo como una prueba deliberada del rollback, junto con su resultado aprobado.

## 2. Preparación de una Review manual en DEV

Completar estos requisitos con el equipo antes de levantar otra API contra su base compartida:

| Requisito | Comprobación |
| --- | --- |
| Versión del plan | El equipo confirmó `expediciones.version INTEGER`, conforme a HU-26. HU-32 requiere `NOT NULL` y default (fixture inicial: 1); coordinar con Favio/Sebastian la aplicación previa y reglas de incremento. |
| Migraciones | La versión compartida precede a HU-32 y Sebastian registra su aplicación. No ejecutar `init_schema.sql` sobre DEV con trabajo existente. |
| API y cron | Usar la API coordinada. Si todavía no está integrado TECH #55, no asumir que escribir `CRON_ENABLED=false` desactiva el código histórico. |
| Datos | Dos cuentas senderistas ficticias. La cuenta principal tiene un contacto vigente y una expedición programada con salida futura y acompañante. |
| PWA | Generar build y probar con preview, cerrar antes el servidor Vite que ocupe el mismo puerto. Confirmar que la URL de API y CORS correspondan al entorno acordado. |

Para frontend local, si la API permite el origen habitual `http://localhost:5173`:

```powershell
npm.cmd run build:frontend
npm.cmd run preview --prefix frontend -- --port 5173
```

`VITE_API_URL` es de build-time: preparar su valor de DEV antes de compilar. Esta guía no configura ni modifica credenciales. El inicio de una API local adicional se coordina según la regla de cron anterior.

## 3. Recorrido manual sugerido: 8–10 minutos

| Paso | Acción de Andriy | Resultado a mostrar |
| --- | --- | --- |
| 1 | Iniciar sesión como senderista principal, abrir Expediciones y «Gestionar puntos» de un plan programado. | Inicio, destino y salida visibles; extremos de solo lectura; contador inicial. |
| 2 | Agregar «Mirador» con `-9.03012`, `-77.60634` y «Descanso» con `-9.03715`, `-77.60721`. Guardar y recargar. | Dos puntos persistidos. Los valores son ficticios y están en el alcance geográfico de validación. |
| 3 | Renombrar el primer punto y mover el segundo arriba. Guardar y recargar. | Nombre y orden persistidos; IDs conservados al editar/reordenar. Mostrar la consulta de lectura de la sección siguiente si se necesita demostrar identidad. |
| 4 | Vaciar un nombre o escribir latitud `40.7`. Intentar guardar y después corregir. | Error junto al campo y foco en el primero inválido. La colección del servidor conserva la última versión válida. |
| 5 | Abrir el mismo plan en otra sesión de la misma cuenta. Ambas leen la misma versión; la segunda guarda primero y la primera intenta guardar después. | Conflicto en la primera, edición conservada y botón para revisar la lista actual. Consultar no dispara otro guardado. |
| 6 | Revisar la lista del servidor y elegir cargarla, o explicar la opción de conservar explícitamente la edición. | Cargar confirma el descarte; conservar exige después pulsar Guardar y advierte que reemplaza la lista completa. |
| 7 | Con el worker activo, editar un nombre, activar Offline en las herramientas del navegador y volver Online. | Edición abierta conservada; Guardar deshabilitado sin red; reconectar no envía nada automáticamente. Guardar manualmente. |
| 8 | Cerrar sesión, entrar con la segunda cuenta y abrir la URL del plan principal. | Sin puntos del usuario anterior; el plan ajeno responde como no encontrado. La prueba integrada también cubre reingreso offline. |
| 9 | Volver a la cuenta principal, quitar los dos puntos y guardar. | Lista vacía; inicio y destino intactos. |

El límite de 20/21 y el fallo transaccional se respaldan con la suite automatizada para evitar dedicar la Review a rellenar 20 tarjetas o a alterar una base compartida. El fallo inyectado existe únicamente en el entorno temporal del runner.

La edición no se persiste como borrador de HU-49. Al cerrar o abandonar la pantalla puede perderse lo no guardado; se advierte al cerrar/recargar y al volver con su enlace «Expediciones». Esta limitación está indicada en la [fase 5](fase-5-interfaz.md).

## 4. Comprobación de identidad de solo lectura

En la base de prueba acordada, reemplazar el UUID por el de la expedición ficticia:

```sql
SELECT id, nombre, latitud, longitud, orden
FROM public.puntos_ruta
WHERE expedicion_id = 'UUID_DE_LA_EXPEDICION'::uuid
ORDER BY orden;
```

Comparar los IDs antes y después del paso 3. La consulta no muestra ficha médica, contactos ni secretos. No es necesario exponer cabeceras Authorization para demostrar la persistencia.

## 5. Sustentación y evidencia del curso

Abrir el [diagrama y las CRC](diseno-solid.md), los [puertos](../../backend/src/application/ports/puntosRuta.ts), el [servicio](../../backend/src/application/services/servicioPuntosRuta.ts) y el [ensamblaje](../../backend/src/infrastructure/composition/puntosRuta.ts). Explicar por qué la misma suite prueba dos implementaciones y por qué la atomicidad se garantiza en PostgreSQL además de validar TypeScript.

Conservar estas evidencias para enlazarlas al issue/PR:

| Evidencia | Qué demuestra |
| --- | --- |
| Video/capturas de los pasos 1–4 y 9 | CRUD, orden, validación, persistencia y extremos conservados. |
| Dos sesiones y revisión del conflicto | Versión, concurrencia y conservación de edición. |
| PWA activa sin red y recuperación | Guardado explícito y ausencia de respuesta antigua de puntos. |
| Salida del runner con versión de Node y resultados | Límites, permisos, rollback y regresión ejecutados. |
| Diagrama, CRC y prueba de contrato | Aplicación concreta de SOLID. |

Usar datos ficticios y ocultar tokens, `.env` y cualquier dato real en las capturas. Registrar fecha, entorno y criterio demostrado. Las capturas de `test-results` están excluidas de Git: seleccionarlas y adjuntarlas de forma explícita cuando Andriy prepare su PR o evidencia del curso.
