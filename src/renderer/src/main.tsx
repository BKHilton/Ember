import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Wait a bit for preload script to load, then check
setTimeout(() => {
  if (!window.api) {
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: #f8fafc; font-family: system-ui; flex-direction: column; gap: 16px;">
          <h2>Error: Preload script not loaded</h2>
          <p>Please check the browser console for more details.</p>
          <p style="color: #94a3b8; font-size: 14px;">Ensure the preload script is properly configured in the main process.</p>
        </div>
      `;
    }
    console.error('window.api is not defined. The preload script may not have loaded correctly.');
  } else {
    console.log('window.api is available, mounting React app');
    ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
}, 100);

