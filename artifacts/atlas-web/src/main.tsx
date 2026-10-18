import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

// Global API Interceptor ensuring multi-tenant isolation and session headers on EVERY fetch
const originalFetch = window.fetch;
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  try {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith('/api') || urlStr.includes('/api/')) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has('X-Owner-Email') && !headers.has('x-owner-email')) {
        let activeEmail = 'deepak.paranjape@kentplc.com';
        try {
          const stored = localStorage.getItem('atlas_active_owner_email');
          if (stored && stored.trim()) activeEmail = stored.trim();
        } catch (_) {}
        headers.set('X-Owner-Email', activeEmail);
      }
      try {
        const token = localStorage.getItem('atlas_session_token');
        if (token && !headers.has('Authorization') && !headers.has('authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
      } catch (_) {}
      return originalFetch(input, { ...init, headers });
    }
  } catch (_) {}
  return originalFetch(input, init);
};

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
