// Reutiliza el clúster desechable y las fixtures reales de HU-47, sin .env ni DEV.
process.argv.push('--hu48');
await import('./test-hu47-postgres.mjs');
