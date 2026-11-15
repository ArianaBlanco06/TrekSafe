# Paquete revisable 032 para Ariana

**Estado: probado únicamente en bases locales desechables; no aplicado a DEV ni al entorno publicado.** La rama fuente incorpora el catálogo hasta `031` (HU-48). El archivo nuevo es [032_dep110_estado_worker.sql](../../../backend/migrations/032_dep110_estado_worker.sql). El manifiesto contiene su SHA256 y el del verificador de solo lectura.

La migración añade `estado_worker`, RLS, permisos exclusivos del backend y dos RPC `SECURITY INVOKER`: registro de inicio/ciclo/parada y disponibilidad agregada. No activa cron, máquinas ni envíos. Las fechas proceden de PostgreSQL; se guardan códigos de error restringidos, no mensajes de proveedor ni datos médicos. Los hashes del manifiesto usan texto UTF-8 normalizado de CRLF a LF, para que el checkout Windows no produzca una divergencia falsa.

## Secuencia de aplicación coordinada

1. Ariana confirma destino exacto y versión fuente. En DEV debe ser `treksafe-dev-r2` (`ibnwggvqgjpeqcretjak`); el proyecto académico se identifica por separado. Comparar el archivo con `manifest.json` y comprobar respaldo/recuperación del entorno antes de aplicar.
2. Ejecutar [verificar-032.sql](verificar-032.sql), que solo consulta. Verificar dependencias `015`, `022`, `024` y el catálogo integrado del entorno; no basta con encontrar asientos. Si ya existe `032`, la tabla o una RPC, **detener y conciliar**: no volver a ejecutar este DDL de una sola aplicación.
3. Aplicar únicamente `032_dep110_estado_worker.sql`, una vez y con parada ante error. No repetir `015`, `020`, `021`, `022–031`, `init_schema.sql` ni el bootstrap de instalación vacía en DEV.
4. Registrar fecha real, entorno, ejecutor, commit y resultado en `REGISTRO_APLICACION.md`. Repetir el verificador y comprobar firmas, RLS, concesiones y fuentes. El `NOTIFY` del archivo recarga PostgREST; comprobar que ambas RPC se reconocen antes de activar la versión nueva.
5. Con datos controlados en el entorno autorizado, acreditar ciclo `plazos`, ciclo `outbox`, parada, reinicio y disponibilidad. El worker nuevo **requiere 032**; no se publica contra un esquema hasta 031. La prueba de correo y la aceptación publicada corresponden a #112.

## Disponibilidad y recuperación

La disponibilidad exige una instancia no detenida con ambos ciclos recientemente correctos. Degrada si existe un ciclo fallido o vencido en la única instancia operativa, pendiente demasiado antiguo, resultado incierto/fallido o una expedición en alerta sin aviso duradero de alerta. Una instancia sana basta; el despliegue objetivo configura una sola instancia de worker. Los fallidos/inciertos y las alertas históricas sin outbox requieren conciliación, no se ocultan al pasar un ciclo vacío.

Ante fallo de publicación, conservar esquema y pendientes y volver solo a una imagen compatible. No usar `.down.sql`, borrar tablas o reactivar envíos legados en paralelo. Si hay objetos parciales o divergentes, detener el despliegue y preparar una corrección aditiva ensayada. La tabla de señales es interna; el endpoint público solo consume el booleano agregado.
