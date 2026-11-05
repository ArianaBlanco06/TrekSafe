# Crea y apaga PostgreSQL local desechable. No utiliza DATABASE_URL ni Supabase.
param([string]$PostgresBin = '', [switch]$IncluirPreparacion)
$ErrorActionPreference = 'Stop'
if (-not $PostgresBin) { $PostgresBin = Split-Path (Get-Command initdb.exe -ErrorAction Stop).Source }
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$testDir = Join-Path $env:TEMP ('treksafe-hu30-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDir | Out-Null
$dataDir = Join-Path $testDir 'data'
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
try { $listener.Start(); $testPort = $listener.LocalEndpoint.Port } finally { $listener.Stop() }
$previousTestUrl = $env:HU30_TEST_DATABASE_URL
$previousHu31Url = $env:HU31_TEST_DATABASE_URL
Write-Output ('Pruebas locales HU-30: ' + $testDir)
Push-Location $repoRoot
try {
    & (Join-Path $PostgresBin 'initdb.exe') -D $dataDir -U postgres -A trust --no-locale --encoding=UTF8 *> (Join-Path $testDir 'initdb.log')
    if ($LASTEXITCODE -ne 0) { throw ('initdb fallo. Revisar ' + (Join-Path $testDir 'initdb.log')) }
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $dataDir -l (Join-Path $testDir 'postgres.log') -o "-h 127.0.0.1 -p $testPort" -w start
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar PostgreSQL local.' }
    $argsSql = @('-X', '-h', '127.0.0.1', '-p', [string]$testPort, '-U', 'postgres', '-v', 'ON_ERROR_STOP=1')
    & (Join-Path $PostgresBin 'psql.exe') @argsSql -d postgres -c 'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron crear los roles de prueba.' }
    & (Join-Path $PostgresBin 'psql.exe') @argsSql -d postgres -c 'CREATE DATABASE treksafe_hu30_test;'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la base desechable.' }
    $files = @(
        'init_schema.sql',
        'backend/migrations/002_hu26_version_y_eventos_plan.sql',
        'backend/migrations/003_hu26_rpc_editar_expedicion.sql',
        'backend/migrations/20261101_hu30_listas_equipo.sql',
        'backend/migrations/20261101_hu30_operaciones_equipo.sql',
        'backend/migrations/tests/hu30_listas_equipo.test.sql',
        'backend/migrations/tests/hu30_operaciones_equipo.test.sql'
    )
    if ($IncluirPreparacion) {
        $files += @(
            'backend/migrations/004_hu31_preparacion_expedicion.sql',
            'backend/migrations/005_hu31_operaciones_preparacion.sql',
            'backend/migrations/tests/hu31_preparacion.test.sql'
        )
    }
    foreach ($file in $files) {
        $logPath = Join-Path $testDir ((Split-Path $file -Leaf) + '.log')
        # Windows PowerShell representa los NOTICE de psql como errores de PowerShell.
        # La salida se conserva en el log y el codigo nativo decide si fallo el SQL.
        $previousErrorPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & (Join-Path $PostgresBin 'psql.exe') @argsSql -d treksafe_hu30_test -f (Join-Path $repoRoot $file) *> $logPath
        } finally { $ErrorActionPreference = $previousErrorPreference }
        if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath $logPath | Select-Object -Last 20; throw ('Fallo SQL: ' + $file) }
        Write-Output ('SQL correcto: ' + $file)
    }
    $env:HU30_TEST_DATABASE_URL = "postgresql://postgres@127.0.0.1:$testPort/treksafe_hu30_test"
    $env:HU31_TEST_DATABASE_URL = if ($IncluirPreparacion) { $env:HU30_TEST_DATABASE_URL } else { $null }
    & npm.cmd test --prefix backend
    if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas del backend.' }
    & npm.cmd run test:equipo --prefix frontend
    if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas del frontend o el recorrido integrado.' }
    & (Join-Path $PostgresBin 'psql.exe') @argsSql -d treksafe_hu30_test -c 'SELECT (SELECT count(*) FROM public.usuarios) AS usuarios_semilla, (SELECT count(*) FROM public.listas_equipo) AS listas_restantes, (SELECT count(*) FROM public.items_lista_equipo) AS items_restantes;'
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la comprobacion final.' }
    if ($IncluirPreparacion) {
        $limpieza = & (Join-Path $PostgresBin 'psql.exe') @argsSql -d treksafe_hu30_test -t -A -c 'SELECT (SELECT count(*) FROM public.preparaciones_expedicion) + (SELECT count(*) FROM public.items_preparacion_expedicion);'
        if ($LASTEXITCODE -ne 0 -or ($limpieza -join '').Trim() -ne '0') { throw 'Quedaron datos de preparacion de las pruebas.' }
        Write-Output 'HU-31: cero preparaciones e items restantes.'
    }
} finally {
    $env:HU30_TEST_DATABASE_URL = $previousTestUrl
    $env:HU31_TEST_DATABASE_URL = $previousHu31Url
    if (Test-Path -LiteralPath (Join-Path $dataDir 'postmaster.pid')) {
        & (Join-Path $PostgresBin 'pg_ctl.exe') -D $dataDir -m fast -w stop
        if ($LASTEXITCODE -ne 0) { Write-Warning ('Revisar apagado de la instancia: ' + $dataDir) }
    }
    Pop-Location
}
