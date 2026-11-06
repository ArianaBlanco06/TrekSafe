# HU-32 — Fase 4: caso de uso, adaptador y API

Fecha: 1 de noviembre de 2026. Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi).

Estado: backend de HU-32 implementado y verificado con sustitutos, HTTP local y PostgreSQL temporal. La UI queda para la fase 5. La migración y la versión compartida del plan continúan pendientes de coordinación antes de usar DEV.

## 1. Comportamiento entregado

Con el prefijo por defecto `/api`, la aplicación incorpora:

| Endpoint | Resultado |
| --- | --- |
| `GET /api/expediciones/:id/puntos` | Consulta privada del contexto del plan y sus puntos ordenados. |
| `PUT /api/expediciones/:id/puntos` | Guarda la colección completa y devuelve la fotografía persistida. |

Las rutas reutilizan los middleware existentes de JWT y rol senderista. El ID del actor sale de `req.user`, formado a partir del JWT validado. El cuerpo no puede elegir propietario ni modificar extremos, horarios, estado o datos médicos.

El servicio valida parámetro, versión, estructura, nombres, coordenadas, IDs y orden antes de invocar el puerto de escritura. Se conservan los índices originales del arreglo en los errores por campo. Los nombres se recortan y los UUID se normalizan a minúsculas; las coordenadas llegan sin redondear a PostgreSQL para que se validen sus valores originales y se aplique la normalización decimal autoritativa.

Los nombres con NUL o sustitutos Unicode aislados se rechazan antes de la RPC, porque PostgreSQL UTF-8 no los puede representar. Los caracteres suplementarios válidos, como un emoji, cuentan como un punto de código. Esta precisión se incorporó al contrato de fase 2.

Propietario, estado, hora de salida y versión se verifican dentro del guardado SQL ya construido. El servicio no intenta proteger una escritura con una consulta previa que pueda quedar obsoleta. Un conflicto devuelve 409 y un plan ajeno/inexistente devuelve el mismo 404. Los fallos técnicos se convierten mediante el manejador existente en un 500 genérico; su respuesta no contiene el detalle SQL.

## 2. Organización del código

Todos los caminos de esta tabla son relativos a la raíz del repositorio.

| Pieza | Ubicación | Responsabilidad |
| --- | --- | --- |
| Tipos | `backend/src/domain/entities/PuntoRuta.ts`, `RutaConPuntos.ts` | Datos del punto y fotografía del plan, independientes de Express y Supabase. |
| Puertos | `backend/src/application/ports/puntosRuta.ts` | Interfaces pequeñas de consulta/guardado y resultados de negocio sin códigos HTTP. |
| Validación | `backend/src/application/dto/puntosRuta.dto.ts` | Validación estricta, normalización e invariantes de colección. |
| Caso de uso | `backend/src/application/services/servicioPuntosRuta.ts` | Coordina validación y dependencias recibidas por constructor. |
| Adaptador | `backend/src/infrastructure/repositories/RepositorioPuntosRuta.ts` | Ejecuta las RPC, valida respuestas externas y normaliza fechas a UTC. |
| Ensamblaje | `backend/src/infrastructure/composition/puntosRuta.ts` | Conecta cliente Supabase, repositorio y servicio. |
| Controlador | `backend/src/presentation/http/controllers/controladorPuntosRuta.ts` | Adapta solicitudes, errores por campo y resultados de negocio a HTTP. |
| Rutas | `backend/src/presentation/http/routes/rutasPuntosRuta.ts` | Registra GET/PUT protegidos; `app.ts` monta el ensamblaje. |
| Sustituto de pruebas | `backend/src/testing/puntosRuta/RepositorioPuntosRutaMemoria.ts` | Implementación en memoria con reloj inyectado; no se conecta a producción. |

Los límites geográficos existentes se reutilizan mediante dos funciones pequeñas extraídas en `backend/src/shared/utils/coordinates.ts`. El comportamiento previo de `isValidPeruCoordinates` se conserva, y sus pruebas históricas siguen pasando.

## 3. Evidencia de SOLID

| Principio | Aplicación concreta | Evidencia ejecutada |
| --- | --- | --- |
| SRP | Controlador, servicio, validación, adaptación SQL y ensamblaje tienen responsabilidades separadas. | Pruebas del servicio sin HTTP y del adaptador sin iniciar la aplicación. |
| OCP | El servicio usa contratos estables de consulta y escritura. | Se usa el mismo servicio con colaboradores sustitutos, sin modificar su implementación. |
| LSP | Memoria y adaptador SQL deben mantener los resultados, rechazos, IDs, atomicidad observable y versiones. | Los mismos 12 escenarios se ejecutaron contra ambas implementaciones. PostgreSQL tiene además las 35 comprobaciones SQL de rollback y concurrencia real. |
| ISP | `IConsultaPuntosRuta` e `IGuardadoPuntosRuta` declaran una operación cada una. | Prueba que inyecta lectores y escritores separados; no exige métodos de otras historias. |
| DIP | El servicio recibe los puertos por constructor y no importa infraestructura. | El ensamblaje crea el repositorio concreto; el servicio se prueba con dependencias sustituidas. |

El repositorio en memoria reproduce el redondeo decimal de PostgreSQL para mantener el contrato incluso en empates negativos. Usar simplemente `toFixed()` sobre el número binario podría cambiar el resultado. Es un sustituto de pruebas; el guardado real sigue dependiendo de las garantías de PostgreSQL.

## 4. Verificación ejecutada

Entorno: Windows, Node.js `v24.16.0`, npm `11.13.0` y PostgreSQL `18.6`. Se instalaron las dependencias del backend mediante su lockfile, sin cambiar las dependencias declaradas. La ejecución con Node 22 del equipo sigue pendiente.

| Comando desde la raíz | Resultado |
| --- | --- |
| `npm.cmd run typecheck --prefix backend` | Aprobado. |
| `npm.cmd test --prefix backend` | 43 pruebas aprobadas: 37 nuevas y las 6 históricas. |
| `npm.cmd run build:backend` | Aprobado. |
| `node backend/scripts/test-hu32-sql.mjs --pg-bin "C:\Program Files\PostgreSQL\18\bin" --with-backend` | 35 comprobaciones SQL y 24 pruebas de contrato aprobadas: 12 memoria y 12 PostgreSQL. Instancia temporal detenida correctamente. |

Los 12 casos de memoria también forman parte de las 43 pruebas del comando habitual; las cifras describen ejecuciones distintas y no se suman como casos únicos.

Las pruebas HTTP usan Express, el servicio y los middleware JWT reales con valores ficticios y persistencia en memoria, en un puerto de loopback. Cubren lectura/guardado, JWT ausente o inválido, rol incorrecto, propiedad, campos adicionales, índices de error, versión, estado, hora y errores técnicos.

Las pruebas del adaptador comprueban nombres/parámetros RPC, todos los rechazos de negocio, fechas UTC y respuestas externas inesperadas. La suite con PostgreSQL sustituye únicamente el transporte PostgREST por consultas parametrizadas a la instancia temporal y ejecuta las funciones como `service_role`, manteniendo el adaptador de producción. No prueba el servicio remoto de Supabase ni su transporte HTTP real.

El comando habitual omite la suite PostgreSQL si no está presente la configuración temporal que prepara el runner; `--with-backend` la habilita en el clúster aislado. Las pruebas se ejecutaron fuera del entorno restringido cuando `tsx` necesitó consultar el usuario de Windows. No se arrancó `main.ts`, no se ejecutó el cron y no se conectó a Supabase.

No se modificó el frontend, por lo que sus comprobaciones y la interacción visual se abordarán en las fases siguientes.

## 5. Uso con el entorno compartido y siguiente fase

Antes de utilizar estos endpoints contra DEV, coordinar la versión compartida del plan, aplicar las migraciones en el orden acordado con Sebastian y respetar el control de cron del equipo. La fase 4 prepara la conexión a las RPC; no las instala en una base remota ni elimina la precondición de fase 3.

Continuación: [fase 5 — editor de puntos](fase-5-interfaz.md), con acceso desde el listado, edición, guardado y revisión de errores y conflictos. Git, commits, push y PR siguen a cargo de Andriy.
