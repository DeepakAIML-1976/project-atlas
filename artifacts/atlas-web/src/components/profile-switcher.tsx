import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { getActiveOwnerEmail, setActiveOwnerEmail } from '@workspace/api-client-react';
import { setSessionToken, removeSessionToken } from '@/lib/api-fetch';
import { ChevronDown, Check, UserPlus, LogOut, Lock, Eye, EyeOff, AlertCircle, X, ShieldCheck } from 'lucide-react';

export interface EngineerProfile {
  name: string;
  email: string;
  role: string;
  twinTitle: string;
}

export const PRESET_PROFILES: EngineerProfile[] = [
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

export function getProfileForEmail(email: string): EngineerProfile {
  const normalized = (email || '').trim().toLowerCase();
  const found = PRESET_PROFILES.find((p) => p.email.toLowerCase() === normalized);
  if (found) return found;

  const localPart = normalized.split('@')[0] || 'engineer';
  const parts = localPart.split(/[._-]/).filter(Boolean);
  const formattedName =
    parts.length > 0
      ? parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
      : 'Engineer';
  const firstName = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : formattedName;

  return {
    name: formattedName,
    email: normalized,
    role: 'Kent PLC Engineer',
    twinTitle: `${firstName}'s AI Representative`,
  };
}

export function ProfileSwitcher({ variant = 'topbar' }: { variant?: 'topbar' | 'sidebar' }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [currentEmail, setCurrentEmail] = useState<string>(getActiveOwnerEmail());
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Authentication Switch Modal State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [targetEmail, setTargetEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [consentChecked, setConsentChecked] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setCurrentEmail(getActiveOwnerEmail());
  }, []);

  const activeProfile = getProfileForEmail(currentEmail);
  const initials = activeProfile.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const initiateSwitchTo = (emailToSwitch: string) => {
    setTargetEmail(emailToSwitch.trim().toLowerCase());
    setPassword('');
    setErrorMessage('');
    setIsDropdownOpen(false);
    setIsAuthModalOpen(true);
  };

  const handleAuthenticatedSwitch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!targetEmail) {
      setErrorMessage('Corporate email ID is required.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter the email password for this profile.');
      return;
    }

    if (!consentChecked) {
      setErrorMessage('Owner consent is required to access corporate Outlook and Teams.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/atlas/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail.trim().toLowerCase(),
          password,
          consent: consentChecked,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed. Please verify your email ID and password.');
      }

      // Successful password verification
      setSessionToken(data.token);
      setActiveOwnerEmail(data.user.email);
      setCurrentEmail(data.user.email);
      setIsAuthModalOpen(false);
      queryClient.clear();

      // Reload so all queries reload strictly with the new engineer's isolated workspace
      window.location.href = '/overview';
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = () => {
    removeSessionToken();
    setActiveOwnerEmail('');
    try {
      localStorage.removeItem('atlas_active_owner_email');
    } catch (_) {}
    queryClient.clear();
    setLocation('/login');
  };

  // Switch Modal Component
  const authModal = isAuthModalOpen && (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 12, 22, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#fcfaf5',
          color: '#302b3f',
          borderRadius: 12,
          padding: 26,
          width: 460,
          maxWidth: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          border: '1px solid #d8d1c8',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#bb4d31', fontWeight: 700 }}>
              Database-Driven Profile Authentication
            </div>
            <h3 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 700 }}>Switch Active Engineer Profile</h3>
          </div>
          <button
            onClick={() => setIsAuthModalOpen(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#797480', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: '#797480', margin: '0 0 16px', lineHeight: 1.5 }}>
          Switching profiles requires the engineer's corporate email ID and password to unlock their isolated workspace and mailbox.
        </p>

        {errorMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              background: '#fbece8',
              border: '1px solid #eab0a2',
              color: '#a53626',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 12,
              marginBottom: 14,
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{errorMessage}</div>
          </div>
        )}

        <form onSubmit={handleAuthenticatedSwitch}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4d4757', marginBottom: 5 }}>
              Corporate Email ID
            </label>
            <input
              type="email"
              required
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              placeholder="engineer.name@kentplc.com"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 6,
                border: '1px solid #cfc9c6',
                fontSize: 13,
                background: '#fffdf8',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#4d4757' }}>
                Email Password
              </label>
              <span style={{ fontSize: 10, color: '#8c8790' }}>Initial Seed: KentPiping#2026!</span>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter corporate email password"
                style={{
                  width: '100%',
                  padding: '9px 36px 9px 12px',
                  borderRadius: 6,
                  border: '1px solid #cfc9c6',
                  fontSize: 13,
                  background: '#fffdf8',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 8,
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
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div
            style={{
              marginBottom: 16,
              padding: '10px 12px',
              background: '#f2eee4',
              borderRadius: 6,
              border: '1px solid #dfd6c8',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                fontSize: 11,
                lineHeight: 1.45,
                color: '#494340',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                style={{ marginTop: 2, accentColor: '#c65131', cursor: 'pointer' }}
              />
              <span>
                <strong>Owner Consent:</strong> I authorize this twin to connect to my Outlook and Teams under these credentials to monitor communications and prepare drafts for my review.
              </span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(false)}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                border: '1px solid #cfc9c6',
                borderRadius: 6,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                padding: '8px 18px',
                background: '#c65131',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 700,
                cursor: isLoading ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Lock size={13} />
              <span>{isLoading ? 'Verifying...' : 'Verify & Switch'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // Sidebar variant
  if (variant === 'sidebar') {
    return (
      <div style={{ margin: '14px 0 6px' }}>
        <div
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.07)',
            cursor: 'pointer',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            transition: 'background 0.2s',
          }}
          title="Switch Active Engineer Profile"
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: '#c65131',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 700,
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f3eee9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeProfile.name}
            </div>
            <div style={{ fontSize: 10, color: '#e4af7d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeProfile.twinTitle}
            </div>
          </div>
          <ChevronDown size={14} style={{ color: '#b9b4c2', transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>

        {isDropdownOpen && (
          <div
            style={{
              marginTop: 8,
              background: '#1f1b2b',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 8,
              padding: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ padding: '4px 8px', fontSize: 10, color: '#9b96a7', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lock size={10} />
              <span>Password Required to Switch</span>
            </div>
            {PRESET_PROFILES.map((p) => {
              const isSelected = p.email.toLowerCase() === currentEmail.toLowerCase();
              return (
                <div
                  key={p.email}
                  onClick={() => {
                    if (!isSelected) initiateSwitchTo(p.email);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: 6,
                    cursor: isSelected ? 'default' : 'pointer',
                    background: isSelected ? 'rgba(198, 81, 49, 0.25)' : 'transparent',
                    color: isSelected ? '#fff' : '#b9b4c2',
                    fontSize: 12,
                    marginBottom: 2,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: '#8c8790' }}>{p.twinTitle}</div>
                  </div>
                  {isSelected ? <Check size={14} color="#e4af7d" /> : <Lock size={12} color="#797480" />}
                </div>
              );
            })}
            <div
              onClick={() => initiateSwitchTo('')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 6,
                cursor: 'pointer',
                color: '#e4af7d',
                fontSize: 11,
                borderTop: '1px solid rgba(255,255,255,0.08)',
                marginTop: 4,
              }}
            >
              <UserPlus size={13} />
              <span>Authenticate Another Engineer...</span>
            </div>
            <div
              onClick={handleSignOut}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 6,
                cursor: 'pointer',
                color: '#ff8a7a',
                fontSize: 11,
                marginTop: 2,
              }}
            >
              <LogOut size={13} />
              <span>Sign Out to Login Page</span>
            </div>
          </div>
        )}

        {authModal}
      </div>
    );
  }

  // Topbar variant
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
      {/* 24x7 Live Representative Status Indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: '#e4edce',
          color: '#385730',
          padding: '4px 10px',
          borderRadius: 20,
          fontSize: 11,
          fontFamily: "'Space Mono', monospace",
          fontWeight: 600,
          border: '1px solid #c9d8a9',
        }}
        title="24x7 Monitoring active on MS Teams & Outlook Mail"
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#48a43f',
            boxShadow: '0 0 6px #48a43f',
            display: 'inline-block',
          }}
        />
        <span>24/7 LIVE</span>
      </div>

      {/* Engineer Profile Button */}
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: '#fffdf8',
          border: '1px solid #cfc9c6',
          borderRadius: 8,
          padding: '5px 12px 5px 6px',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s ease',
        }}
        data-testid="button-profile-switcher"
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#302b3f',
            color: '#dda280',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 700,
            fontSize: 12,
            border: '1.5px solid #dda280',
          }}
        >
          {initials}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#302b3f', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{activeProfile.name}</span>
            <span style={{ fontSize: 10, background: '#f2eee4', color: '#8e4739', padding: '1px 6px', borderRadius: 4 }}>
              {activeProfile.email.includes('deepak') ? 'SME' : 'Engineer'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#bb4d31', fontWeight: 600 }}>
            {activeProfile.twinTitle}
          </div>
        </div>
        <ChevronDown size={14} color="#797480" style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', marginLeft: 4 }} />
      </button>

      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <div
          style={{
            position: 'absolute',
            top: '115%',
            right: 0,
            width: 320,
            background: '#fffdf8',
            border: '1px solid #d8d1c8',
            borderRadius: 10,
            boxShadow: '0 12px 36px rgba(0,0,0,0.12)',
            zIndex: 100,
            padding: 8,
          }}
        >
          <div style={{ padding: '8px 10px 6px', borderBottom: '1px solid #eee7dd', marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontFamily: "'Space Mono', monospace", color: '#bb4d31', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
              Active Twin Profile
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#302b3f', marginTop: 2 }}>{activeProfile.twinTitle}</div>
            <div style={{ fontSize: 11, color: '#797480' }}>{activeProfile.email}</div>
          </div>

          <div style={{ padding: '4px 10px', fontSize: 10, color: '#8c8790', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Lock size={10} />
            <span>Switch Profile (Password Required)</span>
          </div>

          {PRESET_PROFILES.map((p) => {
            const isSelected = p.email.toLowerCase() === currentEmail.toLowerCase();
            return (
              <div
                key={p.email}
                onClick={() => {
                  if (!isSelected) initiateSwitchTo(p.email);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: 6,
                  cursor: isSelected ? 'default' : 'pointer',
                  background: isSelected ? '#f5eee6' : 'transparent',
                  marginBottom: 3,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#302b3f' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#c65131', fontWeight: 500 }}>{p.twinTitle}</div>
                  <div style={{ fontSize: 10, color: '#8c8790' }}>{p.role}</div>
                </div>
                {isSelected ? <Check size={16} color="#c65131" /> : <Lock size={13} color="#9b96a7" />}
              </div>
            );
          })}

          <div
            onClick={() => initiateSwitchTo('')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              color: '#c65131',
              fontSize: 12,
              fontWeight: 600,
              borderTop: '1px solid #eee7dd',
              marginTop: 6,
            }}
          >
            <UserPlus size={14} />
            <span>+ Switch to Another Kent Engineer...</span>
          </div>

          <div
            onClick={handleSignOut}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              color: '#a43420',
              fontSize: 12,
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            <LogOut size={14} />
            <span>Sign Out to Kent Login Page</span>
          </div>
        </div>
      )}

      {authModal}
    </div>
  );
}
