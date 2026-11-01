import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, X, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';

interface AppDetail {
  name: string;
  process: string;
  running: boolean;
  purpose: string;
  account?: string;
  warning: string | null;
}

interface ClientHealthReport {
  isDesktop: boolean;
  platform: string;
  lastCheckedAt: string;
  allReady: boolean;
  requiresWarning: boolean;
  ingestionBlocked: boolean;
  apps: {
    outlook: AppDetail;
    teams: AppDetail;
    zoom: AppDetail;
  };
  warnings: string[];
  bannerMessage: string;
}

export function ClientAppHealthBanner() {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const { data, isLoading, refetch, isFetching } = useQuery<ClientHealthReport>({
    queryKey: ['/api/atlas/integrations/client-health'],
    queryFn: async () => {
      const res = await fetch('/api/atlas/integrations/client-health');
      if (!res.ok) throw new Error('Failed to fetch client app health');
      return res.json();
    },
    refetchInterval: 10000,
  });

  if (isLoading || !data) return null;

  // If everything is running perfectly and no warning needed
  if (!data.requiresWarning) {
    return null;
  }

  if (isDismissed) {
    return (
      <div style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '6px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#991b1b' }}>
          <AlertTriangle size={13} />
          <span>App Alert: {data.ingestionBlocked ? 'Outlook closed (No ingestion will be done)' : 'Teams/Zoom closed'}</span>
        </div>
        <button
          className="btn btn-quiet"
          style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={() => setIsDismissed(false)}
        >
          Show Details
        </button>
      </div>
    );
  }

  const isOutlookDown = !data.apps.outlook.running;
  const isTeamsDown = !data.apps.teams.running;
  const isZoomDown = !data.apps.zoom.running;

  return (
    <div
      style={{
        background: isOutlookDown ? '#fff5f5' : '#fffbeb',
        borderBottom: `2px solid ${isOutlookDown ? '#f87171' : '#f59e0b'}`,
        padding: '12px 20px',
        fontSize: 13,
        color: '#1f2937',
        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1 }}>
          <AlertTriangle
            size={20}
            color={isOutlookDown ? '#dc2626' : '#d97706'}
            style={{ flexShrink: 0, marginTop: 2 }}
          />

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14, color: isOutlookDown ? '#991b1b' : '#92400e' }}>
                Desktop Application Readiness Alert
              </strong>
              {data.ingestionBlocked ? (
                <span className="badge" style={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fca5a5', fontWeight: 700 }}>
                  ⛔ Ingestion Blocked
                </span>
              ) : (
                <span className="badge" style={{ background: '#fffbeb', color: '#b45309', borderColor: '#fde68a' }}>
                  ⚠️ Live Bot Partial
                </span>
              )}
            </div>

            <p style={{ margin: '4px 0 8px', fontSize: 13, lineHeight: 1.45, color: '#374151' }}>
              {isOutlookDown ? (
                <strong style={{ color: '#b91c1c' }}>
                  Warning: Microsoft Outlook is currently closed on your system. There will NOT be any email or calendar ingestion done until Outlook (<code>deepak.paranjape@kentplc.com</code>) is opened and active.
                </strong>
              ) : (
                <span>
                  Notice: Outlook is active, but one or more meeting applications (Teams/Zoom) are closed on your workstation. Live meeting bot attendance may be unavailable for those platforms.
                </span>
              )}
            </p>

            {isExpanded && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                {/* Outlook status pill */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: isOutlookDown ? '#fee2e2' : '#f0fdf4',
                    border: `1px solid ${isOutlookDown ? '#fca5a5' : '#bbf7d0'}`,
                    fontSize: 12,
                  }}
                >
                  {isOutlookDown ? <AlertTriangle size={13} color="#dc2626" /> : <CheckCircle2 size={13} color="#16a34a" />}
                  <span>
                    <strong>Outlook:</strong> {isOutlookDown ? 'Closed (No Ingestion)' : 'Running (Ingestion Active)'}
                  </span>
                </div>

                {/* Teams status pill */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: isTeamsDown ? '#fef3c7' : '#f0fdf4',
                    border: `1px solid ${isTeamsDown ? '#fde68a' : '#bbf7d0'}`,
                    fontSize: 12,
                  }}
                >
                  {isTeamsDown ? <AlertTriangle size={13} color="#d97706" /> : <CheckCircle2 size={13} color="#16a34a" />}
                  <span>
                    <strong>Teams:</strong> {isTeamsDown ? 'Closed (Live Bot Offline)' : 'Running (Live Bot Ready)'}
                  </span>
                </div>

                {/* Zoom status pill */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: isZoomDown ? '#f3f4f6' : '#f0fdf4',
                    border: `1px solid ${isZoomDown ? '#e5e7eb' : '#bbf7d0'}`,
                    fontSize: 12,
                  }}
                >
                  {isZoomDown ? <span style={{ color: '#9ca3af' }}>⚪</span> : <CheckCircle2 size={13} color="#16a34a" />}
                  <span>
                    <strong>Zoom:</strong> {isZoomDown ? 'Closed' : 'Running (Ready)'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            className="btn btn-outline"
            style={{ fontSize: 11, padding: '4px 8px', background: '#fff' }}
            disabled={isFetching}
            onClick={() => refetch()}
            title="Re-check running applications"
          >
            <RefreshCw size={12} className={isFetching ? 'spin' : ''} /> Re-check Apps
          </button>

          <button
            type="button"
            className="icon-button"
            style={{ width: 24, height: 24 }}
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse details' : 'Expand details'}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <button
            type="button"
            className="icon-button"
            style={{ width: 24, height: 24 }}
            onClick={() => setIsDismissed(true)}
            title="Dismiss warning for now"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
