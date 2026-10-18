import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { setActiveOwnerEmail } from '@workspace/api-client-react';
import { setSessionToken } from '@/lib/api-fetch';
import { ShieldCheck, ArrowRight, Sparkles, Database, Mail, Eye, EyeOff, AlertCircle, CheckCircle2, Lock } from 'lucide-react';

interface PresetUser {
  name: string;
  email: string;
  role: string;
  twinTitle: string;
}

const PRESET_USERS: PresetUser[] = [
  {
    name: 'Deepak Paranjape',
    email: 'deepak.paranjape@kentplc.com',
    role: 'Lead Piping Engineer & Project 5884 SME',
    twinTitle: "Deepak's AI Representative",
  },
  {
    name: 'Sunil Hiremath',
    email: 'sunil.hiremath@kentplc.com',
    role: 'Senior Piping Engineer',
    twinTitle: "Sunil's AI Representative",
  },
];

export function LoginPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('deepak.paranjape@kentplc.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [consentGiven, setConsentGiven] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSelectPreset = (presetEmail: string) => {
    setEmail(presetEmail);
    setErrorMessage('');
    const pwdInput = document.getElementById('login-password-input');
    if (pwdInput) pwdInput.focus();
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim()) {
      setErrorMessage('Please enter your corporate email ID.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your email password.');
      return;
    }

    if (!consentGiven) {
      setErrorMessage('Owner consent is required to allow the Digital Twin to access Outlook and MS Teams.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/atlas/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          consent: consentGiven,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed. Please verify your email ID and password.');
      }

      // Store authenticated session
      setSessionToken(data.token);
      setActiveOwnerEmail(data.user.email);
      queryClient.clear();

      // Redirect into isolated workspace
      window.location.href = '/overview';
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to connect to authentication service.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#292538',
        color: '#f6f1e8',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Header */}
      <header
        style={{
          padding: '20px 48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              border: '2px solid #e4af7d',
              color: '#e4af7d',
              display: 'grid',
              placeItems: 'center',
              fontFamily: "'Instrument Serif', serif",
              fontSize: 26,
              transform: 'rotate(-22deg)',
            }}
          >
            a
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.04em' }}>
              atlas<span style={{ color: '#e4af7d' }}>.</span>
            </div>
            <div style={{ fontSize: 10, fontFamily: "'Space Mono', monospace", color: '#dda280', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Kent PLC Digital Twin Suite
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#b9b4c2' }}>
          <Lock size={15} color="#e4af7d" />
          <span>Database-Authenticated & Multi-Tenant Isolated</span>
        </div>
      </header>

      {/* Main Container */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1.05fr) minmax(380px, 1.15fr)',
          maxWidth: 1320,
          margin: '0 auto',
          padding: 'clamp(30px, 4vw, 56px) 28px',
          gap: 56,
          alignItems: 'center',
        }}
      >
        {/* Left Column: Context & Governance */}
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(228, 175, 125, 0.12)',
              color: '#e4af7d',
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 11,
              fontFamily: "'Space Mono', monospace",
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: 18,
            }}
          >
            <Sparkles size={13} />
            <span>Autonomous Engineering Intelligence</span>
          </div>

          <h1
            style={{
              fontSize: 'clamp(36px, 4vw, 56px)',
              lineHeight: 1.06,
              fontWeight: 600,
              letterSpacing: '-0.05em',
              margin: '0 0 18px',
            }}
          >
            Authenticate to Your <br />
            <span style={{ fontFamily: "'Instrument Serif', serif", color: '#e4af7d', fontWeight: 400 }}>
              AI Representative.
            </span>
          </h1>

          <p style={{ fontSize: 15, lineHeight: 1.65, color: '#b9b4c2', maxWidth: 490, margin: '0 0 32px' }}>
            Secure, database-driven authentication using your corporate email ID and email password. Every engineer operates a 100% isolated Digital Twin workspace.
          </p>

          <div style={{ display: 'grid', gap: 14, maxWidth: 480 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.04)',
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <ShieldCheck size={18} color="#e4af7d" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#f6f1e8' }}>Strict Mailbox & Workspace Isolation</div>
                <div style={{ fontSize: 12, color: '#9b96a7', lineHeight: 1.5 }}>
                  Deepak and Sunil operate entirely independent email inboxes, memory stores, and drafts. Zero crosstalk.
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.04)',
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <Database size={18} color="#e4af7d" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#f6f1e8' }}>Pillar 4 Shared Engineering Brain</div>
                <div style={{ fontSize: 12, color: '#9b96a7', lineHeight: 1.5 }}>
                  Institutional knowledge, 104 ASME B31.3 heuristics, and approved lessons learned remain shared globally across all twins.
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.04)',
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <Mail size={18} color="#e4af7d" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#f6f1e8' }}>Owner Governed 24/7 Representation</div>
                <div style={{ fontSize: 12, color: '#9b96a7', lineHeight: 1.5 }}>
                  All outgoing technical replies are staged in your Executive Inbox for review. Zero unauthorized dispatches.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Database Login Form */}
        <div
          style={{
            background: '#fcfaf5',
            color: '#302b3f',
            borderRadius: 14,
            padding: 'clamp(26px, 3.5vw, 40px)',
            boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
            border: '1px solid #d8d1c8',
          }}
        >
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontFamily: "'Space Mono', monospace", color: '#bb4d31', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>
              Database-Driven SME Sign-In
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: '6px 0 6px', letterSpacing: '-0.04em' }}>
              Engineer Sign-In
            </h2>
            <p style={{ fontSize: 13, color: '#797480', margin: 0, lineHeight: 1.5 }}>
              Enter your corporate email ID and email password to unlock your Digital Twin.
            </p>
          </div>

          {/* Quick Preset Selector */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#4d4757', marginBottom: 8 }}>
              Select Active Account:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {PRESET_USERS.map((p) => {
                const isSelected = email.toLowerCase() === p.email.toLowerCase();
                return (
                  <button
                    key={p.email}
                    type="button"
                    onClick={() => handleSelectPreset(p.email)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1.5px solid ${isSelected ? '#c65131' : '#ded9d2'}`,
                      background: isSelected ? '#f8ede9' : '#fffdf8',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#302b3f' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#bb4d31', fontWeight: 600 }}>{p.twinTitle}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error Message Alert */}
          {errorMessage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                background: '#fbece8',
                border: '1px solid #eab0a2',
                color: '#a53626',
                padding: '10px 14px',
                borderRadius: 7,
                fontSize: 12,
                lineHeight: 1.5,
                marginBottom: 16,
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{errorMessage}</div>
            </div>
          )}

          {/* Database Login Form */}
          <form onSubmit={handleLoginSubmit}>
            {/* Email ID Field */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4d4757', marginBottom: 6 }}>
                Corporate Email ID (Login Name)
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="firstname.lastname@kentplc.com"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid #cfc9c6',
                  fontSize: 13,
                  outline: 'none',
                  background: '#fffdf8',
                }}
              />
            </div>

            {/* Email Password Field */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#4d4757' }}>
                  Email Password
                </label>
                <span style={{ fontSize: 10, color: '#8c8790' }}>Initial Seed: KentPiping#2026!</span>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your corporate email password"
                  style={{
                    width: '100%',
                    padding: '10px 38px 10px 12px',
                    borderRadius: 6,
                    border: '1px solid #cfc9c6',
                    fontSize: 13,
                    outline: 'none',
                    background: '#fffdf8',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#797480',
                    display: 'grid',
                    placeItems: 'center',
                    padding: 4,
                  }}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Mandatory Owner Consent Checkbox */}
            <div
              style={{
                marginBottom: 20,
                padding: '12px 14px',
                background: '#f2eee4',
                borderRadius: 8,
                border: '1px solid #dfd6c8',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: '#494340',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                  style={{ marginTop: 2, accentColor: '#c65131', cursor: 'pointer' }}
                />
                <span>
                  <strong>Owner Consent & Authorization:</strong> I hereby authorize Atlas Digital Twin Suite to access my Kent PLC Outlook and MS Teams accounts to monitor relevant project inquiries and prepare draft replies strictly subject to my executive approval.
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '13px 20px',
                background: '#c65131',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                fontSize: 14,
                fontWeight: 700,
                cursor: isLoading ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                transition: 'background 0.2s',
              }}
            >
              <span>{isLoading ? 'Verifying with Database...' : 'Authenticate & Launch Twin'}</span>
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>

      {/* Footer */}
      <footer
        style={{
          padding: '18px 48px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11,
          color: '#8b8595',
        }}
      >
        <div>Kent PLC &copy; 2026. Confidential & Proprietary Digital Twin Suite.</div>
        <div style={{ display: 'flex', gap: 20 }}>
          <span>Database-Driven Security</span>
          <span>100% Mailbox Isolation</span>
          <span>M365 Outlook & Teams Integration</span>
        </div>
      </footer>
    </div>
  );
}
