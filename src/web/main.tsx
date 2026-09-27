import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import { AppDataProvider } from './state/AppDataContext';
import { ToastProvider } from './state/useToast';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <AppDataProvider>
        <App />
      </AppDataProvider>
    </ToastProvider>
  </React.StrictMode>,
);
