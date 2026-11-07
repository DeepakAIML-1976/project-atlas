import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { getSessionToken, removeSessionToken } from '@/lib/api-fetch';

/**
 * Proactively verifies session integrity and single-concurrent-session enforcement.
 * If another system logs into the account, this tab detects it within seconds
 * and logs out immediately.
 */
export function SessionMonitor() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    let isCancelled = false;

    const checkSession = async () => {
      const token = getSessionToken();
      if (!token) {
        removeSessionToken();
        if (!window.location.pathname.startsWith('/login')) {
          setLocation('/login?reason=unauthorized');
        }
        return;
      }

      try {
        const res = await fetch('/api/atlas/auth/session-check', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          removeSessionToken();

          if (isCancelled) return;

          if (body?.code === 'SESSION_SUPERSEDED') {
            window.location.href = '/login?reason=superseded';
          } else {
            window.location.href = '/login?reason=unauthorized';
          }
        }
      } catch {
        // Network offline or transient error - do not force logout on temporary hiccup
      }
    };

    // Initial check
    checkSession();

    // Check every 10 seconds
    const interval = setInterval(checkSession, 10000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [setLocation]);

  return null;
}
