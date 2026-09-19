import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { initializeRenderingProfile } from './performance/renderingProfile';
import { PwaRuntimeNotice } from './pwa/PwaRuntimeNotice';
import { registerYeenPwa } from './pwa/pwaRuntime';
import './index.css';

initializeRenderingProfile();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PwaRuntimeNotice />
  </StrictMode>,
);

registerYeenPwa(registerSW, {
  isProduction: import.meta.env.PROD,
  isNativePlatform: Capacitor.isNativePlatform(),
  serviceWorkerSupported: 'serviceWorker' in navigator,
});
