import React, { useEffect, useState } from 'react';
import {
  Check, Copy, ExternalLink, Link2, RefreshCw, ShieldAlert,
  Sparkles, Unlink, Users, Award, Send, Clock
} from 'lucide-react';

const money = n => new Intl.NumberFormat('en-US').format(Number(n) || 0);

function DiscordGlyph({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export default function DiscordInviteHub({
  me,
  invite,
  rewards,
  defaultInviteTiers,
  busy,
  onLinkDiscord,
  onUnlinkDiscord,
  onCreateDiscordInvite,
  onSyncDiscordInvites,
  onSilentSyncInvites,
  onRegisterDiscordInvite,
  onSubmitInviteClaim,
  onToast,
  onCardMouseMove,
  onCardMouseLeave
}) {
  const [registerCode, setRegisterCode] = useState(invite?.discordInviteUrl || invite?.discordInviteCode || '');
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [claimCode, setClaimCode] = useState(invite?.discordInviteCode || '');
  const [claimCount, setClaimCount] = useState('2');
  const [claimNote, setClaimNote] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [showWebRef, setShowWebRef] = useState(false);

  const tiers = invite?.inviteTiers || rewards?.inviteTiers || defaultInviteTiers;
  const discordLinked = Boolean(invite?.discordLinked ?? me?.discordLinked);
  const discordInGuild = Boolean(invite?.discordInGuild ?? me?.discordInGuild);
  const verifiedInvites = Number(invite?.verifiedInvites ?? rewards?.verifiedInvites ?? 0);
  const discordUses = Number(invite?.discordInviteUses ?? 0);
  const hzlEarned = Number(invite?.hzlEarnedFromInvites ?? 0);
  const nextTier = invite?.nextTier || null;
  const botConfigured = Boolean(invite?.botConfigured);
  const rewardsApiConfigured = Boolean(invite?.rewardsApiConfigured);
  const autoSyncActive = Boolean(botConfigured || rewardsApiConfigured);
  const discordSyncError = invite?.discordSyncError || null;
  const serverInviteUrl = invite?.serverInviteUrl || null;
  const discordInviteUrl = invite?.discordInviteUrl || null;
  const trackedCodes = Array.isArray(invite?.discordTrackedCodes) ? invite.discordTrackedCodes : [];
  const recentClaims = Array.isArray(invite?.claims) ? invite.claims : [];

  useEffect(() => {
    if (invite?.discordInviteCode && !claimCode) {
      setClaimCode(invite.discordInviteCode);
    }
    if (invite?.discordInviteUrl && !registerCode) {
      setRegisterCode(invite.discordInviteUrl);
    }
  }, [invite?.discordInviteCode, invite?.discordInviteUrl]);

  // Auto-sync live Discord server invites when tab is visible / window regains focus
  useEffect(() => {
    if (!discordLinked || !autoSyncActive || typeof onSilentSyncInvites !== 'function') {
      return undefined;
    }
    onSilentSyncInvites();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        onSilentSyncInvites();
      }
    }, 20000);

    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        onSilentSyncInvites();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [discordLinked, autoSyncActive]);

  const canUnlink = Boolean(
    discordLinked &&
    (me?.authProviders || []).some(p => p === 'email' || p === 'google')
  );

  async function copyText(val, successMsg) {
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      onToast(successMsg);
    } catch {
      onToast(val);
    }
  }

  async function handleRegisterSubmit(e) {
    e.preventDefault();
    if (typeof onRegisterDiscordInvite !== 'function') return;
    const ok = await onRegisterDiscordInvite(registerCode);
    if (ok) {
      setShowRegisterForm(false);
    }
  }

  async function handleClaimSubmit(e) {
    e.preventDefault();
    const ok = await onSubmitInviteClaim({
      inviteCode: claimCode,
      claimedCount: Number(claimCount),
      note: claimNote
    });
    if (ok) {
      setClaimNote('');
      setShowManualForm(false);
    }
  }

  return (
    <section className="rewards-section" id="invites">
      <div className="services-head">
        <div>
          <div className="section-label">DISCORD SERVER INVITE HUB</div>
          <h2 className="services-title">Invite Members to Discord & Earn HZL</h2>
          <p className="services-sub">
            Link your Discord account, use your personal Discord server invite link (or create one directly in our Discord server), and invite friends. Verified joins sync to your HZL milestone rewards.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {serverInviteUrl && (
            <a
              className="btn-pill secondary sm"
              href={serverInviteUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <DiscordGlyph size={14} /> Join Discord Server <ExternalLink size={12} />
            </a>
          )}
          {discordLinked && autoSyncActive && (
            <button
              className="btn-pill primary sm"
              onClick={onSyncDiscordInvites}
              disabled={busy}
            >
              <RefreshCw size={13} /> Sync Server Invites
            </button>
          )}
        </div>
      </div>

      {/* Diagnostic / Setup Banner when Discord Bot permissions or token need attention */}
      {discordLinked && discordSyncError && (
        <div className="invite-diagnostic-banner error" role="alert">
          <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Automatic Discord Invite Sync Error:</strong> {discordSyncError}
          </div>
        </div>
      )}

      {discordLinked && !autoSyncActive && (
        <div className="invite-diagnostic-banner warn" role="status">
          <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Live Discord Bot Sync Inactive:</strong> To automatically count invites created inside Discord, set <code>DISCORD_BOT_TOKEN</code> and <code>DISCORD_GUILD_ID</code> in the server <code>.env</code> (with <b>Manage Server</b> &amp; <b>Create Instant Invite</b> bot permissions). Until enabled, save your invite code and submit an invite verification claim below.
          </div>
        </div>
      )}

      {/* STEP 1 & STEP 2: DISCORD ACCOUNT LINK + PERSONAL SERVER INVITE */}
      <div className="invite-hub-grid">
        {/* CARD 1: DISCORD ACCOUNT CONNECTION */}
        <article
          className="invite-hub-card"
          onMouseMove={onCardMouseMove}
          onMouseLeave={onCardMouseLeave}
        >
          <div className="invite-card-head">
            <div>
              <span className="invite-step-tag">STEP 1 · DISCORD IDENTITY</span>
              <h3>Discord Server Connection</h3>
            </div>
            <span className={`sec-status-badge ${discordLinked ? 'active' : 'warn'}`}>
              {discordLinked ? <Check size={12} /> : <Link2 size={12} />}
              {discordLinked ? 'LINKED' : 'NOT LINKED'}
            </span>
          </div>

          {!discordLinked ? (
            <div className="invite-connect-box">
              <p className="invite-helper-text">
                Connect your Discord account to tie your HelzerX Cloud Console profile to your Discord server invites.
              </p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn-pill primary"
                  onClick={onLinkDiscord}
                  disabled={busy}
                >
                  <DiscordGlyph size={16} /> Link Discord Account
                </button>
                {serverInviteUrl && (
                  <a
                    className="btn-pill secondary"
                    href={serverInviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Join Server First <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="invite-linked-body">
              <div className="invite-discord-profile">
                {invite?.discordAvatar || me?.discordAvatar ? (
                  <img
                    src={invite?.discordAvatar || me?.discordAvatar}
                    alt={invite?.discordUsername || 'Discord avatar'}
                    className="invite-discord-avatar"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="invite-discord-avatar-fallback">
                    <DiscordGlyph size={20} />
                  </div>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="invite-discord-name">
                    {invite?.discordGlobalName || invite?.discordUsername || me?.discordUsername || 'Discord Member'}
                  </div>
                  <div className="invite-discord-meta">
                    @{invite?.discordUsername || me?.discordUsername || 'linked'} · ID: {invite?.discordId || me?.discordId}
                  </div>
                </div>
              </div>

              <div className="invite-guild-status-row">
                <div className={`invite-guild-pill ${discordInGuild ? 'ok' : 'warn'}`}>
                  {discordInGuild ? <Check size={13} /> : <ShieldAlert size={13} />}
                  <span>
                    {discordInGuild
                      ? 'Verified Member in HelzerX Discord Server'
                      : 'Not detected inside HelzerX Discord Server yet'}
                  </span>
                </div>

                {!discordInGuild && serverInviteUrl && (
                  <a
                    href={serverInviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-pill secondary sm"
                  >
                    Join Server <ExternalLink size={12} />
                  </a>
                )}
              </div>

              <div className="invite-card-footer-actions">
                <span className="invite-sync-meta">
                  {invite?.discordLastSyncedAt
                    ? `Last synced: ${new Date(invite.discordLastSyncedAt).toLocaleTimeString()}${autoSyncActive ? ' · Live sync active (20s)' : ''}`
                    : (autoSyncActive ? 'Live sync active (auto-detecting your Discord invites)' : 'Ready for invite code registration')}
                </span>

                {canUnlink && !confirmUnlink && (
                  <button
                    type="button"
                    className="invite-text-btn"
                    onClick={() => setConfirmUnlink(true)}
                  >
                    <Unlink size={12} /> Unlink Discord
                  </button>
                )}

                {canUnlink && confirmUnlink && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn-pill secondary sm"
                      style={{ borderColor: 'rgba(239,68,68,0.45)', color: '#fca5a5' }}
                      onClick={async () => {
                        await onUnlinkDiscord();
                        setConfirmUnlink(false);
                      }}
                      disabled={busy}
                    >
                      Confirm Unlink
                    </button>
                    <button
                      type="button"
                      className="btn-pill secondary sm"
                      onClick={() => setConfirmUnlink(false)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </article>

        {/* CARD 2: PERSONAL DISCORD SERVER INVITE LINK */}
        <article
          className="invite-hub-card highlight"
          onMouseMove={onCardMouseMove}
          onMouseLeave={onCardMouseLeave}
        >
          <div className="invite-card-head">
            <div>
              <span className="invite-step-tag">STEP 2 · SERVER INVITE LINK</span>
              <h3>Your Discord Server Invite</h3>
            </div>
            {discordInviteUrl && (
              <span className="sec-status-badge active">
                <Sparkles size={12} /> ACTIVE LINK
              </span>
            )}
          </div>

          {!discordLinked ? (
            <div className="invite-locked-state">
              <p className="invite-helper-text">
                Link your Discord account first to unlock your dedicated <code style={{ color: 'var(--accent-gold)' }}>discord.gg</code> server invite link and automatic member tracking.
              </p>
              <button
                type="button"
                className="btn-pill secondary sm"
                onClick={onLinkDiscord}
                disabled={busy}
                style={{ alignSelf: 'flex-start' }}
              >
                <Link2 size={13} /> Connect Discord to Unlock
              </button>
            </div>
          ) : (
            <div className="invite-link-workspace">
              {discordInviteUrl ? (
                <>
                  <div className="invite-url-row">
                    <input
                      type="text"
                      readOnly
                      value={discordInviteUrl}
                      className="invite-url-input"
                      aria-label="Your personal Discord server invite link"
                    />
                    <button
                      type="button"
                      className="btn-pill primary sm"
                      onClick={() => copyText(discordInviteUrl, 'Discord server invite link copied!')}
                    >
                      <Copy size={13} /> Copy Invite
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {autoSyncActive && (
                      <button
                        type="button"
                        className="btn-pill secondary sm"
                        onClick={onSyncDiscordInvites}
                        disabled={busy}
                      >
                        <RefreshCw size={12} /> Sync Server Uses
                      </button>
                    )}
                    {botConfigured && (
                      <button
                        type="button"
                        className="btn-pill secondary sm"
                        onClick={() => onCreateDiscordInvite(true)}
                        disabled={busy}
                      >
                        <Sparkles size={12} /> Generate New Link
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-pill secondary sm"
                      onClick={() => setShowRegisterForm(!showRegisterForm)}
                    >
                      <Link2 size={12} /> {showRegisterForm ? 'Hide Link Form' : 'Link Existing Invite'}
                    </button>
                    <button
                      type="button"
                      className="btn-pill secondary sm"
                      onClick={() => setShowManualForm(!showManualForm)}
                    >
                      <Send size={12} /> {showManualForm ? 'Hide Claim Form' : 'Submit Invite Verification'}
                    </button>
                  </div>
                </>
              ) : botConfigured ? (
                <div className="invite-connect-box">
                  <p className="invite-helper-text">
                    Generate your permanent Discord server invite link here — or if you already created an invite link inside Discord, any invite under your Discord account auto-syncs or can be linked below.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-pill primary sm"
                      onClick={() => onCreateDiscordInvite(false)}
                      disabled={busy}
                    >
                      <Sparkles size={13} /> Generate Server Invite
                    </button>
                    <button
                      type="button"
                      className="btn-pill secondary sm"
                      onClick={() => setShowRegisterForm(!showRegisterForm)}
                    >
                      <Link2 size={13} /> {showRegisterForm ? 'Hide Link Form' : 'I Already Created an Invite in Discord'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="invite-connect-box">
                  <p className="invite-helper-text">
                    Create a <strong>Never Expire</strong> invite inside our Discord server (Server → Invite People → Edit invite link → Never Expire &amp; No Max Uses), then save your invite link below and submit your invite count for verification.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-pill primary sm"
                      onClick={() => setShowRegisterForm(!showRegisterForm)}
                    >
                      <Link2 size={13} /> Save My Discord Invite Link
                    </button>
                    <button
                      type="button"
                      className="btn-pill secondary sm"
                      onClick={() => setShowManualForm(!showManualForm)}
                    >
                      <Send size={13} /> Submit Invite Verification
                    </button>
                  </div>
                </div>
              )}

              {showRegisterForm && (
                <form className="invite-claim-form" onSubmit={handleRegisterSubmit}>
                  <div className="auth-input-group">
                    <label htmlFor="discord-register-code">Paste Discord Invite Link You Created in Server</label>
                    <div className="invite-url-row">
                      <input
                        id="discord-register-code"
                        type="text"
                        placeholder="https://discord.gg/yourcode"
                        value={registerCode}
                        onChange={e => setRegisterCode(e.target.value)}
                        style={{ flex: 1, minWidth: '180px' }}
                        required
                      />
                      <button type="submit" className="btn-pill primary sm" disabled={busy}>
                        <Check size={13} /> Save &amp; Sync
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {(showManualForm || (!botConfigured && !discordInviteUrl && !showRegisterForm)) && (
                <form className="invite-claim-form" onSubmit={handleClaimSubmit}>
                  <div className="invite-claim-grid">
                    <div className="auth-input-group">
                      <label htmlFor="discord-invite-code">Your Discord Server Invite Link or Code</label>
                      <input
                        id="discord-invite-code"
                        type="text"
                        placeholder="https://discord.gg/abc1234 or abc1234"
                        value={claimCode}
                        onChange={e => setClaimCode(e.target.value)}
                        required
                      />
                    </div>
                    <div className="auth-input-group">
                      <label htmlFor="discord-invite-count">Members Invited</label>
                      <input
                        id="discord-invite-count"
                        type="number"
                        min={1}
                        max={500}
                        step={1}
                        value={claimCount}
                        onChange={e => setClaimCount(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="auth-input-group">
                    <label htmlFor="discord-invite-note">Optional Note (e.g. invited usernames)</label>
                    <input
                      id="discord-invite-note"
                      type="text"
                      maxLength={240}
                      placeholder="Optional context for staff review"
                      value={claimNote}
                      onChange={e => setClaimNote(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn-pill primary sm" disabled={busy} style={{ alignSelf: 'flex-start' }}>
                    <Send size={13} /> Submit for Verification
                  </button>
                </form>
              )}

              {/* Optional secondary dashboard ?ref= toggle */}
              <div className="invite-web-ref-toggle">
                <button
                  type="button"
                  className="invite-text-btn"
                  onClick={() => setShowWebRef(!showWebRef)}
                >
                  {showWebRef ? 'Hide web dashboard referral link' : 'Also need a web dashboard signup link?'}
                </button>
                {showWebRef && (
                  <div className="invite-url-row" style={{ marginTop: '8px' }}>
                    <input
                      type="text"
                      readOnly
                      value={invite?.referralUrl || `${window.location.origin}/?ref=${me?.id || ''}`}
                      className="invite-url-input"
                      style={{ fontSize: '11.5px', padding: '8px 12px' }}
                    />
                    <button
                      type="button"
                      className="btn-pill secondary sm"
                      onClick={() =>
                        copyText(
                          invite?.referralUrl || `${window.location.origin}/?ref=${me?.id || ''}`,
                          'Dashboard referral URL copied!'
                        )
                      }
                    >
                      <Copy size={12} /> Copy
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </article>
      </div>

      {/* STEP 3: LIVE INVITE PROGRESS & ATTRIBUTION LEDGER */}
      <div className="invite-progress-panel">
        <div className="invite-progress-metrics">
          <div className="invite-metric-tile">
            <span>Verified Server Invites</span>
            <strong>{money(verifiedInvites)}</strong>
          </div>
          <div className="invite-metric-tile">
            <span>Tracked Discord Uses</span>
            <strong>{money(discordUses)}</strong>
          </div>
          <div className="invite-metric-tile">
            <span>Pending Verification</span>
            <strong style={{ color: 'var(--accent-gold)' }}>{money(invite?.pendingInvites || 0)}</strong>
          </div>
          <div className="invite-metric-tile">
            <span>HZL Earned from Invites</span>
            <strong style={{ color: '#4ade80' }}>{money(hzlEarned)} HZL</strong>
          </div>
        </div>

        <div className="invite-milestone-bar-wrap">
          <div className="invite-milestone-bar-head">
            <div>
              <Award size={15} color="var(--accent-gold)" />
              {nextTier ? (
                <span>
                  Next Reward: <b>Tier {nextTier.count}</b> (+{money(nextTier.amount)} HZL)
                </span>
              ) : (
                <span>Maximum invite reward tier unlocked!</span>
              )}
            </div>
            <span className="invite-milestone-remaining">
              {nextTier
                ? `${nextTier.remaining} more verified invite${nextTier.remaining === 1 ? '' : 's'} needed`
                : '42+ verified invites achieved'}
            </span>
          </div>
          <div className="invite-progress-track">
            <div
              className="invite-progress-fill"
              style={{ width: `${nextTier ? nextTier.progressPct : 100}%` }}
            />
          </div>
        </div>

        {trackedCodes.length > 0 && (
          <div className="invite-sub-table">
            <div className="invite-sub-table-title">
              <Users size={14} color="var(--accent-gold)" /> Tracked Discord Server Invite Links
            </div>
            <div className="invite-code-list">
              {trackedCodes.map(item => (
                <div className="invite-code-row" key={item.code}>
                  <div className="invite-code-left">
                    <code>{item.url || `https://discord.gg/${item.code}`}</code>
                    <span>#{item.channelName || 'server'}</span>
                  </div>
                  <div className="invite-code-right">
                    <span className="invite-uses-badge">{money(item.uses)} joins</span>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => copyText(item.url || `https://discord.gg/${item.code}`, 'Invite link copied!')}
                      title="Copy invite link"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {recentClaims.length > 0 && (
          <div className="invite-sub-table">
            <div className="invite-sub-table-title">
              <Clock size={14} color="var(--text-muted)" /> Recent Invite Verification Claims
            </div>
            <div className="invite-code-list">
              {recentClaims.map(c => (
                <div className="invite-code-row" key={c.id}>
                  <div className="invite-code-left">
                    <b>
                      {c.type === 'discord_server'
                        ? `Discord Code: ${c.inviteCode} (+${c.claimedCount} invites)`
                        : `Member Referral: ${c.inviteeUsername || 'Pending member'}`}
                    </b>
                    <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                  <span
                    className={`status-badge ${
                      c.status === 'approved' ? 'provisioned' : c.status === 'rejected' ? 'error' : 'pending'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* STEP 4: MILESTONE TIER LADDER */}
      <div>
        <div className="section-label" style={{ marginBottom: '16px' }}>Discord Server Invite Milestone Schedule</div>
        <div className="tiers-grid">
          {tiers.map(([count, amount]) => {
            const achieved = verifiedInvites >= count;
            const isNext = nextTier && nextTier.count === count;
            return (
              <article
                className={`tier-card ${achieved || isNext ? 'featured' : ''}`}
                key={count}
                onMouseMove={onCardMouseMove}
                onMouseLeave={onCardMouseLeave}
              >
                <div className="tier-header">
                  <span className="tier-badge">{count} DISCORD INVITES</span>
                  {achieved ? (
                    <span style={{ color: '#2ecc71', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Check size={12} /> Achieved
                    </span>
                  ) : isNext ? (
                    <span style={{ color: 'var(--accent-gold)', fontSize: '11px', fontWeight: 700 }}>
                      Next Target
                    </span>
                  ) : null}
                </div>
                <div className="tier-amount">
                  <span className="tier-number">{money(amount)}</span>
                  <span className="tier-unit">HZL</span>
                </div>
                <p className="tier-desc">
                  Awarded when {count} verified genuine members join our Discord server via your personal invite link.
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
