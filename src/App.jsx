import React, { useEffect, useState } from 'react';
import { 
  Activity, ArrowRight, ArrowUpRight, Check, Copy, ExternalLink, 
  Layers, LogOut, RefreshCw, Server, ShieldCheck, Users, 
  Wallet, Zap, Lock, Coins, Terminal, HardDrive, Cpu, X, ChevronRight,
  Shield, Globe, Sparkles, Eye, EyeOff, Box, RotateCcw, KeyRound, Mail, ShieldAlert
} from 'lucide-react';
import ThreeHeroCanvas from './components/ThreeHeroCanvas.jsx';
import VpsDeployModal from './components/VpsDeployModal.jsx';
import MinecraftDeployModal from './components/MinecraftDeployModal.jsx';
import SecurityCenter, { evaluatePasswordStrength } from './components/SecurityCenter.jsx';
import serviceMinecraftBg from './assets/images/service_minecraft_bg_1794585441648.jpg';
import serviceLxcBg from './assets/images/service_lxc_bg_1794585442080.jpg';
import serviceLedgerBg from './assets/images/service_ledger_bg_1794585442923.jpg';
import serviceInfraBg from './assets/images/service_infra_bg_1794585442788.jpg';

const money = n => new Intl.NumberFormat('en-US').format(Number(n) || 0);
const referralParam = new URLSearchParams(window.location.search).get('ref');
const loginUrl = '/api/auth/discord' + (referralParam ? '?ref=' + encodeURIComponent(referralParam) : '');

const defaultInviteTiers = [
  [2, 200], [4, 600], [8, 900], [12, 1300], 
  [16, 1700], [24, 2400], [28, 2900], [34, 3400], 
  [38, 4000], [42, 4500]
];

const defaultBoostTiers = [
  [1, 2000], [2, 4000], [3, 4700], [4, 5000], [7, 6900], [10, 10000]
];

function Brand() {
  return (
    <a className="brand-link" href="/" aria-label="HelzerX Cloud home">
      helzerx<span className="brand-dot">.</span>
    </a>
  );
}

function DiscordIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function GoogleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-1.4 3.6-5.4 3.6-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.1 14.6 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.3-.2-2H12z" />
      <path fill="#34A853" d="M3.2 7.3l3.2 2.4C7.3 7.5 9.4 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.1 14.6 2 12 2 8.1 2 4.8 4.2 3.2 7.3z" />
      <path fill="#FBBC05" d="M12 22c2.6 0 4.8-.9 6.4-2.4l-3-2.5c-.8.6-1.9 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1l-3.3 2.5C4.7 19.7 8.1 22 12 22z" />
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.3-.2-2H12v3.9h5.4c-.3 1.3-1 2.4-2 3.1l3 2.5c1.8-1.6 3.2-4.1 3.2-7.5z" />
    </svg>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [rewards, setRewards] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [invite, setInvite] = useState(null);
  const [boostCount, setBoostCount] = useState('1');
  const [hostingOptions, setHostingOptions] = useState([]);
  const [hostingProvisioning, setHostingProvisioning] = useState({ enabled: false, ready: false });
  const [vpsDeploymentOptions, setVpsDeploymentOptions] = useState({ nodes: [], osOptions: [] });
  const [vpsModalPlan, setVpsModalPlan] = useState(null);
  const [mcModalPlan, setMcModalPlan] = useState(null);
  const [mcEggs, setMcEggs] = useState([]);
  const [mcNodes, setMcNodes] = useState([]);
  const [catalogFilter, setCatalogFilter] = useState('all'); // 'all' | 'lxc' | 'minecraft'
  const [generatedRootPassword, setGeneratedRootPassword] = useState('');
  const [hostingRequests, setHostingRequests] = useState([]);
  const [activeTab, setActiveTab] = useState('deploy'); // 'deploy' | 'servers' | 'invites' | 'boosts' | 'security'
  const [generatedPrivateKey, setGeneratedPrivateKey] = useState('');
  const [viewPublicMode, setViewPublicMode] = useState(false);
  const [use3DCanvas, setUse3DCanvas] = useState(true);

  // Split Auth Modal & Security State
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signup'); // 'signup' | 'login'
  const [authStep, setAuthStep] = useState('form'); // 'form' | '2fa'
  const [authFirstName, setAuthFirstName] = useState('');
  const [authLastName, setAuthLastName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authTwoFactorCode, setAuthTwoFactorCode] = useState('');
  const [authEmailHint, setAuthEmailHint] = useState('');
  const [authReferral, setAuthReferral] = useState(referralParam || '');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');
  const [authProviders, setAuthProviders] = useState({ googleConfigured: false, discordConfigured: false, emailAuthEnabled: true });
  const [securityInfo, setSecurityInfo] = useState(null);

  async function loadSecurityInfo() {
    try {
      const r = await fetch('/api/auth/security', { credentials: 'same-origin', cache: 'no-store' });
      if (r.ok) {
        setSecurityInfo(await r.json());
      }
    } catch {
      // ignore transient error
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const r = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) {
        setMe(null);
        setRewards(null);
        setSecurityInfo(null);
        return;
      }
      const d = await r.json();
      setMe(d.user);
      setRewards(d.rewards);

      try {
        const [ir, hr, rr, sr] = await Promise.all([
          fetch('/api/invites', { credentials: 'same-origin', cache: 'no-store' }),
          fetch('/api/hosting-options', { credentials: 'same-origin', cache: 'no-store' }),
          fetch('/api/hosting-requests', { credentials: 'same-origin', cache: 'no-store' }),
          fetch('/api/auth/security', { credentials: 'same-origin', cache: 'no-store' })
        ]);
        if (ir.ok) setInvite(await ir.json());
        if (hr.ok) {
          const hd = await hr.json();
          setHostingOptions(Array.isArray(hd.options) ? hd.options : []);
          setHostingProvisioning(hd.provisioning && typeof hd.provisioning === 'object' ? hd.provisioning : { enabled: false, ready: false });
          setVpsDeploymentOptions({ nodes: Array.isArray(hd.nodes) ? hd.nodes : [], osOptions: Array.isArray(hd.osOptions) ? hd.osOptions : [] });
          if (Array.isArray(hd.mcEggs)) setMcEggs(hd.mcEggs);
          if (Array.isArray(hd.mcNodes)) setMcNodes(hd.mcNodes);
        }
        if (rr.ok) {
          const rd = await rr.json();
          setHostingRequests(Array.isArray(rd.requests) ? rd.requests : []);
        }
        if (sr.ok) {
          setSecurityInfo(await sr.json());
        }
      } catch (err) {
        console.error('Error loading sub-resources:', err);
      }
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    fetch('/api/auth/providers', { credentials: 'same-origin', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setAuthProviders(d); })
      .catch(() => {});

    if (window.location.hash === '#security') {
      setActiveTab('security');
    }

    const p = new URLSearchParams(window.location.search);
    const status = p.get('login');
    if (status) {
      if (status === '2fa') {
        setAuthMode('login');
        setAuthStep('2fa');
        setAuthModalOpen(true);
      } else if (status === 'required') {
        setAuthMode('login');
        setAuthStep('form');
        setAuthModalOpen(true);
      } else {
        const messages = {
          success: 'Account connected successfully. Welcome to your HelzerX Cloud panel.',
          cancelled: 'Login was cancelled.',
          failed: 'Login failed. Please verify credentials.',
          'join-discord': 'Please join the official Discord server to verify community status.'
        };
        setToast(messages[status] || '');
      }
      window.history.replaceState({}, '', window.location.pathname);
    }

    const handleOAuthMessage = (event) => {
      const origin = event.origin || '';
      if (origin !== window.location.origin && !origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'OAUTH_AUTH_SUCCESS') {
        setAuthModalOpen(false);
        setAuthStep('form');
        setAuthError('');
        setToast('Authenticated securely. Welcome to HelzerX Cloud!');
        loadData();
      } else if (msg.type === 'OAUTH_2FA_REQUIRED') {
        setAuthMode('login');
        setAuthStep('2fa');
        setAuthError('');
        setAuthInfo('Verify your 6-digit authenticator code to complete sign-in.');
        setAuthModalOpen(true);
      } else if (msg.type === 'OAUTH_JOIN_DISCORD' || msg.type === 'OAUTH_AUTH_ERROR') {
        setAuthError(msg.message || 'Authentication could not be completed.');
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  async function logout() {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      setMe(null);
      setRewards(null);
      setSecurityInfo(null);
      setToast('You have been signed out.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshAccount() {
    await loadData();
    setToast('Account balance and server status refreshed.');
  }

  async function copyInviteLink() {
    const url = invite?.referralUrl || `${window.location.origin}/?ref=${me?.id || ''}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast('Your unique referral URL has been copied to clipboard.');
    } catch {
      setToast(url);
    }
  }

  async function submitBoostClaim() {
    setBusy(true);
    try {
      const r = await fetch('/api/boost-claims', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boosts: Number(boostCount) })
      });
      const d = await r.json();
      setToast(d.message || d.error || 'Claim submitted.');
      if (r.ok) {
        await loadData();
      }
    } catch {
      setToast('Could not submit boost claim. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function handleRequestClick(plan) {
    if (plan.service === 'minecraft') {
      setMcModalPlan(plan);
    } else {
      setVpsModalPlan(plan);
    }
  }

  async function loadVpsTemplates(nodeId) {
    const r = await fetch('/api/hosting-templates?nodeId=' + encodeURIComponent(nodeId), {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Unable to read operating systems from Proxmox.');
    return Array.isArray(d.templates) ? d.templates : [];
  }

  async function executeHostingRequest(plan, config = {}) {
    setBusy(true);
    try {
      const payload = plan.service === 'minecraft'
        ? {
            service: 'minecraft',
            planId: plan.id,
            displayName: config.displayName,
            eggId: config.eggId,
            nodeId: config.nodeId
          }
        : {
            service: plan.service,
            planId: plan.id,
            displayName: config.displayName,
            nodeId: config.nodeId,
            osId: config.osId,
            password: config.password
          };

      const r = await fetch('/api/hosting-requests', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      setToast(d.message || d.error || 'Request processed.');
      if (r.ok) {
        if (d.generatedSshPrivateKey) setGeneratedPrivateKey(d.generatedSshPrivateKey);
        if (d.rootPassword) setGeneratedRootPassword(d.rootPassword);
        setVpsModalPlan(null);
        setMcModalPlan(null);
        await loadData();
        setActiveTab('servers');
      } else if (d.request?.id) {
        setVpsModalPlan(null);
        setMcModalPlan(null);
        await loadData();
        setActiveTab('servers');
      } else {
        setVpsModalPlan(null);
        setMcModalPlan(null);
      }
    } catch {
      setVpsModalPlan(null);
      setMcModalPlan(null);
      setToast('Unable to submit hosting request. Please verify connection.');
    } finally {
      setBusy(false);
    }
  }

  function openAuthModal(mode = 'signup') {
    setAuthMode(mode);
    setAuthStep('form');
    setAuthError('');
    setAuthInfo('');
    setAuthTwoFactorCode('');
    setAuthModalOpen(true);
  }

  async function handleGoogleAuth() {
    setAuthError('');
    setAuthInfo('');
    try {
      const q = authReferral ? '?ref=' + encodeURIComponent(authReferral) : '';
      const r = await fetch('/api/auth/google/url' + q, { credentials: 'same-origin', cache: 'no-store' });
      const d = await r.json();
      if (!d.configured || !d.url) {
        setAuthInfo('Direct Google 1-click OAuth is awaiting server GOOGLE_CLIENT_ID setup — use your @gmail.com address below to create or log into your secured HelzerX account immediately.');
        const emailEl = document.getElementById('auth-email');
        if (emailEl) emailEl.focus();
        return;
      }
      const popup = window.open(d.url, 'helzerx_google_oauth', 'width=540,height=680');
      if (!popup) {
        setAuthError('Please allow popups for this site to sign in with Google.');
      }
    } catch {
      setAuthError('Could not initialize Google sign-in.');
    }
  }

  async function handleDiscordAuth() {
    setAuthError('');
    setAuthInfo('');
    try {
      const q = authReferral ? '?ref=' + encodeURIComponent(authReferral) : '';
      const r = await fetch('/api/auth/discord/url' + q, { credentials: 'same-origin', cache: 'no-store' });
      const d = await r.json();
      if (!r.ok || !d.url) {
        setAuthError(d.error || 'Discord OAuth is not configured on this server. Use your Gmail account below.');
        return;
      }
      const popup = window.open(d.url, 'helzerx_discord_oauth', 'width=540,height=680');
      if (!popup) {
        window.location.href = loginUrl;
      }
    } catch {
      window.location.href = loginUrl;
    }
  }

  // Real Email/Gmail & Password Registration, Login, and 2FA Verification
  async function handleAuthSubmit(e) {
    if (e) e.preventDefault();
    setAuthError('');
    setAuthInfo('');

    if (authMode === 'signup') {
      const pwdEval = evaluatePasswordStrength(authPassword);
      if (!pwdEval.allMet) {
        setAuthError('Password must be 10+ characters and include uppercase, lowercase, number, and symbol.');
        return;
      }
      if (authPassword !== authConfirmPassword) {
        setAuthError('Passwords do not match. Please re-enter carefully.');
        return;
      }
    }

    setBusy(true);
    try {
      if (authMode === 'signup') {
        const r = await fetch('/api/auth/register', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: authFirstName,
            lastName: authLastName,
            email: authEmail,
            password: authPassword,
            referralCode: authReferral
          })
        });
        const d = await r.json();
        if (!r.ok) {
          setAuthError(d.error || 'Registration failed.');
          return;
        }
        setAuthModalOpen(false);
        setAuthPassword('');
        setAuthConfirmPassword('');
        setToast(`Welcome to HelzerX Cloud, ${d.user.username}! Enable 2FA inside Security for maximum protection.`);
        await loadData();
      } else {
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: authEmail,
            password: authPassword
          })
        });
        const d = await r.json();
        if (!r.ok) {
          setAuthError(d.error || 'Invalid email or password.');
          return;
        }
        if (d.requires2fa) {
          setAuthEmailHint(d.emailHint || authEmail);
          setAuthStep('2fa');
          setAuthTwoFactorCode('');
          return;
        }
        setAuthModalOpen(false);
        setAuthPassword('');
        setToast(`Welcome back, ${d.user.username}!`);
        await loadData();
      }
    } catch {
      setAuthError('Connection error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handle2faVerifySubmit(e) {
    if (e) e.preventDefault();
    setBusy(true);
    setAuthError('');
    try {
      const r = await fetch('/api/auth/2fa/login-verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: authTwoFactorCode })
      });
      const d = await r.json();
      if (!r.ok) {
        setAuthError(d.error || 'Invalid verification code.');
        return;
      }
      setAuthModalOpen(false);
      setAuthStep('form');
      setAuthPassword('');
      setAuthTwoFactorCode('');
      setToast(d.usedBackupCode ? 'Signed in with backup recovery code. Consider regenerating your backup codes in Security.' : `Welcome back, ${d.user.username}!`);
      await loadData();
    } catch {
      setAuthError('Connection error while verifying 2FA code.');
    } finally {
      setBusy(false);
    }
  }

  // Mouse tilt helper for 3D cards & depth layers
  const handleCardMouseMove = (e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = (x / rect.width) - 0.5;
    const py = (y / rect.height) - 0.5;
    const rx = (-py * 13).toFixed(2);
    const ry = (px * 13).toFixed(2);
    card.style.setProperty('--mouse-x', `${x}px`);
    card.style.setProperty('--mouse-y', `${y}px`);
    card.style.setProperty('--px', px.toFixed(3));
    card.style.setProperty('--py', py.toFixed(3));
    card.style.setProperty('--rx', `${rx}deg`);
    card.style.setProperty('--ry', `${ry}deg`);
  };

  const handleCardMouseLeave = (e) => {
    const card = e.currentTarget;
    card.style.setProperty('--px', '0');
    card.style.setProperty('--py', '0');
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  };

  // Display real enabled LXC and Minecraft plans from the backend
  const catalogPlans = hostingOptions.filter(plan => (plan.service === 'lxc' || plan.service === 'minecraft') && Number.isSafeInteger(Number(plan.cost)) && Number(plan.cost) > 0);

  return (
    <div className="app-container">
      <div className="ambient-glow" />

      {/* Top Bar Contract (3 zones separated by gap) */}
      <header className="top-nav">
        {/* Zone 1: Wordmark */}
        <Brand />

        {/* Zone 2: Navigation Links */}
        <nav className="nav-links" aria-label="Main navigation">
          {me && !viewPublicMode ? (
            <>
              <a href="#overview" onClick={() => setActiveTab('deploy')} className={activeTab === 'deploy' ? 'active' : ''}>Deploy</a>
              <a href="#servers" onClick={() => setActiveTab('servers')} className={activeTab === 'servers' ? 'active' : ''}>My Servers ({hostingRequests.length})</a>
              <a href="/control">Control Center ↗</a>
              <a href="#invites" onClick={() => setActiveTab('invites')} className={activeTab === 'invites' ? 'active' : ''}>Invite Hub</a>
              <a href="#boosts" onClick={() => setActiveTab('boosts')} className={activeTab === 'boosts' ? 'active' : ''}>Boost Rewards</a>
              <a href="#security" onClick={() => setActiveTab('security')} className={activeTab === 'security' ? 'active' : ''}>Security</a>
              <a href="#preview" onClick={() => setViewPublicMode(true)}>View Landing</a>
            </>
          ) : (
            <>
              <a href="#about">About</a>
              <a href="#services">Services</a>
              <a href="#rewards">HZL Rewards</a>
              <a href="#infrastructure">Infrastructure</a>
            </>
          )}
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="nav-actions">
          {me ? (
            <div className="user-chip">
              {me.avatar ? (
                <img src={me.avatar} alt={me.username} className="user-avatar" referrerPolicy="no-referrer" />
              ) : (
                <span className="user-avatar-fallback">{me.username.slice(0, 1).toUpperCase()}</span>
              )}
              <div className="user-details">
                <span className="user-name" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {me.global_name || me.username}
                  {me.twoFactorEnabled && <ShieldCheck size={12} color="#4ade80" title="2FA Protected" />}
                </span>
                <span className="user-badge">{money(rewards?.balance || 0)} HZL</span>
              </div>
              <button className="btn-icon" onClick={refreshAccount} title="Refresh balance" aria-label="Refresh balance">
                <RefreshCw size={13} />
              </button>
              <button className="btn-icon" onClick={logout} disabled={busy} title="Sign out" aria-label="Sign out">
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="btn-pill secondary sm" 
                onClick={() => openAuthModal('login')}
              >
                Log In
              </button>
              <button 
                className="btn-pill primary sm" 
                onClick={() => openAuthModal('signup')}
              >
                Sign Up <ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      {me && !viewPublicMode ? (
        /* ================= MEMBER DASHBOARD ================= */
        <main className="page-content" style={{ gap: '48px' }}>
          <section className="dashboard-header" id="overview">
            <div className="dashboard-hero">
              <div className="dashboard-title-wrap">
                <h1>Member Cloud Console</h1>
                <p>Manage your verified HZL credits, deploy Minecraft and Proxmox LXC servers, and track infrastructure status.</p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn-pill secondary sm" onClick={refreshAccount}>
                  <RefreshCw size={12} /> Sync Ledger
                </button>
                <a className="btn-pill primary sm" href="#deploy" onClick={() => setActiveTab('deploy')}>
                  Deploy Server <ArrowRight size={12} />
                </a>
              </div>
            </div>

            {/* Dashboard Navigation Tabs */}
            <div className="dashboard-tabs">
              <button 
                className={`tab-btn ${activeTab === 'deploy' ? 'active' : ''}`}
                onClick={() => setActiveTab('deploy')}
              >
                <Layers size={14} /> Hosting Catalog
              </button>
              <button 
                className={`tab-btn ${activeTab === 'servers' ? 'active' : ''}`}
                onClick={() => setActiveTab('servers')}
              >
                <Server size={14} /> My Containers & Servers ({hostingRequests.length})
              </button>
              <button 
                className={`tab-btn ${activeTab === 'invites' ? 'active' : ''}`}
                onClick={() => setActiveTab('invites')}
              >
                <Users size={14} /> Invite & Referral Hub
              </button>
              <button 
                className={`tab-btn ${activeTab === 'boosts' ? 'active' : ''}`}
                onClick={() => setActiveTab('boosts')}
              >
                <Zap size={14} /> Boost Claim Submission
              </button>
              <button 
                className={`tab-btn ${activeTab === 'security' ? 'active' : ''}`}
                onClick={() => { setActiveTab('security'); loadSecurityInfo(); }}
              >
                <ShieldCheck size={14} /> Security & 2FA
              </button>
            </div>
          </section>

          {/* KPI Stats Strip */}
          <section className="stats-grid" aria-label="Account Overview Stats">
            <div className="stat-box highlight" onMouseMove={handleCardMouseMove} onMouseLeave={handleCardMouseLeave}>
              <div className="stat-box-label">
                <span>Available Balance</span>
                <Coins size={14} color="var(--accent-gold)" />
              </div>
              <div className="stat-box-num">{money(rewards?.balance || 0)} <small style={{ fontSize: '15px', color: 'var(--accent-gold)' }}>HZL</small></div>
              <div className="stat-box-sub">{rewards?.connected ? 'Attributed on official ledger' : 'Ready for redemption'}</div>
            </div>

            <div className="stat-box" onMouseMove={handleCardMouseMove} onMouseLeave={handleCardMouseLeave}>
              <div className="stat-box-label">
                <span>Verified Invites</span>
                <Users size={14} />
              </div>
              <div className="stat-box-num">{money(invite?.verifiedInvites ?? rewards?.verifiedInvites ?? 0)}</div>
              <div className="stat-box-sub">
                {invite?.pendingInvites ? `${invite.pendingInvites} pending review` : 'All claims verified'}
              </div>
            </div>

            <div className="stat-box" onMouseMove={handleCardMouseMove} onMouseLeave={handleCardMouseLeave}>
              <div className="stat-box-label">
                <span>Server Boosts</span>
                <Zap size={14} />
              </div>
              <div className="stat-box-num">{money(rewards?.activeBoosts || 0)}</div>
              <div className="stat-box-sub">Active community boosts</div>
            </div>

            <div className="stat-box" onMouseMove={handleCardMouseMove} onMouseLeave={handleCardMouseLeave}>
              <div className="stat-box-label">
                <span>Active Servers</span>
                <Server size={14} />
              </div>
              <div className="stat-box-num">{hostingRequests.length}</div>
              <div className="stat-box-sub">Proxmox LXC & Minecraft</div>
            </div>
          </section>

          {/* TAB 1: DEPLOY HOSTING CATALOG */}
          {activeTab === 'deploy' && (
            <section className="services-section" id="deploy">
              <div className="services-head">
                <div>
                  <div className="section-label">HZL CLOUD REDEMPTION</div>
                  <h2 className="services-title">Deploy Cloud VPS & Minecraft</h2>
                  <p className="services-sub">Choose a Proxmox LXC container or Pterodactyl Minecraft server and deploy directly using your earned HZL balance. Your balance is checked before provisioning and deducted automatically upon server activation.</p>
                  
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', marginTop: '16px' }}>
                    <span className="stat-box-sub">Your balance: <strong style={{ color: 'var(--accent-gold)' }}>{money(rewards?.balance || 0)} HZL</strong></span>
                    <span className="stat-box-sub" role="status" style={{ color: hostingProvisioning.ready ? '#43d17a' : '#e6b45c' }}>
                      {hostingProvisioning.ready ? 'Automatic VPS engine: Online' : 'Proxmox VPS: Standby'}
                    </span>
                    <span className="stat-box-sub" role="status" style={{ color: '#c084fc' }}>
                      Pterodactyl Minecraft: Ready
                    </span>
                  </div>

                  {/* Filter Tabs */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
                    <button
                      className={`btn-pill ${catalogFilter === 'all' ? 'primary' : 'secondary'} sm`}
                      onClick={() => setCatalogFilter('all')}
                    >
                      All Plans ({catalogPlans.length})
                    </button>
                    <button
                      className={`btn-pill ${catalogFilter === 'lxc' ? 'primary' : 'secondary'} sm`}
                      onClick={() => setCatalogFilter('lxc')}
                    >
                      Cloud VPS ({catalogPlans.filter(p => p.service === 'lxc').length})
                    </button>
                    <button
                      className={`btn-pill ${catalogFilter === 'minecraft' ? 'primary' : 'secondary'} sm`}
                      onClick={() => setCatalogFilter('minecraft')}
                    >
                      <Box size={13} /> Minecraft SMP ({catalogPlans.filter(p => p.service === 'minecraft').length})
                    </button>
                  </div>
                </div>
              </div>

              {catalogPlans.filter(p => catalogFilter === 'all' || p.service === catalogFilter).length === 0 ? (
                <div className="table-panel" style={{ padding: '32px 24px', marginTop: '18px' }}>
                  <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto' }}>
                    <Server size={32} style={{ margin: '0 auto 12px', opacity: 0.55 }} />
                    <h3 style={{ color: '#fff', marginBottom: '8px' }}>No hosting plans matching filter</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.7 }}>
                      Switch filter to view available Cloud VPS containers or Minecraft game servers.
                    </p>
                    <button className="btn-pill secondary sm" style={{ marginTop: '14px' }} onClick={() => setCatalogFilter('all')}>
                      View All Plans
                    </button>
                  </div>
                </div>
              ) : (
              <div className="catalog-grid">
                {catalogPlans
                  .filter(p => catalogFilter === 'all' || p.service === catalogFilter)
                  .map(plan => {
                    const isMc = plan.service === 'minecraft';
                    const canAfford = Number(rewards?.balance || 0) >= Number(plan.cost);
                    const canDeploy = isMc
                      ? (canAfford && !busy)
                      : (hostingProvisioning.ready && canAfford && !busy);

                    return (
                      <article className="plan-card" key={plan.id} onMouseMove={handleCardMouseMove} onMouseLeave={handleCardMouseLeave} style={isMc ? { borderColor: 'rgba(168, 85, 247, 0.25)' } : {}}>
                        <div className="plan-top">
                          <span className="plan-service-tag" style={isMc ? { color: '#c084fc', borderColor: 'rgba(168, 85, 247, 0.3)' } : {}}>
                            {isMc ? 'MINECRAFT · PTERODACTYL' : 'PROXMOX LINUX CONTAINER'}
                          </span>
                          <h3 className="plan-title">{plan.name}</h3>
                          <p className="plan-desc">{plan.description}</p>
                          
                          {isMc ? (
                            <ul className="plan-features">
                              <li><Check size={13} /> {money(plan.pterodactyl?.memory || 2048)} MB Isolated Game RAM</li>
                              <li><Check size={13} /> {plan.pterodactyl?.cores || 1} vCPU Dedicated Core & NVMe</li>
                              <li><Check size={13} /> Paper, Purpur, Fabric & Bedrock supported</li>
                              <li><Check size={13} /> Pterodactyl console & instant power controls</li>
                            </ul>
                          ) : (
                            <ul className="plan-features">
                              <li><Check size={13} /> Dedicated CPU, isolated RAM and NVMe storage</li>
                              <li><Check size={13} /> Root SSH credentials generated automatically</li>
                              <li><Check size={13} /> Low-latency datacenter network fabric</li>
                            </ul>
                          )}
                        </div>

                        <div className="plan-bottom">
                          <div className="plan-cost">
                            <span>Cost</span>
                            <b>{money(plan.cost)} <small style={{ fontSize: '12px', color: isMc ? '#c084fc' : 'var(--accent-gold)' }}>HZL</small></b>
                          </div>
                          <button 
                            className="btn-pill primary sm"
                            disabled={!canDeploy}
                            onClick={() => handleRequestClick(plan)}
                            style={{ 
                              opacity: canDeploy ? 1 : 0.55,
                              ...(isMc ? { background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', borderColor: '#c084fc' } : {})
                            }}
                            title={!isMc && !hostingProvisioning.ready ? 'Automatic VPS provisioning is not configured yet' : !canAfford ? 'You need more HZL to deploy this plan' : `Deploy this ${isMc ? 'Minecraft Server' : 'VPS'} using HZL`}
                          >
                            {!isMc && !hostingProvisioning.ready ? 'Unavailable' : !canAfford ? 'Need More HZL' : (isMc ? 'Deploy Minecraft' : 'Deploy VPS')} <ArrowRight size={12} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
              </div>
              )}
            </section>
          )}

          {/* TAB 2: MY SERVERS & REQUEST HISTORY */}
          {activeTab === 'servers' && (
            <section className="services-section" id="servers">
              <div className="table-panel">
                <div className="table-head">
                  <div>
                    <h3>Your Server Requests & Deployments</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Manage your live Proxmox LXC containers and Pterodactyl Minecraft instances.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <a className="btn-pill secondary sm" href="/control" target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={12} /> Control Center
                    </a>
                    <button className="btn-pill secondary sm" onClick={refreshAccount}>
                      <RefreshCw size={12} /> Refresh
                    </button>
                  </div>
                </div>

                {hostingRequests.length === 0 ? (
                  <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Server size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                    <p style={{ fontSize: '15px', color: '#fff', fontWeight: 600 }}>No hosting deployments yet</p>
                    <p style={{ fontSize: '13px', marginTop: '4px' }}>Choose a hosting plan from the catalog to request your first container or game server.</p>
                    <button 
                      className="btn-pill primary sm" 
                      style={{ marginTop: '16px' }}
                      onClick={() => setActiveTab('deploy')}
                    >
                      View Catalog <ArrowRight size={12} />
                    </button>
                  </div>
                ) : (
                  <div>
                    {hostingRequests.map(req => {
                      const isMc = req.service === 'minecraft';
                      const isProvisioned = req.status === 'provisioned';
                      const isPending = req.status === 'pending';
                      const isError = req.status === 'provisioning-error';
                      return (
                        <div className="request-item" key={req.id}>
                          <div className="request-info">
                            <span className="request-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {isMc ? <Box size={14} color="#c084fc" /> : <Server size={14} color="#f5c84d" />}
                              {req.displayName || req.hostname || req.planName || (isMc ? 'Minecraft Server' : 'Cloud VPS')}
                              {isMc && (
                                <span style={{ fontSize: '10px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                                  MC PTERODACTYL
                                </span>
                              )}
                            </span>
                            <span className="request-meta">
                              ID: {req.id.slice(0, 8)}... · Cost: {money(req.cost)} HZL · Submitted: {new Date(req.createdAt).toLocaleDateString()}
                              {isMc ? (
                                <>
                                  {req.serverIp ? ` · Address: ${req.serverIp}:${req.serverPort || 25565}` : ''}
                                  {req.eggName ? ` · Software: ${req.eggName}` : ''}
                                  {req.nodeName ? ` · Node: ${req.nodeName}` : ''}
                                </>
                              ) : (
                                <>
                                  {req.vmid ? ` · CT VMID: ${req.vmid}` : ''}
                                  {req.hostname ? ` · Host: ${req.hostname}` : ''}
                                  {req.nodeId ? ` · Node: ${req.nodeId}` : ''}
                                  {req.osLabel ? ` · OS: ${req.osLabel}` : ''}
                                </>
                              )}
                            </span>
                            {req.error && (
                              <span style={{ color: '#e74c3c', fontSize: '11px', marginTop: '2px' }}>
                                Error: {req.error}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className={`status-badge ${isProvisioned ? 'provisioned' : isPending ? 'pending' : isError ? 'error' : 'provisioning'}`}>
                              {isProvisioned ? <Check size={11} /> : isPending ? <Activity size={11} /> : <Server size={11} />}
                              {req.provisioningStatus || req.status}
                            </span>
                            <a
                              href="/control"
                              className="btn-pill secondary sm"
                              style={{ padding: '4px 10px', fontSize: '11px' }}
                              title="Manage server in Control Center"
                            >
                              Manage ↗
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TAB 3: INVITE & REFERRAL HUB */}
          {activeTab === 'invites' && (
            <section className="rewards-section" id="invites">
              <div className="services-head">
                <div>
                  <div className="section-label">Community Expansion</div>
                  <h2 className="services-title">Personal Referral Program</h2>
                  <p className="services-sub">Share your referral link with builders and server owners. Once registered, HZL rewards are automatically attributed to your account.</p>
                </div>
              </div>

              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Your Unique Referral URL
                </span>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input 
                    type="text" 
                    readOnly 
                    value={invite?.referralUrl || `${window.location.origin}/?ref=${me.id}`} 
                    style={{ flex: 1, minWidth: '280px', background: '#09090c', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '13px' }}
                  />
                  <button className="btn-pill primary" onClick={copyInviteLink}>
                    <Copy size={13} /> Copy Link
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: 'var(--text-muted)' }}>
                  <span>Verified: <b style={{ color: '#fff' }}>{invite?.verifiedInvites || 0}</b></span>
                  <span>Pending review: <b style={{ color: 'var(--accent-gold)' }}>{invite?.pendingInvites || 0}</b></span>
                </div>
              </div>

              <div className="section-label" style={{ marginTop: '16px' }}>Invite Milestone Schedule</div>
              <div className="tiers-grid">
                {(rewards?.inviteTiers || defaultInviteTiers).map(([count, amount]) => {
                  const achieved = (invite?.verifiedInvites || 0) >= count;
                  return (
                    <article className={`tier-card ${achieved ? 'featured' : ''}`} key={count} onMouseMove={handleCardMouseMove} onMouseLeave={handleCardMouseLeave}>
                      <div className="tier-header">
                        <span className="tier-badge">TIER {count}</span>
                        {achieved && <span style={{ color: '#2ecc71', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><Check size={12} /> Achieved</span>}
                      </div>
                      <div className="tier-amount">
                        <span className="tier-number">{money(amount)}</span>
                        <span className="tier-unit">HZL</span>
                      </div>
                      <p className="tier-desc">Awarded after {count} verified genuine members join via your referral link.</p>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* TAB 4: BOOST CLAIMS */}
          {activeTab === 'boosts' && (
            <section className="rewards-section" id="boosts">
              <div className="services-head">
                <div>
                  <div className="section-label">Server Boosting</div>
                  <h2 className="services-title">Submit Server Boost Claims</h2>
                  <p className="services-sub">Boost the official HelzerX Discord server to earn substantial HZL grants. Claims are verified by our support team.</p>
                </div>
              </div>

              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: '36px', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="form-group">
                  <label htmlFor="boost-tier-select">Select Your Active Server Boost Tier</label>
                  <select 
                    id="boost-tier-select"
                    value={boostCount} 
                    onChange={e => setBoostCount(e.target.value)}
                  >
                    {(rewards?.boostTiers || defaultBoostTiers).map(([count, amount]) => (
                      <option key={count} value={count}>
                        {count} Server Boost{count > 1 ? 's' : ''} — {money(amount)} HZL Reward
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Submitting here registers a claim for verification by our support team. Ensure your boost remains active throughout the qualification timeframe.
                </div>

                <button 
                  className="btn-pill primary" 
                  onClick={submitBoostClaim} 
                  disabled={busy}
                  style={{ alignSelf: 'flex-start' }}
                >
                  <Zap size={13} /> Submit Boost Claim For Review
                </button>
              </div>

              <div className="section-label" style={{ marginTop: '16px' }}>Active Boost Rewards Schedule</div>
              <div className="tiers-grid">
                {(rewards?.boostTiers || defaultBoostTiers).map(([count, amount]) => (
                  <article className="tier-card" key={count} onMouseMove={handleCardMouseMove} onMouseLeave={handleCardMouseLeave}>
                    <div className="tier-header">
                      <span className="tier-badge">{count} BOOST{count > 1 ? 'S' : ''}</span>
                    </div>
                    <div className="tier-amount">
                      <span className="tier-number">{money(amount)}</span>
                      <span className="tier-unit">HZL</span>
                    </div>
                    <p className="tier-desc">Awarded when maintaining {count} active server boost{count > 1 ? 's' : ''} on the official Discord server.</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* TAB 5: ACCOUNT & SECURITY CENTER */}
          {activeTab === 'security' && (
            <SecurityCenter
              me={me}
              securityInfo={securityInfo}
              onRefreshSecurity={loadSecurityInfo}
              onToast={setToast}
              onSignedOut={() => {
                setMe(null);
                setRewards(null);
                setSecurityInfo(null);
              }}
            />
          )}
        </main>
      ) : (
        /* ================= PUBLIC LANDING EXPERIENCE ================= */
        <main className="page-content">
          {/* HERO SECTION */}
          <section className="hero-section" id="hero">
            <div className="hero-main-grid">
              <div className="hero-text-block">
                <div className="hero-kicker">
                  <ShieldCheck size={14} color="var(--accent-gold)" /> HelzerX Cloud Production Agency
                </div>
                <h1 className="hero-title">
                  THE COMMUNITY<br />
                  <span className="accent-text">CLOUD HOSTING</span><br />
                  ARCHITECTURE
                </h1>
                <p className="hero-description">
                  Enterprise Minecraft servers and isolated Proxmox Linux containers. High-frequency compute, NVMe flash arrays, and verified community rewards with zero out-of-pocket costs.
                </p>
                <div className="hero-cta-group">
                  <button 
                    className="btn-pill primary" 
                    onClick={() => openAuthModal('signup')}
                  >
                    Get Started <ArrowRight size={13} />
                  </button>
                  <button 
                    className="btn-pill secondary" 
                    onClick={() => openAuthModal('login')}
                  >
                    Log In
                  </button>
                  <a className="btn-pill secondary" href="#services">
                    Explore Services
                  </a>
                  {me && (
                    <button className="btn-pill secondary" onClick={() => setViewPublicMode(false)}>
                      Back to Console
                    </button>
                  )}
                </div>
              </div>

              {/* Clean, borderless HX logo visual */}
              <div className="hero-visual-frame">
                <div className="hero-image-wrap hx-hero-image-wrap">
                  <ThreeHeroCanvas />
                </div>
              </div>
            </div>
          </section>

          {/* ABOUT SECTION (Matching the reference image layout) */}
          <section className="about-section" id="about">
            <div className="section-label">ABOUT</div>
            <div className="about-grid">
              <div className="about-narrative">
                <p>
                  HelzerX is a community-supported cloud hosting platform dedicated to empowering developers, gaming communities, and server operators. We combine enterprise-grade Proxmox bare-metal virtualization with an attribution-verified rewards ledger.
                </p>
                <p>
                  Whether you are launching a high-concurrency Minecraft network or provisioning private Linux containers for automated workloads, our infrastructure delivers true isolated resources without financial barriers.
                </p>
              </div>

              <div className="about-metrics-wrap">
                <div className="about-metrics">
                  <div className="metric-item">
                    <span className="metric-val">99.9%</span>
                    <span className="metric-label">Uptime SLA</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-val">42+</span>
                    <span className="metric-label">Reward Tiers</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-val">0$</span>
                    <span className="metric-label">Out of Pocket</span>
                  </div>
                </div>
                {/* Floating 3D Accessory Torus Visual (Matching image) */}
                <div className="about-accessory-visual">
                  <img 
                    src="/images/accessory-torus.jpg" 
                    alt="3D dark metallic iridescent torus ring" 
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* OUR SERVICES BENTO GRID */}
          <section className="services-section" id="services">
            <div className="services-head">
              <div>
                <h2 className="services-title">OUR SERVICES</h2>
                <p className="services-sub">
                  Explore our array of hosting solutions, bare-metal game servers, and attribution rewards engineered to elevate your online presence.
                </p>
              </div>
              <button 
                className="btn-pill secondary" 
                onClick={() => openAuthModal('signup')}
              >
                Sign Up Now <ArrowRight size={13} />
              </button>
            </div>

            <div className="bento-grid">
              {/* Card 01 */}
              <article className="bento-card" onMouseMove={handleCardMouseMove} onMouseLeave={handleCardMouseLeave}>
                <div className="bento-card-bg" aria-hidden="true">
                  <img src={serviceMinecraftBg} alt="Minecraft Cloud Hosting background" referrerPolicy="no-referrer" />
                </div>
                <div className="bento-content">
                  <h3>MINECRAFT CLOUD HOSTING</h3>
                  <p>High-clock Ryzen and EPYC cores with allocated RAM quotas, NVMe storage arrays, and low-latency BGP routing for Paper, Purpur, and Fabric worlds.</p>
                </div>
              </article>

              {/* Card 02 */}
              <article className="bento-card" onMouseMove={handleCardMouseMove} onMouseLeave={handleCardMouseLeave}>
                <div className="bento-card-bg" aria-hidden="true">
                  <img src={serviceLxcBg} alt="Proxmox Linux Containers background" referrerPolicy="no-referrer" />
                </div>
                <div className="bento-content">
                  <h3>PROXMOX LINUX CONTAINERS (LXC)</h3>
                  <p>Production-ready isolated Linux containers with dedicated CPU thresholds, memory allocations, and SSH public key authentication for zero-credential vulnerability.</p>
                </div>
              </article>

              {/* Card 03 */}
              <article className="bento-card" onMouseMove={handleCardMouseMove} onMouseLeave={handleCardMouseLeave}>
                <div className="bento-card-bg" aria-hidden="true">
                  <img src={serviceLedgerBg} alt="Verified HZL Reward Ledger background" referrerPolicy="no-referrer" />
                </div>
                <div className="bento-content">
                  <h3>VERIFIED HZL REWARD LEDGER</h3>
                  <p>Transparent community rewards. Earn non-cash HZL credit by inviting genuine members and boosting the Discord server, verified by our support team.</p>
                </div>
              </article>

              {/* Card 04 */}
              <article className="bento-card" onMouseMove={handleCardMouseMove} onMouseLeave={handleCardMouseLeave}>
                <div className="bento-card-bg" aria-hidden="true">
                  <img src={serviceInfraBg} alt="Enterprise Infrastructure background" referrerPolicy="no-referrer" />
                </div>
                <div className="bento-content">
                  <h3>ENTERPRISE INFRASTRUCTURE</h3>
                  <p>Tier 3 datacenter presence with redundant power feeds, automated Proxmox virtualization clustering, and proactive DDoS edge filtering.</p>
                </div>
              </article>
            </div>
          </section>

          {/* SPECIAL OFFER SECTION */}
          <section className="special-offer-section" id="rewards" onMouseMove={handleCardMouseMove} onMouseLeave={handleCardMouseLeave}>
            <div className="section-label">COMMUNITY PRIVILEGES</div>
            <h2 className="special-offer-title">
              SPECIAL ACCESS FOR<br />COMMUNITY SUPPORTERS
            </h2>
            <p className="special-offer-desc">
              Boost the official HelzerX Discord server or refer fellow builders to unlock verified HZL credits. Redeem for persistent compute without monthly invoices.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="btn-pill primary" 
                onClick={() => openAuthModal('signup')}
              >
                Sign Up Now <ArrowRight size={13} />
              </button>
              <button 
                className="btn-pill secondary" 
                onClick={() => openAuthModal('login')}
              >
                Log In
              </button>
            </div>
          </section>

          {/* INFRASTRUCTURE SPOTLIGHT SECTION */}
          <section className="services-section" id="infrastructure">
            <div className="services-head">
              <div>
                <div className="section-label">HARDWARE ARCHITECTURE</div>
                <h2 className="services-title">BUILT ON REAL HARDWARE</h2>
                <p className="services-sub">
                  No virtualized overselling. We deploy real nodes with high thermal headroom, ECC memory, and persistent SSD/NVMe volume protection.
                </p>
              </div>
            </div>

            <div className="infra-showcase-grid">
              <div className="infra-photo-frame" onMouseMove={handleCardMouseMove} onMouseLeave={handleCardMouseLeave}>
                <img
                  src="/images/datacenter.jpg"
                  alt="HelzerX datacenter racks with optical indicators"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="infra-cards-col">
                <div className="hardware-card" onMouseMove={handleCardMouseMove} onMouseLeave={handleCardMouseLeave}>
                  <div className="hardware-card-head">
                    <HardDrive size={16} color="var(--accent-gold)" />
                    <b>NVMe Flash Storage</b>
                  </div>
                  <p>High IOPS random access for Minecraft world saves and Linux container databases without disk bottlenecks.</p>
                </div>

                <div className="hardware-card" onMouseMove={handleCardMouseMove} onMouseLeave={handleCardMouseLeave}>
                  <div className="hardware-card-head">
                    <Cpu size={16} color="var(--accent-gold)" />
                    <b>Proxmox VE Virtualization</b>
                  </div>
                  <p>Kernel-level LXC isolation with zero virtualization hypervisor overhead for near-native compute speeds.</p>
                </div>

                <div className="hardware-card" onMouseMove={handleCardMouseMove} onMouseLeave={handleCardMouseLeave}>
                  <div className="hardware-card-head">
                    <Shield size={16} color="var(--accent-gold)" />
                    <b>SSH Key Access Only</b>
                  </div>
                  <p>Strict asymmetric cryptography. Passwords are never sent across the wire or stored on disk.</p>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* ================= SPLIT AUTH CARD MODAL (Gmail + Google + Discord + 2FA) ================= */}
      {authModalOpen && (() => {
        const pwdEval = evaluatePasswordStrength(authPassword);
        return (
          <div className="auth-overlay" onClick={() => setAuthModalOpen(false)}>
            <div className="auth-container" onClick={e => e.stopPropagation()}>
              {/* Left side: Purple Aurora Blur with Security Stepper */}
              <div className="auth-left">
                <div>
                  <div className="auth-left-brand">
                    <span className="auth-brand-dot" /> HelzerX
                  </div>

                  <div className="auth-left-hero">
                    <h2 className="auth-left-title">
                      {authStep === '2fa' ? 'Verify Your Identity' : (authMode === 'signup' ? 'Create Your Cloud Account' : 'Secured Cloud Access')}
                    </h2>
                    <p className="auth-left-sub">
                      {authStep === '2fa'
                        ? 'Two-factor authentication protects your VPS containers, Minecraft worlds, and HZL ledger.'
                        : 'Sign up or log in with Gmail, Google OAuth, or Discord — protected by scrypt hashing, rate-limit defense, and TOTP 2FA.'}
                    </p>
                  </div>
                </div>

                <div className="auth-steps-list">
                  <div className={`auth-step-pill ${authStep === 'form' ? 'active' : 'inactive'}`}>
                    <span className="auth-step-num">1</span>
                    <span>{authMode === 'signup' ? 'Gmail / OAuth Registration' : 'Verify Account Credentials'}</span>
                  </div>
                  <div className={`auth-step-pill ${authStep === '2fa' ? 'active' : 'inactive'}`}>
                    <span className="auth-step-num">2</span>
                    <span>2FA & Session Encryption</span>
                  </div>
                  <div className="auth-step-pill inactive">
                    <span className="auth-step-num">3</span>
                    <span>Launch VPS & Minecraft Nodes</span>
                  </div>
                </div>
              </div>

              {/* Right side: Form, OAuth & 2FA Challenge */}
              <div className="auth-right">
                <button className="auth-close-btn" onClick={() => setAuthModalOpen(false)} aria-label="Close modal">
                  <X size={16} />
                </button>

                {authStep === '2fa' ? (
                  <>
                    <div className="auth-right-head">
                      <h2 className="auth-right-title">Two-Factor Verification</h2>
                      <p className="auth-right-sub">
                        Enter the 6-digit code from your authenticator app {authEmailHint ? `for ${authEmailHint}` : ''} or use an 8-character backup recovery code.
                      </p>
                    </div>

                    {authError && (
                      <div className="auth-alert error">
                        <ShieldAlert size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                        <span>{authError}</span>
                      </div>
                    )}

                    {authInfo && (
                      <div className="auth-alert info">
                        <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                        <span>{authInfo}</span>
                      </div>
                    )}

                    <form className="auth-form" onSubmit={handle2faVerifySubmit}>
                      <div className="auth-input-group">
                        <label htmlFor="auth-2fa-code">Authenticator or Backup Code</label>
                        <input
                          id="auth-2fa-code"
                          type="text"
                          className="auth-otp-input"
                          value={authTwoFactorCode}
                          onChange={e => setAuthTwoFactorCode(e.target.value.toUpperCase().slice(0, 10))}
                          placeholder="000000"
                          autoFocus
                          required
                        />
                        <span className="auth-input-hint">Supports 6-digit TOTP codes or XXXX-XXXX backup recovery codes.</span>
                      </div>

                      <button type="submit" className="auth-submit-btn" disabled={busy}>
                        {busy ? 'Verifying...' : 'Verify & Access Console'} <ShieldCheck size={15} />
                      </button>

                      <button
                        type="button"
                        className="btn-pill secondary sm"
                        style={{ alignSelf: 'center', marginTop: '4px' }}
                        onClick={() => { setAuthStep('form'); setAuthError(''); setAuthInfo(''); }}
                      >
                        Back to Login
                      </button>
                    </form>

                    <div className="auth-bottom-text">
                      Protected by replay-safe TOTP & session rotation
                    </div>
                  </>
                ) : (
                  <>
                    <div className="auth-right-head">
                      <h2 className="auth-right-title">
                        {authMode === 'signup' ? 'Create Account' : 'Welcome Back'}
                      </h2>
                      <p className="auth-right-sub">
                        {authMode === 'signup'
                          ? 'Register with your Gmail address or connect via Google / Discord.'
                          : 'Sign in with your Gmail/Email password, Google, or Discord.'}
                      </p>
                    </div>

                    {/* Social Login Options (Google Gmail + Discord) */}
                    <div className="auth-social-row">
                      <button
                        type="button"
                        className="auth-social-btn"
                        onClick={handleGoogleAuth}
                        title={authProviders.googleConfigured ? 'Continue with Google OAuth' : 'Continue with Google'}
                      >
                        <GoogleIcon size={17} />
                        <span>Google</span>
                      </button>
                      <button
                        type="button"
                        className="auth-social-btn"
                        onClick={handleDiscordAuth}
                        title="Connect via official Discord OAuth2"
                      >
                        <DiscordIcon size={17} />
                        <span>Discord</span>
                      </button>
                    </div>

                    <div className="auth-divider">Or with Gmail / Email</div>

                    {authError && (
                      <div className="auth-alert error">
                        <ShieldAlert size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                        <span>{authError}</span>
                      </div>
                    )}

                    {authInfo && (
                      <div className="auth-alert info">
                        <Mail size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                        <span>{authInfo}</span>
                      </div>
                    )}

                    <form className="auth-form" onSubmit={handleAuthSubmit}>
                      {authMode === 'signup' && (
                        <div className="auth-form-row">
                          <div className="auth-input-group">
                            <label htmlFor="auth-fn">First Name</label>
                            <input
                              id="auth-fn"
                              type="text"
                              value={authFirstName}
                              onChange={e => setAuthFirstName(e.target.value)}
                              placeholder="eg. Kavindu"
                              required
                            />
                          </div>
                          <div className="auth-input-group">
                            <label htmlFor="auth-ln">Last Name</label>
                            <input
                              id="auth-ln"
                              type="text"
                              value={authLastName}
                              onChange={e => setAuthLastName(e.target.value)}
                              placeholder="eg. Perera"
                            />
                          </div>
                        </div>
                      )}

                      <div className="auth-input-group">
                        <label htmlFor="auth-email">Gmail / Email Address</label>
                        <input
                          id="auth-email"
                          type="email"
                          autoComplete="email"
                          value={authEmail}
                          onChange={e => setAuthEmail(e.target.value)}
                          placeholder="eg. yourname@gmail.com"
                          required
                        />
                      </div>

                      <div className="auth-input-group">
                        <label htmlFor="auth-pwd">Password</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input
                            id="auth-pwd"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                            value={authPassword}
                            onChange={e => setAuthPassword(e.target.value)}
                            placeholder={authMode === 'signup' ? 'Create a strong password (10+ chars)' : 'Enter your password'}
                            required
                            style={{ width: '100%', paddingRight: '40px' }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>

                        {authMode === 'signup' ? (
                          <div className="pwd-strength-wrap">
                            <div className="pwd-strength-header">
                              <span>Security strength</span>
                              <strong style={{ color: pwdEval.score >= 3 ? '#86efac' : pwdEval.score >= 2 ? '#fcd34d' : 'var(--text-muted)' }}>
                                {pwdEval.label}
                              </strong>
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
                        ) : (
                          <span className="auth-input-hint">Protected by scrypt hashing & rate-limit lockout.</span>
                        )}
                      </div>

                      {authMode === 'signup' && (
                        <div className="auth-form-row">
                          <div className="auth-input-group">
                            <label htmlFor="auth-pwd-confirm">Confirm Password</label>
                            <input
                              id="auth-pwd-confirm"
                              type={showPassword ? 'text' : 'password'}
                              autoComplete="new-password"
                              value={authConfirmPassword}
                              onChange={e => setAuthConfirmPassword(e.target.value)}
                              placeholder="Re-enter password"
                              required
                            />
                          </div>
                          <div className="auth-input-group">
                            <label htmlFor="auth-ref">Referral Code (Optional)</label>
                            <input
                              id="auth-ref"
                              type="text"
                              value={authReferral}
                              onChange={e => setAuthReferral(e.target.value)}
                              placeholder="Referrer user ID"
                            />
                          </div>
                        </div>
                      )}

                      <button type="submit" className="auth-submit-btn" disabled={busy}>
                        {busy ? 'Securing Session...' : (authMode === 'signup' ? 'Create Secured Account' : 'Log In Securely')}
                      </button>
                    </form>

                    <div className="auth-bottom-text">
                      {authMode === 'signup' ? (
                        <>
                          Already have an account?
                          <button type="button" onClick={() => openAuthModal('login')}>
                            Log In
                          </button>
                        </>
                      ) : (
                        <>
                          Don't have an account?
                          <button type="button" onClick={() => openAuthModal('signup')}>
                            Sign Up with Gmail
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <VpsDeployModal plan={vpsModalPlan} nodes={vpsDeploymentOptions.nodes} osOptions={vpsDeploymentOptions.osOptions} balance={rewards?.balance || 0} busy={busy} onClose={() => setVpsModalPlan(null)} onLoadTemplates={loadVpsTemplates} onDeploy={config => executeHostingRequest(vpsModalPlan, config)} />
      <MinecraftDeployModal plan={mcModalPlan} eggs={mcEggs} nodes={mcNodes} balance={rewards?.balance || 0} busy={busy} onClose={() => setMcModalPlan(null)} onDeploy={config => executeHostingRequest(mcModalPlan, config)} />

      {/* One-time credentials for a newly provisioned LXC */}
      {(generatedPrivateKey || generatedRootPassword) && (
        <div className="modal-overlay" onClick={() => { setGeneratedPrivateKey(''); setGeneratedRootPassword(''); }}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Your VPS Credentials</h3>
              <button className="modal-close" onClick={() => { setGeneratedPrivateKey(''); setGeneratedRootPassword(''); }} aria-label="Close credentials modal"><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>Your VPS was created. Save these credentials now; the password and generated SSH private key are shown only once and are not stored in request history.</p>
            {generatedRootPassword && <div style={{ marginBottom: '14px' }}><label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#fff' }}>Root password</label><input type="text" readOnly value={generatedRootPassword} onFocus={e => e.target.select()} style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '13px' }} /><div className="modal-actions"><button className="btn-pill secondary sm" onClick={() => navigator.clipboard.writeText(generatedRootPassword).then(() => setToast('Root password copied. Save it securely.')).catch(() => setToast('Select and copy the root password manually.'))}>Copy Password</button></div></div>}
            {generatedPrivateKey && <><label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#fff' }}>SSH private key</label><textarea rows={7} readOnly value={generatedPrivateKey} onFocus={e => e.target.select()} style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: '11px', resize: 'vertical' }} aria-label="Generated SSH private key" /><div className="modal-actions"><button className="btn-pill secondary sm" onClick={() => navigator.clipboard.writeText(generatedPrivateKey).then(() => setToast('SSH private key copied. Save it securely.')).catch(() => setToast('Select and copy the SSH private key manually.'))}>Copy Private Key</button></div></>}
            <div className="modal-actions"><button className="btn-pill primary sm" onClick={() => { setGeneratedPrivateKey(''); setGeneratedRootPassword(''); }}>I Saved My Credentials</button></div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div className="toast-notice" role="status">
          <span>{toast}</span>
          <button className="toast-close" onClick={() => setToast('')} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Minimalist Site Footer */}
      <footer className="site-footer">
        <div className="footer-top">
          <Brand />
          <div className="footer-links">
            <a href="#about">About</a>
            <a href="#services">Services</a>
            <a href="#infrastructure">Infrastructure</a>
            <a href="#rewards">Rewards</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 HelzerX Cloud · Verified community cloud infrastructure.</span>
          <span>HZL is an internal reward credit for eligible hosting redemptions with no cash value.</span>
        </div>
        <div className="footer-giant-wordmark" aria-hidden="true">
          <img
            src="/assets/aistudio/IMG_20261101_210414-removebg-preview_ec8dc394.png"
            alt="HelzerX"
            referrerPolicy="no-referrer"
          />
        </div>
      </footer>
    </div>
  );
}
