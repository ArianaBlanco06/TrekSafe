Al volver la conexión, los borradores se enviaban automáticamente y una respuesta perdida podía producir otra expedición. Ahora una cola muestra pendientes, errores y sincronizados, exige revisar fechas/contactos y conserva el mismo comando para comprobar un envío sin duplicarlo.

Closes #51

- Command y puertos `IColaLocal`/`ICreadorPlanIdempotente`, Adapter Cache API/Supabase y reutilización del formulario.
- Cola por cuenta: sobrevive al cierre de la PWA y se recupera al autenticarse como propietario. Logout/401 eliminan datos; login de otra cuenta limpia la cola anterior. Guardias de sesión y Web Locks para operaciones concurrentes.
- Creación transaccional del plan, contactos, acompañantes y clave de idempotencia. Repetición devuelve el plan existente; un cuerpo distinto con la misma clave da 409. Una clave cuyo plan fue eliminado no vuelve a crear el plan.
- HU-28 con puntos sigue requiriendo red; se mantienen el recordatorio HU-38, las rutas, las plantillas personales y la política NetworkOnly/prompt de la PWA.

Validación inicial local de HU-49 con Node 22.23.4: tipos backend/frontend/pruebas, builds, 544 pruebas backend, 129 frontend (2 integradas opcionales sin conexión configurada), 13 SQL en PostgreSQL 18 desechable, 13 UI HU-32 y 25 PWA/compatibilidad. La prueba de privacidad antes automática exige ahora revisión explícita. El CI conserva sus suites y ejecuta además el runner SQL de HU-49.

**Numeración ajustada el 11/11:** HU-41 conserva la `019`; HU-49 usa `020_hu49_creacion_plan_idempotente.sql` con asiento `020`. Runner, documentación y prueba de coexistencia de ambos asientos actualizados. TypeScript backend y los 13 casos SQL se volvieron a ejecutar satisfactoriamente tras este ajuste; el registro 019 se simula como fixture de prueba, sin instalar HU-41.

**Pendiente antes de integrar:** revisión técnica, validación funcional y confirmación de Marko de que la 020 está libre, y coordinación con Ariana para aplicarla en DEV (requiere 002 y 014). Solo se aplicó en clústeres temporales locales. No se modificaron `.env`, Supabase, cron ni `servicioExpedicion.ts`. Las pruebas PWA usan API controlada y las SQL una base real desechable; queda la prueba del despliegue DEV después de la migración. Las migraciones 015 y 022–024 mencionadas en el informe del Sprint 2 quedan a cargo de sus responsables.

Guía, contrato y demostración: [docs/hu-49/README.md](docs/hu-49/README.md).
