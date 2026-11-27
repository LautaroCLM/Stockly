import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { applyTheme, getInitialTheme } from './lib/theme';
import { initErrorReporting } from './lib/monitoring/errorReporting';
import './index.css';

// Se aplica antes de renderizar para que no parpadee el tema equivocado.
applyTheme(getInitialTheme());

// Alertas de errores (solo en producción y con clave de Sentry)
initErrorReporting();

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el elemento raíz con id "root".');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary scope="app">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
