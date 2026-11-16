# Amplia el entorno desechable de HU-30 con HU-31; solo loopback, nunca Supabase.
param([string]$PostgresBin = '')
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'test-hu30-postgres.ps1') -PostgresBin $PostgresBin -IncluirPreparacion
