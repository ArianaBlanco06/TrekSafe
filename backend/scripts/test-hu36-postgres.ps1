# HU-36: crea y apaga PostgreSQL local desechable. No utiliza DATABASE_URL ni Supabase.
# Aplica el esquema inicial, 002 a 007 y 010, ejecuta la suite SQL de eventos_plan y
# la integracion Node (contrato del lector contra PostgreSQL real mediante puente fetch).
param([string]$PostgresBin = '')
$ErrorActionPreference = 'Stop'
if (-not $PostgresBin) { $PostgresBin = Split-Path (Get-Command initdb.exe -ErrorAction Stop).Source }
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$testDir = Join-Path $env:TEMP ('treksafe-hu36-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDir | Out-Null
$dataDir = Join-Path $testDir 'data'
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
try { $listener.Start(); $testPort = $listener.LocalEndpoint.Port } finally { $listener.Stop() }
$previousHu36Url = $env:HU36_TEST_DATABASE_URL
# Emula los privilegios por defecto de Supabase para service_role (CRUD en public y en
# las tablas que se creen despues). init_schema.sql no concede nada a service_role; asi
# la 010 debe retirar de verdad UPDATE, DELETE y TRUNCATE sobre eventos_plan.
$privilegiosSupabase = 'GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;'
Write-Output ('Pruebas locales HU-36: ' + $testDir)
Push-Location $repoRoot
try {
    & (Join-Path $PostgresBin 'initdb.exe') -D $dataDir -U postgres -A trust --no-locale --encoding=UTF8 *> (Join-Path $testDir 'initdb.log')
    if ($LASTEXITCODE -ne 0) { throw ('initdb fallo. Revisar ' + (Join-Path $testDir 'initdb.log')) }
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $dataDir -l (Join-Path $testDir 'postgres.log') -o "-h 127.0.0.1 -p $testPort" -w start
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar PostgreSQL local.' }
    $argsSql = @('-X', '-h', '127.0.0.1', '-p', [string]$testPort, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1')
    & (Join-Path $PostgresBin 'psql.exe') @argsSql -d postgres -c 'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron crear los roles de prueba.' }
    & (Join-Path $PostgresBin 'psql.exe') @argsSql -d postgres -c 'CREATE DATABASE treksafe_hu36_test;'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la base desechable.' }
    # 010 se aplica dos veces para comprobar que es re-ejecutable.
    $files = @(
        'init_schema.sql',
        'backend/migrations/002_hu26_version_y_eventos_plan.sql',
        'backend/migrations/003_hu26_rpc_editar_expedicion.sql',
        'backend/migrations/004_hu27_estado_cancelada.sql',
        'backend/migrations/005_hu27_rpc_cancelar_expedicion.sql',
        'backend/migrations/006_hu27_permiso_anonimizar_eventos.sql',
        'backend/migrations/007_hu35_rpc_ampliar_retorno.sql',
        'backend/migrations/010_hu36_eventos_plan_solo_anexado.sql',
        'backend/migrations/010_hu36_eventos_plan_solo_anexado.sql',
        'backend/migrations/tests/hu36_eventos_plan_solo_anexado.test.sql'
    )
    $indice = 0
    foreach ($file in $files) {
        $indice++
        $logPath = Join-Path $testDir (([string]$indice) + '-' + (Split-Path $file -Leaf) + '.log')
        # Windows PowerShell representa los NOTICE de psql como errores de PowerShell.
        # La salida se conserva en el log y el codigo nativo decide si fallo el SQL.
        $previousErrorPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & (Join-Path $PostgresBin 'psql.exe') @argsSql -d treksafe_hu36_test -f (Join-Path $repoRoot $file) *> $logPath
        } finally { $ErrorActionPreference = $previousErrorPreference }
        if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath $logPath | Select-Object -Last 20; throw ('Fallo SQL: ' + $file) }
        Write-Output ('SQL correcto: ' + $file)
        if ($file -eq 'init_schema.sql') {
            & (Join-Path $PostgresBin 'psql.exe') @argsSql -d treksafe_hu36_test -c $privilegiosSupabase
            if ($LASTEXITCODE -ne 0) { throw 'No se pudieron emular los privilegios por defecto de Supabase.' }
        }
    }
    $env:HU36_TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:$testPort/treksafe_hu36_test"
    Push-Location (Join-Path $repoRoot 'backend')
    try {
        & node.exe --import tsx --test src/testing/hu36Postgres.integration.test.ts
        if ($LASTEXITCODE -ne 0) { throw 'Fallo la integracion Node de HU-36 contra PostgreSQL.' }
    } finally { Pop-Location }
    $restantes = & (Join-Path $PostgresBin 'psql.exe') @argsSql -d treksafe_hu36_test -t -A -c 'SELECT count(*) FROM public.eventos_plan;'
    if ($LASTEXITCODE -ne 0 -or ($restantes -join '').Trim() -ne '0') { throw 'Quedaron eventos de las pruebas.' }
    Write-Output 'HU-36: cero eventos restantes.'
} finally {
    $env:HU36_TEST_DATABASE_URL = $previousHu36Url
    if (Test-Path -LiteralPath (Join-Path $dataDir 'postmaster.pid')) {
        & (Join-Path $PostgresBin 'pg_ctl.exe') -D $dataDir -m fast -w stop
        if ($LASTEXITCODE -ne 0) { Write-Warning ('Revisar apagado de la instancia: ' + $dataDir) }
    }
    Pop-Location
}
