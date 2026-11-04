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
  const [isRechecking, setIsRechecking] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery<ClientHealthReport>({
    queryKey: ['/api/atlas/integrations/client-health'],
    queryFn: async () => {
      const res = await fetch('/api/atlas/integrations/client-health');
      if (!res.ok) throw new Error('Failed to fetch client app health');
      return res.json();
    },
    refetchInterval: 10000,
  });

  const handleRecheck = async () => {
    setIsRechecking(true);
    try {
      await fetch('/api/atlas/integrations/client-health/recheck', { method: 'POST' });
    } catch {}
    await refetch();
    setIsRechecking(false);
  };

  if (isLoading || !data) return null;

  // If everything is running perfectly in Task Manager
  if (!data.requiresWarning) {
    if (isDismissed) {
      return (
        <div style={{ background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', padding: '6px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#166534' }}>
            <CheckCircle2 size={13} color="#16a34a" />
            <span>All desktop apps ready (Outlook, Teams, Zoom active in system tasks)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ fontSize: 11, padding: '2px 8px', background: '#fff', borderColor: '#86efac', color: '#166534' }}
              disabled={isFetching || isRechecking}
              onClick={handleRecheck}
              title="Re-check running applications in Task Manager"
            >
              <RefreshCw size={11} className={isFetching || isRechecking ? 'spin' : ''} /> {isRechecking ? 'Checking...' : 'Re-check Apps'}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              style={{ fontSize: 11, padding: '2px 6px' }}
              onClick={() => setIsDismissed(false)}
            >
              Show Details
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          background: '#f0fdf4',
          borderBottom: '2px solid #86efac',
          padding: '10px 20px',
          fontSize: 13,
          color: '#1f2937',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0 }} />
            <div>
              <span style={{ fontWeight: 600, color: '#166534', marginRight: 8 }}>
                Desktop Application Readiness
              </span>
              <span className="badge" style={{ background: '#dcfce7', color: '#15803d', borderColor: '#86efac', fontWeight: 600 }}>
                ● All Ingestions Active
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 8 }}>
              <span style={{ fontSize: 12, background: '#fff', padding: '2px 8px', borderRadius: 4, border: '1px solid #bbf7d0', color: '#166534' }}>
                ✓ Outlook: Running
              </span>
              <span style={{ fontSize: 12, background: '#fff', padding: '2px 8px', borderRadius: 4, border: '1px solid #bbf7d0', color: '#166534' }}>
                ✓ Teams: Running
              </span>
              <span style={{ fontSize: 12, background: '#fff', padding: '2px 8px', borderRadius: 4, border: '1px solid #bbf7d0', color: '#166534' }}>
                ✓ Zoom: Running
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ fontSize: 11, padding: '4px 10px', background: '#fff', borderColor: '#86efac', color: '#166534', fontWeight: 600 }}
              disabled={isFetching || isRechecking}
              onClick={handleRecheck}
              title="Re-check running applications in Task Manager"
            >
              <RefreshCw size={12} className={isFetching || isRechecking ? 'spin' : ''} /> {isRechecking ? 'Checking...' : 'Re-check Apps'}
            </button>
            <button
              type="button"
              className="icon-button"
              style={{ width: 22, height: 22 }}
              onClick={() => setIsDismissed(true)}
              title="Minimize banner"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </div>
    );
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
                  Warning: Microsoft Outlook is closed in your system tasks. Email and calendar ingestion is paused until Outlook (<code>deepak.paranjape@kentplc.com</code>) is opened.
                </strong>
              ) : isTeamsDown || isZoomDown ? (
                <strong style={{ color: '#b45309' }}>
                  Notice: {isTeamsDown ? 'Microsoft Teams' : ''}{isTeamsDown && isZoomDown ? ' and ' : ''}{isZoomDown ? 'Zoom Workplace' : ''} is not seen in your system tasks. Ingestion for those platforms is paused until the desktop apps are opened.
                </strong>
              ) : (
                <span>
                  All required applications (Outlook, Teams, Zoom) are running in system tasks and ready for ingestion.
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
                    <strong>Teams:</strong> {isTeamsDown ? 'Closed (No Ingestion)' : 'Running (Ingestion Active)'}
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
                    background: isZoomDown ? '#fef3c7' : '#f0fdf4',
                    border: `1px solid ${isZoomDown ? '#fde68a' : '#bbf7d0'}`,
                    fontSize: 12,
                  }}
                >
                  {isZoomDown ? <AlertTriangle size={13} color="#d97706" /> : <CheckCircle2 size={13} color="#16a34a" />}
                  <span>
                    <strong>Zoom:</strong> {isZoomDown ? 'Closed (No Ingestion)' : 'Running (Ingestion Active)'}
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
            disabled={isFetching || isRechecking}
            onClick={handleRecheck}
            title="Re-check running applications in Task Manager"
          >
            <RefreshCw size={12} className={isFetching || isRechecking ? 'spin' : ''} /> {isRechecking ? 'Checking...' : 'Re-check Apps'}
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

export function TopBarAppHealthPill() {
  const [isRechecking, setIsRechecking] = useState(false);

  const { data, refetch, isFetching } = useQuery<ClientHealthReport>({
    queryKey: ['/api/atlas/integrations/client-health'],
    queryFn: async () => {
      const res = await fetch('/api/atlas/integrations/client-health');
      if (!res.ok) throw new Error('Failed to fetch client app health');
      return res.json();
    },
    refetchInterval: 10000,
  });

  const handleRecheck = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRechecking(true);
    try {
      await fetch('/api/atlas/integrations/client-health/recheck', { method: 'POST' });
    } catch {}
    await refetch();
    setIsRechecking(false);
  };

  if (!data) return null;

  const allReady = data.allReady;
  const isOutlookDown = !data.apps.outlook.running;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 9999,
        background: allReady ? '#dcfce7' : isOutlookDown ? '#fee2e2' : '#fef3c7',
        border: `1px solid ${allReady ? '#86efac' : isOutlookDown ? '#fca5a5' : '#fde68a'}`,
        color: allReady ? '#15803d' : isOutlookDown ? '#991b1b' : '#92400e',
        fontSize: 11,
        fontWeight: 600,
      }}
      title={`Outlook: ${data.apps.outlook.running ? 'Running' : 'Closed'} | Teams: ${data.apps.teams.running ? 'Running' : 'Closed'} | Zoom: ${data.apps.zoom.running ? 'Running' : 'Closed'}`}
    >
      {allReady ? (
        <CheckCircle2 size={12} color="#16a34a" />
      ) : (
        <AlertTriangle size={12} color={isOutlookDown ? '#dc2626' : '#d97706'} />
      )}
      <span>{allReady ? 'Apps Ready' : isOutlookDown ? 'Outlook Closed' : 'Partial Apps'}</span>
      <button
        type="button"
        onClick={handleRecheck}
        disabled={isFetching || isRechecking}
        title="Re-check running applications in Task Manager"
        style={{
          background: 'transparent',
          border: 'none',
          padding: '0 2px',
          cursor: 'pointer',
          color: 'inherit',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <RefreshCw size={11} className={isFetching || isRechecking ? 'spin' : ''} />
      </button>
    </div>
  );
}
