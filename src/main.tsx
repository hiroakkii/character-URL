import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/biz-udpgothic/400.css';
import '@fontsource/biz-udpgothic/700.css';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
