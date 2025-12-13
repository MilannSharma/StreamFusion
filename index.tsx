import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log('✓ index.tsx loaded');
console.log('Current URL:', window.location.href);
console.log('Document ready state:', document.readyState);

const rootElement = document.getElementById('root');
console.log('Root element found:', !!rootElement);

if (!rootElement) {
  console.error('ERROR: Could not find root element to mount to');
  throw new Error("Could not find root element to mount to");
}

console.log('✓ Mounting React app...');
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
console.log('✓ React app rendered');