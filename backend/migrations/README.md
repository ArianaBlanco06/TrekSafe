# Migración de datos de HU-30

Estas migraciones preparan la persistencia de las listas personales de equipo. El
avance de reglas y casos de uso se describe en [HU-30](../../docs/hu-30-equipo.md);
la API está implementada y la pantalla sigue pendiente. Los archivos están pendientes de revisión y
aplicación coordinada en Supabase DEV con Sebastian; este documento no registra
una aplicación en la base compartida.

## Archivos y requisitos

Aplicar en este orden sobre el esquema inicial de TrekSafe:

1. `20261101_hu30_listas_equipo.sql`: tablas, relaciones e índices.
2. `20261101_hu30_operaciones_equipo.sql`: posición interna de ítems y RPC.

Requieren los roles `anon`, `authenticated` y `service_role` de Supabase. No dependen
de otras HU nuevas. Sus nombres y posiciones deben ajustarse al orden del Issue #56 antes de integrarlos,
si el equipo ya tiene una convención diferente.

Cada archivo se ejecuta una sola vez, dentro de una transacción. Si los objetos ya
existen, falla para evitar ocultar diferencias entre esquemas. No se crea un sistema
de versionado ni sustituye el registro de aplicaciones del equipo.

## Modelo

| Tabla | Datos y restricciones |
| --- | --- |
| `listas_equipo` | UUID, propietario senderista, nombre y fechas. Permite cero ítems. |
| `items_lista_equipo` | UUID, lista, nombre, indicador obligatorio y posición interna. |

Los nombres rechazan cadenas vacías o compuestas únicamente por espacios, tabuladores
o saltos de línea. No se impone unicidad de nombres ni un límite nuevo de ítems.
Hay índices por propietario y por lista. Eliminar una lista elimina sus ítems;
eliminar una cuenta elimina sus listas mediante las relaciones existentes.

La segunda migración asigna a los ítems existentes una posición determinista por
UUID dentro de su lista, porque el esquema previo no almacenaba orden. Después,
las RPC conservan el orden del formulario y actualizan `actualizado_en`.

## Acceso y escrituras

Se conserva el modelo del proyecto: el cliente consume la API con el JWT propio
de TrekSafe. Las tablas tienen RLS, políticas de denegación y permisos de acceso
directo revocados para `anon` y `authenticated`. `service_role` recibe permisos
CRUD y evita RLS, por lo que el servicio y las RPC exigen y comprueban el propietario.

Las RPC de creación y edición guardan la lista y su colección en una transacción.
La edición bloquea la fila de la lista y comprueba propiedad, pertenencia y duplicados
antes de modificarla. La eliminación incluye la cascada. Las funciones usan
`SECURITY INVOKER`, `search_path` fijo y permisos de ejecución únicamente para el
backend. No se proporcionan funciones `SECURITY DEFINER` ni acceso desde el cliente.

Los ítems de esta historia son una lista base. La copia a una expedición y las
marcas de preparación corresponden a HU-31 y se incorporarán por separado.

## Aplicación y verificación

1. Sebastian confirma el archivo y su orden; el entorno de destino debe ser DEV.
2. Ejecutar los dos archivos en el orden indicado con el propietario
   del esquema, mediante el SQL Editor o `psql` con detención ante errores.
3. Comprobar tablas, relaciones, índices, políticas, funciones y permisos.
4. Registrar archivo, fecha y commit en el registro de migraciones del equipo.

No ejecutar nuevamente `init_schema.sql` en una base compartida: elimina tablas.
Tampoco aplicar las migraciones históricas obsoletas como parte de esta historia.

Las pruebas de `tests/hu30_listas_equipo.test.sql` y `tests/hu30_operaciones_equipo.test.sql`
se ejecutan únicamente en una base desechable con el esquema inicial y ambas migraciones aplicadas. Por ejemplo,
desde la raíz del repositorio, con una conexión **local de pruebas** configurada:

```powershell
psql -X -v ON_ERROR_STOP=1 -f backend/migrations/tests/hu30_listas_equipo.test.sql
psql -X -v ON_ERROR_STOP=1 -f backend/migrations/tests/hu30_operaciones_equipo.test.sql
```

El archivo usa cuentas ficticias, prueba listas vacías, indicadores obligatorios
y opcionales, nombres inválidos, claves foráneas, cascadas, rollback y permisos.
Finaliza con `ROLLBACK`. Si se ejecuta desde una herramienta con una sesión
persistente y falla, ejecutar `ROLLBACK` antes de continuar.

El script `backend/scripts/test-hu30-postgres.ps1` prepara y apaga automáticamente
una instancia local desechable y ejecuta también las suites de contrato y HTTP.
El alcance y los límites de estas comprobaciones se describen en la documentación
de HU-30. No equivalen a una validación de PostgREST en Supabase DEV.

## Evidencia de esta fase

El 1 de noviembre de 2026 se aplicaron el esquema inicial y esta migración en una
instancia local desechable de PostgreSQL 18, con los tres roles de Supabase
reproducidos para la prueba. El archivo de pruebas terminó correctamente.
Después del `ROLLBACK` quedaron las dos cuentas semilla originales, cero listas
y cero ítems. La instancia se apagó al terminar.

Esta ejecución no se conectó a Supabase ni acredita una aplicación en DEV.
