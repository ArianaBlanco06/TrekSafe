# HU-32 — Fase 2: contrato de puntos intermedios

Fecha: 1 de noviembre de 2026. Responsable: Andriy Hitoshi Enciso Rojas (@Hitoshi).

Estado: especificación de HU-32 preparada para revisión e implementación por fases. Los endpoints, tipos y ejemplos descritos todavía no están implementados. El acuerdo compartido de versión y el orden de migraciones requieren coordinación del equipo.

Base: [mapa de fase 1](fase-1-mapa.md), criterios de HU-32 del Product Backlog ISW2 y principios del material de Semana 2. Las decisiones de detalle de este documento son propuestas de diseño para satisfacer esos criterios; no son criterios adicionales ya aceptados por el PO.

## 1. Flujo y alcance

1. El senderista crea una expedición con el flujo existente.
2. Desde su listado abre «Gestionar puntos» en una expedición programada.
3. El editor consulta contexto y puntos, permite modificar la colección local y muestra cuántos de los 20 puntos están utilizados.
4. «Guardar puntos» envía la colección completa junto con la versión que se consultó.
5. La API devuelve la colección canónica persistida. Esa respuesta pasa a ser la base de la siguiente edición.

Ruta de pantalla prevista: `/senderista/expedicion/:id/puntos`, protegida para senderistas. La UI permitirá agregar, editar, quitar y mover puntos arriba/abajo. Las modificaciones locales se guardarán únicamente mediante una acción explícita del usuario.

La gestión se realizará online. Ante un error se conservará la edición en pantalla y se mostrará su causa. La visualización del recorrido completo corresponde a HU-33, los avances a HU-34 y la cola persistente offline a HU-49.

## 2. Modelo de punto y validación

El cuerpo HTTP y las respuestas usarán JSON con propiedades camelCase. Los UUID se representarán como cadenas y las coordenadas como números.

| Campo | Regla del contrato |
| --- | --- |
| `id` | UUID v4 generado por el frontend al agregar el punto, con `crypto.randomUUID()`. Se conserva al editar o reordenar. No puede repetirse en la colección ni pertenecer a otra expedición. |
| `nombre` | Cadena obligatoria: recortar espacios exteriores y exigir entre 1 y 100 caracteres Unicode, contados como puntos de código. Debe ser representable en PostgreSQL UTF-8: se rechazan NUL y sustitutos Unicode aislados. Se permiten nombres repetidos. Renderizar como texto. |
| `latitud` | Número JSON finito, sin coerción desde cadenas; entre -18.5 y 0.5 inclusive. |
| `longitud` | Número JSON finito, sin coerción desde cadenas; entre -81.5 y -68.5 inclusive. |
| `orden` | Entero entre 1 y N. Para una colección de N puntos deben existir exactamente las posiciones 1 a N, sin repetidos ni saltos. |

Reglas de colección:

- Aceptar de 0 a 20 puntos. `puntos: []` elimina todos los intermedios y conserva inicio y destino.
- `puntos` es obligatorio y debe ser un arreglo; `null`, omisión y un objeto aislado son inválidos.
- Aceptar el arreglo en cualquier secuencia física y devolverlo ordenado por `orden` ascendente. La UI renumera antes de enviar tras mover o eliminar.
- Rechazar propiedades desconocidas en el cuerpo y en cada punto. El cuerpo no permite cambiar propietario, extremos, horarios, contactos, acompañantes o estado.
- Validar las coordenadas originales antes de redondearlas. Al persistir se redondearán a cinco decimales; PostgreSQL será la autoridad de esa normalización. La respuesta devolverá números y la UI adoptará los valores recibidos.
- El rectángulo geográfico coincide con los validadores locales actuales. Es una aproximación al alcance de Perú, no una validación de sus fronteras exactas.
- Un punto puede coincidir geográficamente con otro o con un extremo: HU-32 no establece una regla de distancia mínima.

Los límites se comprobarán en servidor y se reforzarán en la transacción. La UI ofrecerá validación anticipada. Se reutilizará la validación numérica geográfica existente, sin convertir números a cadenas para volver a analizarlos con la expresión regular de pares de coordenadas.

## 3. Identidad y conservación

Los IDs nuevos se incluyen desde el primer guardado. Esto permite mantener la misma identidad si se pierde una respuesta y se vuelve a consultar. Los puntos existentes conservarán su ID al editar, reordenar o guardar sin cambios; el orden nunca será su identidad.

En una actualización se consideran eliminados los puntos existentes omitidos del arreglo. Un UUID perteneciente a otra expedición produce un error genérico de ID inválido, sin revelar su propietario. La transacción no trasladará puntos entre expediciones.

La operación modifica exclusivamente la colección de puntos y los metadatos de versión/actualización del plan. Conserva las coordenadas y nombres de inicio/destino, horas, tolerancia, estado, contactos y acompañantes. Cuando la expedición se inicia, la colección queda sin edición por HU-32; HU-34 podrá referenciar los IDs persistidos.

## 4. Autorización, estado y tiempo

Ambos endpoints requieren `Authorization: Bearer <JWT>` y rol `senderista`. El backend obtiene el actor del JWT validado; ese ID no se acepta desde el cuerpo ni desde parámetros elegidos por el cliente.

| Acción | Condiciones |
| --- | --- |
| Consultar | Ser propietario de la expedición. Se permite lectura en todos los estados existentes para el propietario. |
| Guardar | Ser propietario, estado `programada`, salida estrictamente futura y versión vigente. |

La hora de la base de datos gobierna la decisión de guardado. Si la salida ya llegó, se rechaza aunque el cron todavía mantenga el estado `programada`. Esta interpretación concreta la edición previa al inicio y se presenta al PO con la historia.

La transacción bloqueará la fila de la expedición y evaluará la hora actual después de obtener el bloqueo. Si esperó a otra operación, no reutilizará una hora anterior a esa espera. La lectura inicial de la UI y una comprobación previa de aplicación no sustituyen estas verificaciones.

Una expedición ajena y una inexistente responden igual: `404 NO_ENCONTRADO`. Para `cancelada`, cuando HU-27 esté integrada, la lectura del propietario seguirá disponible y el guardado será rechazado por estado.

## 5. Versión del plan: propuesta de coordinación

La copia local no contiene un campo de versión. Se propone **una única versión del plan compartida con HU-26**, llamada `version` en los ejemplos, entera positiva, inicial 1. Su nombre físico, migración de origen y participación en otros cambios deben acordarse con Favio y Sebastian antes de aplicar el SQL en DEV compartido. Para avanzar con la fase 3 se prepara SQL revisable con una precondición explícita de versión y se valida en una instancia temporal con un fixture; esto no confirma el acuerdo compartido ni crea su migración por cuenta de HU-32.

Comportamiento que necesita HU-32:

1. La consulta devuelve la versión junto con una fotografía consistente del plan y la colección.
2. El cliente envía esa versión como `versionEsperada`.
3. Bajo bloqueo se comprueban propietario, estado/hora y versión; después se valida y guarda la colección.
4. Un cambio efectivo incrementa la versión una sola vez y actualiza `actualizado_en` en la misma transacción.
5. Guardar la misma colección canónica con la versión vigente devuelve el mismo resultado y versión, sin escribir cambios.
6. Una versión obsoleta devuelve `409 VERSION_PLAN_OBSOLETA` y conserva la colección actual.

Con dos guardados distintos sobre la misma versión, uno podrá completar el cambio y el otro deberá recibir conflicto. Las operaciones de edición/cancelación deberán coordinar bloqueo y versión del mismo agregado para evitar pérdidas de cambios.

Si una respuesta se pierde después del commit, reenviar el mismo cuerpo con la versión anterior puede devolver conflicto. El cliente consultará de nuevo y comparará IDs y contenido canónico: si coinciden, recupera el estado guardado; si difieren, permite revisar las diferencias. Esta recuperación conserva un solo conjunto de puntos y no promete que una solicitud con versión obsoleta obtenga otra respuesta de éxito.

La UI conservará la edición local ante conflicto y solicitará una recarga explícita para revisar cambios. No reintentará automáticamente con una versión nueva porque podría sobrescribir trabajo ajeno.

## 6. Consulta HTTP

`GET /api/expediciones/:id/puntos`

El parámetro `id` debe ser un UUID válido. Respuesta `200` con el siguiente formato; fechas de ejemplo ficticias en UTC. El valor `editable` supone una consulta anterior a la salida del ejemplo.

```json
{
  "expedicion": {
    "id": "b1d0d5c0-8327-4af1-9cc1-2e83ae7e0320",
    "estado": "programada",
    "lugarInicio": "Cebollapampa",
    "lugarFin": "Laguna 69",
    "coordenadasInicio": "-9.04500, -77.60800",
    "coordenadasFin": "-9.01050, -77.60420",
    "horaInicio": "2026-11-15T12:00:00.000Z",
    "version": 3,
    "editable": true
  },
  "puntos": [
    {
      "id": "42f581d6-8731-4fa6-8ace-e710b97c45f9",
      "nombre": "Mirador",
      "latitud": -9.03012,
      "longitud": -77.60634,
      "orden": 1
    }
  ]
}
```

Los extremos conservan la representación de la API existente: cadenas `lat, lon` o `null`. Las expediciones sin puntos devuelven `puntos: []`. `editable` refleja estado y hora del servidor al consultar; se volverá a comprobar al guardar. La respuesta no incluye ficha médica ni contactos.

La persistencia deberá entregar contexto, versión y puntos desde una lectura consistente. Varias peticiones HTTP independientes a Supabase sin garantía de fotografía compartida podrían mezclar una versión antigua con puntos nuevos.

## 7. Guardado HTTP

`PUT /api/expediciones/:id/puntos`

Cabeceras: `Authorization: Bearer <JWT>` y `Content-Type: application/json`.

```json
{
  "versionEsperada": 3,
  "puntos": [
    {
      "id": "42f581d6-8731-4fa6-8ace-e710b97c45f9",
      "nombre": "Mirador principal",
      "latitud": -9.03012,
      "longitud": -77.60634,
      "orden": 2
    },
    {
      "id": "2a4b3e31-fb45-48b6-aab0-9b5632c7b4a9",
      "nombre": "Zona de descanso",
      "latitud": -9.03715,
      "longitud": -77.60721,
      "orden": 1
    }
  ]
}
```

`versionEsperada` debe ser un entero positivo representable de forma segura en JavaScript. Respuesta `200`:

```json
{
  "mensaje": "Puntos de ruta guardados",
  "expedicion": {
    "id": "b1d0d5c0-8327-4af1-9cc1-2e83ae7e0320",
    "estado": "programada",
    "lugarInicio": "Cebollapampa",
    "lugarFin": "Laguna 69",
    "coordenadasInicio": "-9.04500, -77.60800",
    "coordenadasFin": "-9.01050, -77.60420",
    "horaInicio": "2026-11-15T12:00:00.000Z",
    "version": 4,
    "editable": true
  },
  "puntos": [
    {
      "id": "2a4b3e31-fb45-48b6-aab0-9b5632c7b4a9",
      "nombre": "Zona de descanso",
      "latitud": -9.03715,
      "longitud": -77.60721,
      "orden": 1
    },
    {
      "id": "42f581d6-8731-4fa6-8ace-e710b97c45f9",
      "nombre": "Mirador principal",
      "latitud": -9.03012,
      "longitud": -77.60634,
      "orden": 2
    }
  ]
}
```

El guardado devuelve la fotografía resultante de su transacción. Un cambio posterior del cron o de otra sesión puede volverla obsoleta, por lo que la UI siempre debe manejar conflictos posteriores.

Eliminar todos los puntos usa el mismo endpoint, con `versionEsperada` vigente:

```json
{
  "versionEsperada": 4,
  "puntos": []
}
```

## 8. Errores y precedencia

Se conserva la forma de errores utilizada por el proyecto: `error`, `mensaje`, `codigo` cuando corresponda y `detalles` como diccionario de listas de mensajes.

| HTTP | Código | Situación |
| --- | --- | --- |
| 400 | `DATOS_PUNTOS_INVALIDOS` | UUID de parámetro/cuerpo inválido, versión mal formada, propiedades desconocidas o reglas de colección/campos incumplidas. |
| 401 | `NO_AUTORIZADO` o `TOKEN_INVALIDO` | Falta JWT o no es válido, siguiendo el middleware existente. |
| 403 | `PROHIBIDO` | El usuario autenticado tiene otro rol. |
| 404 | `NO_ENCONTRADO` | Expedición inexistente o ajena. |
| 409 | `EXPEDICION_NO_EDITABLE` | Estado distinto de `programada`. |
| 409 | `EXPEDICION_YA_INICIADA` | Salida alcanzada aunque conserve estado `programada`. |
| 409 | `VERSION_PLAN_OBSOLETA` | La versión esperada ya no está vigente. |
| 500 | Sin código de negocio | Fallo inesperado; mensaje genérico sin SQL, credenciales o datos de otros usuarios. |

Precedencia: autenticación y rol; formato de parámetro/cuerpo; búsqueda privada; estado; hora de salida; versión; pertenencia de IDs y guardado. Las validaciones estructurales se realizan antes del acceso a datos. Los conflictos consultan únicamente el plan autorizado.

Ejemplo de error por punto, usando índices de arreglo desde cero:

```json
{
  "error": "ErrorValidacion",
  "mensaje": "Datos de puntos inválidos",
  "codigo": "DATOS_PUNTOS_INVALIDOS",
  "detalles": {
    "puntos.0.nombre": ["El nombre es obligatorio"],
    "puntos.1.orden": ["El orden debe ser único y consecutivo"]
  }
}
```

El adaptador HTTP de HU-32 deberá convertir las rutas de validación al diccionario de claves por campo; el `flatten()` del manejador global actual agrupa errores anidados y pierde ese detalle. Se mantendrá el formato que ya entiende `ErrorClienteApi`, sin rediseñar los errores de todas las historias.

Ejemplo de conflicto:

```json
{
  "error": "ErrorAplicacion",
  "mensaje": "La expedición cambió. Vuelve a consultarla antes de guardar",
  "codigo": "VERSION_PLAN_OBSOLETA"
}
```

## 9. Contratos internos y SOLID

Estos nombres y firmas describen responsabilidades para la implementación futura. No se crean clases ni interfaces de producción durante esta fase.

| Componente previsto | Contrato o responsabilidad |
| --- | --- |
| `PuntoRuta` | Valor persistido con `id`, `nombre`, `latitud`, `longitud` y `orden`. |
| `RutaConPuntos` | Contexto público del propietario y colección canónica, con la forma de respuesta descrita. |
| `IConsultaPuntosRuta` | `consultarPropia(senderistaId, expedicionId): Promise<RutaConPuntos o null>`. Devuelve una fotografía consistente y privada. |
| `IGuardadoPuntosRuta` | `guardarColeccionPropia({senderistaId, expedicionId, versionEsperada, puntos}): Promise<ResultadoGuardadoPuntos>`. Garantiza atomicidad, propiedad, estado, tiempo, versión e identidad. |
| `ResultadoGuardadoPuntos` | Unión de éxito con `RutaConPuntos` o rechazo por no encontrado, estado, inicio, versión o datos/IDs inválidos. Los errores de negocio no contienen estados HTTP. |
| `ServicioPuntosRuta` | Recibe ambos contratos por constructor; normaliza y valida reglas puras, coordina consulta/guardado y expresa rechazos de negocio. No importa Supabase, Express o repositorios concretos. |
| `RepositorioPuntosRuta` | Implementa ambos contratos mediante Supabase y RPC. Traduce resultados SQL a resultados del contrato y deja las excepciones técnicas para el manejo genérico. |
| `ControladorPuntosRuta` | Extrae actor, valida entrada HTTP, llama al caso de uso y mapea resultados a HTTP/JSON. |
| Ensamblaje | Crea las dependencias concretas e inyecta el servicio al controlador/rutas. |

Los nombres de propiedades son compartidos conceptualmente entre UI y API; la aplicación no depende de los tipos de tablas SQL. La migración puede usar snake_case y el repositorio realiza la adaptación.

Evidencia de diseño prevista:

- **SRP:** controlador, servicio, persistencia y editor tienen responsabilidades separadas.
- **OCP y DIP:** el servicio consume contratos y se mantiene al sustituir la implementación de datos.
- **LSP:** memoria y Supabase cumplen las mismas reglas observables, incluyendo rechazos y conservación de datos al fallar. Una suite de contrato prueba ambas implementaciones; SQL requiere además una prueba real de rollback y concurrencia.
- **ISP:** consulta y guardado se expresan mediante interfaces pequeñas, sin métodos de funciones ajenas.
- **KISS y YAGNI:** una actualización de colección y dos contratos acotados. La política de tiempo del guardado vive en la operación transaccional; el repositorio en memoria usará un reloj sustituible para probar sus límites.

## 10. Transacción y lectura que deberá implementar fase 3

La migración tendrá que preparar tabla de puntos, restricciones y RPC. El algoritmo de guardado esperado es:

1. Obtener la expedición propia y bloquear su fila.
2. Verificar estado, hora de salida actual y versión esperada con la precedencia acordada.
3. Validar de nuevo la colección completa y rechazar IDs asociados a otras expediciones antes de modificar filas.
4. Normalizar nombres y coordenadas, y detectar si existe un cambio efectivo.
5. Aplicar altas, cambios, reordenación y bajas conservando los IDs. El intercambio de dos posiciones debe funcionar aunque exista unicidad por expedición/orden; diseñar la restricción o el procedimiento para ello.
6. Actualizar versión/metadatos si hubo cambio efectivo y devolver la fotografía resultante dentro de la misma transacción.
7. Ante cualquier fallo, revertir todo. Un rechazo no elimina ni modifica puntos existentes.

Toda escritura de la colección debe pasar por el mismo bloqueo del plan para controlar máximo y orden. La lectura deberá usar una operación consistente de contexto y colección. Tabla y funciones tendrán RLS/permisos restringidos al backend de acuerdo con la arquitectura actual; el rol del servidor aplica la identidad validada por TrekSafe, que usa JWT propio y no Supabase Auth.

No se reutilizará `init_schema.sql` sobre DEV con datos. La fase 3 preparará SQL incremental revisable; su aplicación en la base compartida seguirá la coordinación de migraciones del equipo.

## 11. Ejemplos de aceptación y revisión

| Caso | Resultado esperado |
| --- | --- |
| Crear el primer punto | ID persistido y estable; versión aumenta una vez. |
| Renombrar y mover el mismo punto | Conserva ID; devuelve nombre normalizado y orden correcto. |
| Enviar puntos fuera de secuencia física | Se ordenan por el campo `orden` de la respuesta. |
| Eliminar todos | Colección vacía; extremos y demás datos del plan conservados. |
| Guardar 20 / guardar 21 | Éxito / 400 sin modificar la colección anterior. |
| Nombre vacío, 101 caracteres, número como cadena, coordenada fuera de límites | 400 con error por campo; sin cambios. |
| ID repetido / ID de otra expedición | 400; sin exponer la otra expedición ni modificar ninguna. |
| Orden 0, fraccionario, repetido o con saltos | 400; sin cambios. |
| Falta JWT / rol rescatista / plan ajeno | 401 / 403 / 404. |
| Plan en progreso, alerta, completado o cancelado al integrar HU-27 | 409 al guardar; lectura privada disponible. |
| Hora de salida exactamente alcanzada | 409 aunque el estado siga programado; usar reloj controlado. |
| Dos cambios distintos con la misma versión | Un cambio exitoso y un conflicto; sin combinación parcial. |
| Respuesta perdida y reconsulta | Recupera los mismos IDs; no se crea una segunda colección. |
| Guardado idéntico con versión vigente | Misma colección y misma versión. |
| Fallo durante escritura / intercambio de posiciones | Rollback completo / éxito conservando IDs y unicidad. |
| Consulta mientras otra sesión guarda | Contexto, versión y puntos de una misma fotografía. |

## 12. Coordinación y cierre

| Con quién | Decisión que debe confirmarse antes de integrar |
| --- | --- |
| Favio | Nombre y semántica de la versión única del plan; qué operaciones la incrementan; compatibilidad con edición/cancelación, bloqueos y conflictos. |
| Sebastian | Migración que crea la versión si no existe, orden de archivos, tabla/RPC, permisos y registro de aplicación. |
| Marko como PO | Revisión de las interpretaciones propuestas: colección vacía, límite de nombre, precisión/geografía y salida futura. |

Estos puntos se dejan como coordinación pendiente; no se contactó a los integrantes ni se comprobó su trabajo remoto. Los ejemplos de `version` concretan una propuesta verificable y deberán ajustarse si el contrato compartido usa otro nombre o semántica.

La fase 2 entrega el contrato documentado y ejemplos para revisar. La verificación de esta fase comprende consistencia de ejemplos y referencias; todavía no hay endpoints, migraciones o pruebas funcionales ejecutadas. Las dependencias locales y la línea base técnica continúan pendientes según fase 1.

Continuación: [fase 3 — persistencia y validación SQL](fase-3-persistencia.md). La migración preparada requiere `expediciones.version BIGINT NOT NULL` con default y detiene su aplicación si falta ese requisito. El acuerdo compartido de versión y el orden de migraciones siguen pendientes de coordinación antes de aplicar en DEV. Git y la publicación permanecen a cargo de Andriy.
