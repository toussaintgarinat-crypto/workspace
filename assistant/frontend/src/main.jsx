import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { initAuth } from './services/keycloak.js';

(async () => {
  const res = await fetch('/api/v1/auth/config');
  const authConfig = await res.json();
  await initAuth(authConfig);

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
})();
