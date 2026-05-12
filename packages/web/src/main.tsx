import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Providers } from './app/Providers.js';
import { AppRouter } from './app/AppRouter.js';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

createRoot(root).render(
  <StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </StrictMode>,
);
