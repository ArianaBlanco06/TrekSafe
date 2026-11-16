# HU-34 — Fase 4: comando y API

8 de noviembre de 2026. Implementados entidad, DTO propio, puertos `IRegistroAvances`/`IConsultaAvances`, comando `RegistrarAvance`, adaptador Supabase y rutas autenticadas. `app.ts` conserva las demás rutas y conecta las dependencias.

| Operación | Resultado |
| --- | --- |
| POST `/api/expediciones/:id/avances` | 201 nuevo o 200 repetido; `{ avance, repetida }`. |
| GET `/api/expediciones/:id/avances/ultimo` | 200 `{ ultimoAvance }`, incluyendo null cuando está vacío. |

JWT y rol senderista; propietario comprobado en SQL. UUID, nota y campos extra siguen el contrato. No se aceptan hora, propietario o versión enviados en el cuerpo. Errores 400/401/403/404/409 y fallos técnicos 500 genéricos; el adaptador solo reintenta de forma acotada serialización/deadlock con la misma identidad. Las respuestas y errores conservan no-store.

Command encapsula una copia congelada de la orden y delega ejecutar en el receptor inyectado. SRP separa transporte, normalización y transacción; ISP separa lectura/registro; DIP/OCP permiten cambiar el adaptador. Sin bus o cola offline. Pruebas de DTO/comando, adaptador y HTTP verifican Unicode, inmutabilidad, parámetros, errores, JWT y resultados. La concurrencia se certifica con PostgreSQL, no con dobles.
