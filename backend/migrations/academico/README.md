# Instalación académica nueva y sin cuentas conocidas

`bootstrap_vacio.sql` instala exclusivamente el esquema base en una base vacía. No borra objetos ni carga usuarios, credenciales, fichas o registros institucionales de demostración. Los roles `anon`, `authenticated` y `service_role` deben existir (Supabase los proporciona). La guarda aborta ante relaciones, enums u objetos TrekSafe existentes. No sirve para actualizar DEV ni para recuperar una base.

En una base nueva confirmada, ejecutar cada archivo con parada en el primer error, conservando sus transacciones. No envolver todos los archivos en una transacción externa: `004` debe confirmar el enum antes de `005`. No utilizar un glob alfabético.

1. `academico/bootstrap_vacio.sql`.
2. `000`, `001`, `002`, `003`, `004`, `005`, `006`, `007`.
3. `20261101_hu30_listas_equipo.sql`, `20261101_hu30_operaciones_equipo.sql`.
4. `008`, `009`, `010`, `011`, `012`, `013`, `014`, `016`, `017`, `018`, `019`, `021`.
5. `015`, `022`, `023`, `024`, **`020` después de `022`**, `025`, `026`, `027`, `028`, `029`, `030`, `031`, `032`.

Los números identifican los nombres completos del catálogo en la carpeta padre. `031` es exportación CSV de HU-48; `032` es heartbeat del worker. No existe una `031` de heartbeat.

El runner `backend/scripts/test-dep108-postgres.mjs` es la referencia ejecutable de ese orden. Prueba dos bases PostgreSQL desechables distintas: actualización con datos ficticios históricos e instalación nueva con este bootstrap; comprueba ausencia de cuentas semilla y rechazo de una segunda ejecución sin reemplazar tablas. No carga `.env` ni admite una conexión remota.

Antes de provisionar, el PO identifica proyecto, región, plan, responsable, costos y recuperación. Las cuentas de la demostración se registran después mediante el flujo normal y contraseñas individuales comunicadas por canal seguro. La validación de rescate requiere cargar únicamente registros institucionales ficticios autorizados, identificados y limpiables; este bootstrap no los inventa ni los inserta.

Para bases existentes, inventariar objetos, permisos y asientos y aplicar solo lo realmente pendiente. No ejecutar este bootstrap, `init_schema.sql` ni eliminar asientos para forzar una repetición. La aplicación de SQL en DEV permanece a cargo de Ariana.
