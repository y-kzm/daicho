import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import { AppDataProvider } from './state/AppDataContext';
import { DriveProvider } from './state/DriveContext';
import { ToastProvider } from './state/useToast';
import './styles/base.css';
import './styles/shell.css';
import './styles/library.css';
import './styles/dialogs.css';
import './styles/venues.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <AppDataProvider>
        <DriveProvider>
          <App />
        </DriveProvider>
      </AppDataProvider>
    </ToastProvider>
  </React.StrictMode>,
);
