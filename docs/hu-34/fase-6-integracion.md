# HU-34 — Fase 6: integración y evidencia

8 de noviembre de 2026. Node 22.23.4, PostgreSQL 18.6, PostgREST 16.5 y Edge. Sin SQL en Supabase, sin modificar .env o el cron real.

El runner crea un clúster nuevo en loopback, instala esquema y migraciones únicamente allí y ejecuta 19 comprobaciones SQL. Con navegador reutiliza el bootstrap privado de HU-32 para iniciar Express/SDK Supabase/PostgREST reales y el build PWA. Sus rutas de fixture requieren nonce y no existen en producción. Todos los procesos temporales se apagan al finalizar; se confirmó ese cierre.

```powershell
npm.cmd run build --prefix backend
npm.cmd run build --prefix frontend
node backend/scripts/test-hu34-postgres.mjs --pg-bin "C:\Program Files\PostgreSQL\18\bin" --with-browser --postgrest "C:\ruta\PostgREST\postgrest.exe"
```

El build de pruebas utiliza `/api` en el proceso. El bootstrap histórico puede cargar el módulo de entorno, pero sustituye destinos antes de crear la aplicación y no ejecuta main/cron.

| Verificación | Resultado |
| --- | --- |
| Tipos backend/frontend, pruebas compartidas y UI | Aprobados. |
| Builds backend y frontend/PWA | Aprobados. |
| Backend | 467 aprobadas, 0 fallos; suites SQL optativas omitidas sin conexión dedicada. |
| Frontend `test:equipo` | 88 aprobadas, 2 integraciones PostgreSQL omitidas, 0 fallos. |
| Regresión UI HU-32 | 13 aprobadas. |
| SQL HU-34 | 19 aprobadas. |
| Cadena real HU-34 | 5 aprobadas con worker activo. |
| PWA/compatibilidad | 20 aprobadas, incluidas HU-33 y 3 nuevas de formulario con worker bloqueado; las de privacidad conservan el worker real. |

Los resultados finales corresponden a develop `8214042`, posterior a la integración de HU-33 y la copia de puntos HU-28 por el equipo. Se repitieron tipos, builds, suites y cadena real después de resolver dos conflictos en app/Vite conservando ambas rutas y reglas privadas. Los cinco escenarios reales cubren formulario y snapshot del plan intacto, idempotencia/reenvío tras completar, autenticación/rol/propiedad/punto/hora falsificada, respuesta perdida después del commit y recarga offline sin recuperar notas. SQL añade barreras de concurrencia entre dos sesiones, colisión entre planes, alerta confirmada mientras espera el bloqueo, rollback y FK/cascadas. El vencimiento usa el reloj local y la función SQL existente de expiración, sin correo ni modificar el cron.

Grupos solapados, no cobertura única. Las integraciones SQL propias de otras historias no se ejecutaron. La validación no certifica Supabase DEV: 016 requiere aplicación coordinada después de revisión. Capturas/trazas se generan en `frontend/test-results/hu34-integration` y los logs SQL en la carpeta temporal que imprime el runner.
