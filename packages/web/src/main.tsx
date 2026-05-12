import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('root element missing');

createRoot(rootElement).render(
  <StrictMode>
    <div className="min-h-screen flex items-center justify-center">
      <h1 className="text-2xl font-bold">Smart Wallet — Bootstrap OK</h1>
    </div>
  </StrictMode>,
);
