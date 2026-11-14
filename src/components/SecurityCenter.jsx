import React, { useState } from 'react';
import {
  Check, Copy, Download, Eye, EyeOff, KeyRound, Lock, Mail,
  RefreshCw, Shield, ShieldAlert, ShieldCheck, Smartphone, LogOut
} from 'lucide-react';

export function evaluatePasswordStrength(password = '') {
  const pwd = String(password);
  const rules = [
    { id: 'len', label: '10+ chars', met: pwd.length >= 10 },
    { id: 'upper', label: 'A-Z', met: /[A-Z]/.test(pwd) },
    { id: 'lower', label: 'a-z', met: /[a-z]/.test(pwd) },
    { id: 'num', label: '0-9', met: /[0-9]/.test(pwd) },
    { id: 'sym', label: 'Symbol', met: /[^A-Za-z0-9]/.test(pwd) }
  ];
  const metCount = rules.filter(r => r.met).length;
  let score = 0;
  if (metCount >= 2 && pwd.length >= 6) score = 1;
  if (metCount >= 3 && pwd.length >= 8) score = 2;
  if (metCount >= 4 && pwd.length >= 10) score = 3;
  if (metCount === 5 && pwd.length >= 12) score = 4;
  else if (metCount === 5) score = 3;

  const labels = ['Enter password', 'Weak', 'Fair', 'Strong', 'Fortress'];
  return {
    rules,
    allMet: metCount === 5,
    score,
    label: pwd ? labels[score] : 'Enter password'
  };
}

export default function SecurityCenter({ me, securityInfo, onRefreshSecurity, onToast, onSignedOut }) {
  const [busy, setBusy] = useState(false);
  const [totpSetup, setTotpSetup] = useState(null); // { secret, qrDataUrl, otpauthUrl }
  const [totpCode, setTotpCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [disableMode, setDisableMode] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [regenCode, setRegenCode] = useState('');
  const [showRegenBox, setShowRegenBox] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [secError, setSecError] = useState('');
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  const pwdEval = evaluatePasswordStrength(newPassword);
  const providers = securityInfo?.authProviders || me?.authProviders || [];

  async function startTotpSetup() {
    setBusy(true);
    setSecError('');
    try {
      const r = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      const d = await r.json();
      if (!r.ok) {
        setSecError(d.error || 'Could not initialize 2FA setup.');
        return;
      }
      setTotpSetup({ secret: d.secret, qrDataUrl: d.qrDataUrl, otpauthUrl: d.otpauthUrl });
      setTotpCode('');
    } catch {
      setSecError('Network error while generating 2FA secret.');
    } finally {
      setBusy(false);
    }
  }

  async function enableTotp(e) {
    e.preventDefault();
    setBusy(true);
    setSecError('');
    try {
      const r = await fetch('/api/auth/2fa/enable', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode })
      });
      const d = await r.json();
      if (!r.ok) {
        setSecError(d.error || 'Invalid 6-digit code.');
        return;
      }
      setBackupCodes(Array.isArray(d.backupCodes) ? d.backupCodes : []);
      setTotpSetup(null);
      setTotpCode('');
      onToast('Two-Factor Authentication enabled! Save your backup recovery codes safely.');
      await onRefreshSecurity();
    } catch {
      setSecError('Network error while enabling 2FA.');
    } finally {
      setBusy(false);
    }
  }

  async function disableTotp(e) {
    e.preventDefault();
    setBusy(true);
    setSecError('');
    try {
      const r = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: disablePassword, code: disableCode })
      });
      const d = await r.json();
      if (!r.ok) {
        setSecError(d.error || 'Could not disable 2FA.');
        return;
      }
      setDisableMode(false);
      setDisablePassword('');
      setDisableCode('');
      setBackupCodes([]);
      onToast('Two-Factor Authentication has been disabled.');
      await onRefreshSecurity();
    } catch {
      setSecError('Network error while disabling 2FA.');
    } finally {
      setBusy(false);
    }
  }

  async function regenerateBackupCodes(e) {
    e.preventDefault();
    setBusy(true);
    setSecError('');
    try {
      const r = await fetch('/api/auth/2fa/backup-codes', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: regenCode })
      });
      const d = await r.json();
      if (!r.ok) {
        setSecError(d.error || 'Invalid authenticator code.');
        return;
      }
      setBackupCodes(Array.isArray(d.backupCodes) ? d.backupCodes : []);
      setShowRegenBox(false);
      setRegenCode('');
      onToast('8 fresh backup recovery codes generated. Previous codes are now invalid.');
      await onRefreshSecurity();
    } catch {
      setSecError('Network error regenerating backup codes.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordUpdate(e) {
    e.preventDefault();
    setSecError('');
    if (!pwdEval.allMet) {
      setSecError('Please satisfy all strong password requirements before saving.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setSecError('New password and confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/auth/password/change', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const d = await r.json();
      if (!r.ok) {
        setSecError(d.error || 'Password update failed.');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      onToast(d.message || 'Password updated securely.');
      await onRefreshSecurity();
    } catch {
      setSecError('Network error updating password.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeAllSessions() {
    setBusy(true);
    setSecError('');
    try {
      const r = await fetch('/api/auth/sessions/revoke-all', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      if (r.ok) {
        onToast('All browser sessions have been signed out.');
        onSignedOut();
      }
    } catch {
      setSecError('Could not revoke active sessions.');
    } finally {
      setBusy(false);
      setConfirmRevokeAll(false);
    }
  }

  function downloadBackupCodes() {
    if (!backupCodes.length) return;
    const text = [
      'HelzerX Cloud — 2FA Backup Recovery Codes',
      `Account: ${securityInfo?.email || me?.username || me?.id}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      ...backupCodes.map((c, idx) => `${idx + 1}. ${c}`),
      '',
      'Each recovery code can only be used ONCE if you lose access to your authenticator app.'
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'helzerx-2fa-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="services-section" id="security">
      <div className="services-head">
        <div>
          <div className="section-label">ZERO-TRUST ACCOUNT PROTECTION</div>
          <h2 className="services-title">Account & Security Center</h2>
          <p className="services-sub">
            Protect your Gmail / Cloud account with Authenticator 2FA, cryptographic scrypt passwords, session version rotation, and live login audit trails.
          </p>
        </div>
        <button className="btn-pill secondary sm" onClick={onRefreshSecurity} disabled={busy}>
          <RefreshCw size={12} /> Refresh Security
        </button>
      </div>

      {secError && (
        <div className="auth-alert error" style={{ marginBottom: '16px' }}>
          <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{secError}</span>
        </div>
      )}

      <div className="security-grid">
        {/* CARD 1: Identity & Two-Factor Authentication */}
        <article className="security-card">
          <div className="security-card-head">
            <div>
              <h3>Two-Factor Authentication (2FA)</h3>
              <p>Require a time-based 6-digit code from Google Authenticator or Authy on every login.</p>
            </div>
            <span className={`sec-status-badge ${securityInfo?.twoFactorEnabled ? 'active' : 'warn'}`}>
              {securityInfo?.twoFactorEnabled ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
              {securityInfo?.twoFactorEnabled ? '2FA ACTIVE' : 'RECOMMENDED'}
            </span>
          </div>

          <div className="sec-provider-list">
            {securityInfo?.email && (
              <span className="sec-provider-pill">
                <Mail size={13} color="#38bdf8" /> {securityInfo.email}
              </span>
            )}
            {providers.includes('google') && (
              <span className="sec-provider-pill">
                <Check size={13} color="#4ade80" /> Google Linked
              </span>
            )}
            {providers.includes('discord') && (
              <span className="sec-provider-pill">
                <Check size={13} color="#a855f7" /> Discord Linked
              </span>
            )}
            {providers.includes('email') && (
              <span className="sec-provider-pill">
                <Lock size={13} color="#f5c84d" /> Password Auth
              </span>
            )}
          </div>

          {backupCodes.length > 0 && (
            <div className="totp-setup-box" style={{ borderColor: 'rgba(34, 197, 94, 0.4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong style={{ color: '#86efac', fontSize: '13px' }}>Save Your One-Time Backup Recovery Codes</strong>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn-pill secondary sm"
                    onClick={() => navigator.clipboard.writeText(backupCodes.join('\n')).then(() => onToast('Backup codes copied!'))}
                  >
                    <Copy size={12} /> Copy
                  </button>
                  <button type="button" className="btn-pill primary sm" onClick={downloadBackupCodes}>
                    <Download size={12} /> Save .TXT
                  </button>
                </div>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Store these offline. They are shown only once and bypass 2FA if your phone is lost.
              </p>
              <div className="backup-codes-grid">
                {backupCodes.map(code => (
                  <div className="backup-code-chip" key={code}>{code}</div>
                ))}
              </div>
            </div>
          )}

          {!securityInfo?.twoFactorEnabled ? (
            !totpSetup ? (
              <button className="btn-pill primary sm" onClick={startTotpSetup} disabled={busy} style={{ alignSelf: 'flex-start' }}>
                <Smartphone size={14} /> Enable Authenticator 2FA
              </button>
            ) : (
              <form className="totp-setup-box" onSubmit={enableTotp}>
                <div className="totp-qr-row">
                  <img src={totpSetup.qrDataUrl} alt="Scan QR Code with Authenticator App" className="totp-qr-img" />
                  <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <strong style={{ color: '#fff', fontSize: '13px' }}>1. Scan QR Code</strong>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      Open Google Authenticator, Authy, or 1Password and scan the QR code, or enter this key manually:
                    </p>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <code style={{ fontSize: '11.5px', background: '#121218', padding: '6px 10px', borderRadius: '8px', color: '#f5c84d', wordBreak: 'break-all' }}>
                        {totpSetup.secret}
                      </code>
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => navigator.clipboard.writeText(totpSetup.secret).then(() => onToast('2FA secret copied!'))}
                        title="Copy setup key"
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="auth-input-group">
                  <label htmlFor="totp-enable-code">2. Enter 6-Digit Verification Code</label>
                  <input
                    id="totp-enable-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    className="auth-otp-input"
                    value={totpCode}
                    onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" className="btn-pill primary sm" disabled={busy || totpCode.length !== 6}>
                    <ShieldCheck size={13} /> Verify & Activate 2FA
                  </button>
                  <button type="button" className="btn-pill secondary sm" onClick={() => setTotpSetup(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                Backup codes remaining: <strong style={{ color: '#fff' }}>{securityInfo.backupCodesRemaining ?? 0} / 8</strong>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-pill secondary sm"
                  onClick={() => { setShowRegenBox(!showRegenBox); setDisableMode(false); }}
                >
                  <KeyRound size={13} /> Regenerate Backup Codes
                </button>
                <button
                  type="button"
                  className="btn-pill secondary sm"
                  style={{ borderColor: 'rgba(239, 68, 68, 0.35)', color: '#fca5a5' }}
                  onClick={() => { setDisableMode(!disableMode); setShowRegenBox(false); }}
                >
                  Disable 2FA
                </button>
              </div>

              {showRegenBox && (
                <form className="totp-setup-box" onSubmit={regenerateBackupCodes}>
                  <div className="auth-input-group">
                    <label htmlFor="regen-totp">Enter current 6-digit 2FA code</label>
                    <input
                      id="regen-totp"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={regenCode}
                      onChange={e => setRegenCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      required
                    />
                  </div>
                  <button type="submit" className="btn-pill primary sm" disabled={busy || regenCode.length !== 6}>
                    Confirm & Generate New Codes
                  </button>
                </form>
              )}

              {disableMode && (
                <form className="totp-setup-box" onSubmit={disableTotp}>
                  {securityInfo.passwordSet && (
                    <div className="auth-input-group">
                      <label htmlFor="disable-2fa-pwd">Current Password</label>
                      <input
                        id="disable-2fa-pwd"
                        type="password"
                        value={disablePassword}
                        onChange={e => setDisablePassword(e.target.value)}
                        required
                      />
                    </div>
                  )}
                  <div className="auth-input-group">
                    <label htmlFor="disable-2fa-code">Current 6-Digit Authenticator Code</label>
                    <input
                      id="disable-2fa-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={disableCode}
                      onChange={e => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      required
                    />
                  </div>
                  <button type="submit" className="btn-pill secondary sm" style={{ borderColor: 'rgba(239,68,68,0.5)', color: '#fca5a5' }} disabled={busy}>
                    Confirm Disable 2FA
                  </button>
                </form>
              )}
            </div>
          )}
        </article>

        {/* CARD 2: Password & Session Management */}
        <article className="security-card">
          <div className="security-card-head">
            <div>
              <h3>{securityInfo?.passwordSet ? 'Change Account Password' : 'Set Account Password'}</h3>
              <p>
                {securityInfo?.passwordSet
                  ? 'Updating your password enforces scrypt 256-bit hashing and invalidates all other logged-in devices.'
                  : 'Add a strong password to allow Email & Password logins in addition to OAuth.'}
              </p>
            </div>
            <span className="sec-status-badge active">
              <Lock size={12} /> Session v{securityInfo?.sessionVersion || 1}
            </span>
          </div>

          <form className="auth-form" onSubmit={handlePasswordUpdate}>
            {securityInfo?.passwordSet && (
              <div className="auth-input-group">
                <label htmlFor="sec-cur-pwd">Current Password</label>
                <input
                  id="sec-cur-pwd"
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  required
                />
              </div>
            )}

            <div className="auth-input-group">
              <label htmlFor="sec-new-pwd">New Strong Password</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="sec-new-pwd"
                  type={showNewPwd ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min 10 chars, mixed case, digit & symbol"
                  style={{ width: '100%', paddingRight: '40px' }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd(!showNewPwd)}
                  style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
                  aria-label="Toggle password visibility"
                >
                  {showNewPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {newPassword && (
                <div className="pwd-strength-wrap">
                  <div className="pwd-strength-header">
                    <span>Password strength</span>
                    <strong style={{ color: pwdEval.score >= 3 ? '#86efac' : '#fcd34d' }}>{pwdEval.label}</strong>
                  </div>
                  <div className="pwd-strength-bars">
                    {[1, 2, 3, 4].map(bar => (
                      <div key={bar} className={`pwd-strength-bar ${pwdEval.score >= bar ? `lvl-${pwdEval.score}` : ''}`} />
                    ))}
                  </div>
                  <div className="pwd-rules-grid">
                    {pwdEval.rules.map(rule => (
                      <span key={rule.id} className={`pwd-rule-tag ${rule.met ? 'met' : ''}`}>
                        {rule.met && <Check size={10} />} {rule.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="auth-input-group">
              <label htmlFor="sec-cfm-pwd">Confirm New Password</label>
              <input
                id="sec-cfm-pwd"
                type="password"
                value={confirmNewPassword}
                onChange={e => setConfirmNewPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
              <button type="submit" className="btn-pill primary sm" disabled={busy}>
                <Shield size={13} /> Save Password
              </button>

              {!confirmRevokeAll ? (
                <button
                  type="button"
                  className="btn-pill secondary sm"
                  onClick={() => setConfirmRevokeAll(true)}
                  disabled={busy}
                >
                  <LogOut size={13} /> Sign Out All Devices
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn-pill secondary sm"
                    style={{ borderColor: 'rgba(239, 68, 68, 0.5)', color: '#fca5a5' }}
                    onClick={revokeAllSessions}
                    disabled={busy}
                  >
                    Confirm Sign Out All
                  </button>
                  <button type="button" className="btn-pill secondary sm" onClick={() => setConfirmRevokeAll(false)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </form>
        </article>
      </div>

      {/* Security Audit Log */}
      <div className="table-panel" style={{ marginTop: '24px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ color: '#fff', fontSize: '16px' }}>Recent Security Activity</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Immutable authentication, 2FA, and session audit events recorded for your account.
            </p>
          </div>
          <span className="sec-status-badge active">
            <ShieldCheck size={12} /> Brute-Force & Replay Guard Active
          </span>
        </div>

        {!securityInfo?.securityEvents?.length ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No recent security events recorded yet.</p>
        ) : (
          <div className="security-events-list">
            {securityInfo.securityEvents.map(ev => (
              <div className="security-event-row" key={ev.id}>
                <div className="security-event-main">
                  <b style={{ color: ev.status === 'warning' ? '#fca5a5' : ev.status === 'success' ? '#86efac' : '#fff' }}>
                    {ev.summary}
                  </b>
                  <span>{ev.device || 'Unknown device'} · Type: {ev.type}</span>
                </div>
                <div className="security-event-meta">
                  <div>IP: {ev.ip || 'masked'}</div>
                  <div>{new Date(ev.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
