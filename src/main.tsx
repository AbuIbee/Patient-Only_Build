import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'

// The enterprise Vercel build owns its own visual identity. Never rebrand the
// shared My Memoria Ally patient/Android production build.
if (import.meta.env.VITE_ENTERPRISE_SITE === 'true') {
  document.documentElement.classList.add('haneen-site');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
