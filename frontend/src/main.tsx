import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { initThemeBeforeRender } from './lib/tema';
import { warmOfflineCache } from './lib/offlineStorage';
import './styles/index.css';

initThemeBeforeRender();

if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisteredSW() {
      void warmOfflineCache();
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
