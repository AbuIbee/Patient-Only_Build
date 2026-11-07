import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Load the application after the bootstrap is available so a module-level
// SecurityError cannot leave a permanently empty #root in restricted Edge.

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

// If a browser blocks storage during an imported module's evaluation, React
// has not mounted yet. An ErrorBoundary cannot catch that exception.
function showBootstrapFailure(error: unknown) {
  const root = document.getElementById('root');
  if (!root) return;
  const category = error instanceof DOMException && error.name === 'SecurityError'
    ? 'STORAGE_ACCESS_DENIED' : 'APPLICATION_STARTUP_FAILED';
  const container = document.createElement('main');
  container.setAttribute('role', 'alert');
  container.style.cssText = 'max-width:620px;margin:9vh auto;padding:28px;font-family:system-ui,sans-serif;color:#102a50;background:white;border:1px solid #cbd5e1;border-radius:14px';
  const heading = document.createElement('h1');
  heading.textContent = 'Haneen Care Network could not start';
  const description = document.createElement('p');
  description.textContent = category === 'STORAGE_ACCESS_DENIED'
    ? 'Your browser restricted a storage API needed to start this session. No patient information has been loaded.'
    : 'An application component did not initialize. No patient information is displayed.';
  const reference = document.createElement('p');
  reference.textContent = 'Support reference: HCN-BOOT-001 / ' + category;
  const retry = document.createElement('button');
  retry.textContent = 'Retry Haneen';
  retry.type = 'button';
  retry.style.cssText = 'padding:12px 18px;background:#bd8108;color:white;border:0;border-radius:9px;cursor:pointer';
  retry.addEventListener('click', () => window.location.reload());
  container.append(heading, description, reference, retry);
  root.replaceChildren(container);
  // Deliberately omit the actual error message/stack: it may contain PHI or secrets.
  console.error('HCN bootstrap failed:', category);
}

void Promise.all([import('./App.tsx'), import('./components/ErrorBoundary')])
  .then(([{ default: App }, { default: ErrorBoundary }]) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
  })
  .catch(showBootstrapFailure);
