# Evidencias de DEP-01 / #106

Fecha: **2026-11-10 (Lima)**. Base: `8508bb449fe731342834a528327fa40b15a83b94`. Registro de la ejecución documental; no constituye una prueba funcional del despliegue.

## Fuentes consultadas y alcance

| ID | Consulta | Resultado / uso |
|---|---|---|
| E1 | `git fetch origin`, revisión de `origin/main`, `origin/develop`, código/configuración | Main `f89d6af`, develop `8508bb4`; tabla de fuentes en estado actual |
| E2 | GitHub, lista de PR abiertos y lectura de #103/#104 | #90/#93/#94/#105 abiertos; #103/#104 integrados con hashes y fechas registradas |
| E3 | GET HTTPS a las dos URLs del README con `Invoke-WebRequest -TimeoutSec 20` | Vercel 404; Fly sin resolución de host incluso con acceso de red ampliado; no se infiere estado global de cuentas |
| E4 | `list_projects`, `list_migrations` y SELECT de Supabase conectado | DEV visible y saludable; dos migraciones iniciales y 18 asientos propios; sin DDL ni consulta de datos personales |
| E5 | `gh api repos/ArianaBlanco06/TrekSafe/deployments?per_page=5` | Sin registros; no acredita ausencia de publicaciones externas |
| E6 | Inspección de herramientas/variables disponibles, solo nombres | CLI Fly/Vercel no encontrada y sin conexión autenticada equivalente disponible; inventario/facturas no verificados |
| E7 | Fuentes oficiales de proveedores y patrón outbox | Precios y capacidades citados en decisiones; supuestos/costos de cuentas separados |

Consulta SQL ejecutada sobre **DEV**, exclusivamente de lectura:

```sql
select version, nombre, aplicada_en
from public.treksafe_migraciones
order by aplicada_en, version;
```

Versiones devueltas: `000`, `001`, `011`, `008`, `009`, `004`, `005`, `006`, `007`, `010`, `012`, `013`, `014`, `016`, `002`, `003`, `hu30_listas`, `hu30_operaciones`. Consultar un registro no prueba que todos los objetos coincidan con el código actual. No se modificó ese registro.

Reproducción de fuentes de código, desde la raíz:

```powershell
git show 8508bb449fe731342834a528327fa40b15a83b94:backend/fly.toml
git show 8508bb449fe731342834a528327fa40b15a83b94:backend/src/main.ts
git show c7614b191a24440dfd01d7624b3229f7c30d902f:backend/src/main.ts
git show c7614b191a24440dfd01d7624b3229f7c30d902f:backend/migrations/012_hu45_outbox.sql
```

Las tarifas y el changelog de Supabase se consultaron el 2026-11-10. Se mantiene el SDK y no se implementan funciones de producto nuevas. Los comandos de migración existentes se revisarán con la versión real de la CLI en #110; #106 no introduce comandos basados en asumir una versión instalada.

## QA documental

| Comprobación | Resultado |
|---|---|
| Correspondencia con base y estados GitHub | Verificada con E1/E2; los documentos distinguen código base y propuesta |
| Enlaces locales y anclas | 9 documentos Markdown, 64 referencias locales comprobadas; ningún destino o ancla faltante |
| Renderizado Mermaid y vistas SVG | 4 diagramas renderizados a SVG y PNG con Mermaid CLI 12.2.0 y Chrome headless; revisión visual de contexto, despliegue, secuencia y estado actual |
| Trazabilidad de siete tareas y cinco criterios #106 | Siete issues enlazadas en matriz; cinco criterios asociados a entregables en el índice; separación entre resultados y pruebas futuras revisada |
| Diferencias limitadas a documentación | README y dossier Markdown/SVG; ningún cambio de runtime, SQL, configuración ejecutable o dependencias del proyecto |

El verificador temporal de enlaces y el renderizador se ejecutan fuera de las dependencias del producto, bajo `outputs/issue-106-qa/` (no incluido en el PR). Para reproducir el renderizado, extraer cada bloque Mermaid a un `.mmd` temporal y usar Mermaid CLI 12.2.0 con navegador headless disponible:

```powershell
npx --yes --package @mermaid-js/mermaid-cli@12.2.0 mmdc -i <diagrama.mmd> -o <salida.svg> -p <config-navegador.json> -b white
git diff --check
git diff --name-only 8508bb449fe731342834a528327fa40b15a83b94
```

La configuración temporal de Puppeteer identifica el ejecutable local de Chrome y `headless: true`. Los PNG se usaron solo para inspección; se versionan las cuatro vistas SVG junto al Mermaid de los documentos. La ejecución del verificador utilizó Node 24.20.0 como herramienta local; el runtime de la aplicación sigue definido en Node 22, sin cambios.

## Límites de esta entrega

No se desplegaron servicios, enviaron correos, aplicaron migraciones ni ejecutó el cron. No se certificó una revisión publicada ni disponibilidad continua real. No se ejecutan suites funcionales para acreditar cambios inexistentes de runtime: sus escenarios están asignados en la matriz y corresponden a las siguientes issues.

Antes de #112 se deben identificar los proyectos y cuentas publicados, comprobar costo total, recursos y versiones, y ejecutar la matriz funcional contra el destino real. El 404 y el error de resolución se conservan como resultados de la consulta, no como diagnóstico definitivo del proveedor.
