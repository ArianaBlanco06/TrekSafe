# Revisión PO de #126 — 2026-11-13

Base: `develop` `6ad98a9`. Revisión y pruebas ejecutadas por Codex por delegación de Marko. Las decisiones D1–D7 fueron confirmadas por el PO; no se atribuye una demostración presencial al usuario.

Se conciliaron composición y rutas con HU-40, conservando relevo, bitácora y cierre. El runner conjunto instala la 021 antes de 025 y activa el contrato PostgreSQL de HU-42. La migración histórica 021 no se altera.

| Criterio | Prueba / resultado | Entorno |
|---|---|---|
| CA-01: responsable, localizado, campos | SQL HU-42, contrato DAO, HTTP; cierre/relevo con dos conexiones reales | PostgreSQL 17.11 desechable |
| CA-02: cierre, informe y bitácora atómicos | 39 escenarios del runner HU-42; dos cierres, mismo comando, nota concurrente, rollback inyectado | PostgreSQL 17.11 desechable |
| CA-03: estados separados | Contrato y SQL verifican que la expedición no cambia, incluso tras retorno previo | PostgreSQL 17.11 desechable |
| Regresión backend | 978 pruebas aprobadas, tipos y build | Node 22.23.4 local |
| Regresión frontend | 238 aprobadas, 2 condicionales omitidas; tipos y build aprobados | Node 22.23.4 local |
| Navegador | 13 UI y 22 PWA/privacidad aprobadas | Edge headless local |
| Integración de esquema | 30 escenarios PG/PostgREST aprobados; incluye contratos SQL de HU-30/31/36/41/42 | PG 17.11 / PostgREST 16.5 local |

## Puerta de DEV y merge

**025 sigue pendiente de aplicación por Ariana en DEV.** Antes del merge se compararán catálogo, funciones, permisos y asiento; solo se aplicará si realmente falta. Conservar la 021 existente; 025 concede los privilegios de columnas adicionales necesarios para cerrar y localizar. Recargar el esquema de PostgREST y verificar permisos y una transacción ficticia revertida, sin cron ni correo.

No ejecutar `init_schema.sql`, no repetir 015/017/018/019/021/022/023/024 y no registrar aplicaciones hipotéticas. Esta evidencia no acredita publicación en Fly/Vercel ni aceptación integral de #112. La aprobación final y el cierre de #43 esperan DEV y CI del último commit.
