import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { initThemeBeforeRender } from './lib/tema';
import { retirarDatosLegacy } from './lib/privacidadCache';
import './styles/index.css';

initThemeBeforeRender();

async function iniciar() {
  // No importar datos globales antiguos dentro de la nueva sesion.
  await retirarDatosLegacy().catch(() => console.error('No se pudieron retirar las cachés antiguas.'));
  if ('serviceWorker' in navigator) registerSW({ immediate: true });
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void iniciar();
