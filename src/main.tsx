import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'

// The enterprise Vercel build owns its own visual identity. Never rebrand the
// shared My Memoria Ally patient/Android production build.
if (import.meta.env.VITE_ENTERPRISE_SITE === 'true') {
  document.documentElement.classList.add('haneen-site');
  document.title = 'Haneen Care Network';
  document.querySelector('link[rel="icon"]')?.setAttribute('href', '/haneen-favicon.svg');
  document.querySelector('link[rel="icon"]')?.setAttribute('type', 'image/svg+xml');
  document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', '/haneen-favicon.svg');
  document.querySelector('meta[name="description"]')?.setAttribute(
    'content',
    'Haneen Care Network — enterprise care coordination and professional care management.'
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
