import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Providers } from './app/Providers.js';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

createRoot(root).render(
  <StrictMode>
    <Providers>
      <div className="min-h-screen flex items-center justify-center">
        {/* placeholder until Slice 4 routes */}
        <h1 className="text-2xl font-bold">Smart Wallet</h1>
      </div>
    </Providers>
  </StrictMode>,
);
