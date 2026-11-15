import React, { useState, useEffect } from 'react';
import {
  Box,
  Server,
  X,
  ChevronDown,
  Sparkles,
  CreditCard,
  Tag,
  Wallet,
  Mail,
  ExternalLink,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import mcBackdropImg from '../assets/images/minecraft_deploy_bg_1794706744000.jpg';
import './MinecraftDeployModal.css';

const money = n => new Intl.NumberFormat('en-US').format(Number(n) || 0);
const usd = cents => '$' + (Number(cents || 0) / 100).toFixed(2);
const lkr = (cents, rate = 300) => 'Rs. ' + money(Math.round((Number(cents || 0) / 100) * Number(rate || 300)));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPlanCycleCents(plan, cycle) {
  const baseHzl = Math.max(100, Number(plan?.cost || 500));
  const rawMonthly = Math.max(199, Math.round((baseHzl / 500) * 299));
  const fallbackMonthly = Math.floor(rawMonthly / 100) * 100 + 99;
  const pp = plan?.paidPricing || {};
  const m = Number(pp.monthlyCents) > 0 ? Number(pp.monthlyCents) : fallbackMonthly;
  const q = Number(pp.quarterlyCents) > 0 ? Number(pp.quarterlyCents) : Math.round(m * 3 * 0.9);
  const y = Number(pp.yearlyCents) > 0 ? Number(pp.yearlyCents) : Math.round(m * 12 * 0.8);
  if (cycle === 'quarterly') return q;
  if (cycle === 'yearly') return y;
  return m;
}

export default function MinecraftDeployModal({
  plan,
  eggs = [],
  nodes = [],
  me = null,
  panelUrl = 'https://spg.helzerx.cyou',
  balance = 0,
  walletCents = 0,
  usdToLkrRate = 300,
  checkoutType: initialCheckoutType = 'hzl',
  initialCycle = 'monthly',
  busy,
  onClose,
  onDeploy,
  onValidatePromo,
  onOpenBilling
}) {
  const linkedEmail = String(me?.email || '').trim().toLowerCase();
  const providers = Array.isArray(me?.authProviders) ? me.authProviders : [];
  const hasLinkedSocial = Boolean(
    me?.discordLinked || providers.some(p => p === 'discord' || p === 'google')
  );
  const canAutoMatch = Boolean(linkedEmail && EMAIL_RE.test(linkedEmail) && hasLinkedSocial);
  const normalizedPanelUrl = String(panelUrl || 'https://spg.helzerx.cyou').replace(/\/+$/, '');

  const [name, setName] = useState('');
  const [eggId, setEggId] = useState(eggs[0]?.id || '');
  const [nodeId, setNodeId] = useState(nodes[0]?.id || '');
  const [useLinkedAccount, setUseLinkedAccount] = useState(canAutoMatch);
  const [panelEmail, setPanelEmail] = useState(linkedEmail);

  // Paid billing state
  const [checkoutType, setCheckoutType] = useState(initialCheckoutType);
  const [billingCycle, setBillingCycle] = useState(initialCycle);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoMsg, setPromoMsg] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [useHzlCredit, setUseHzlCredit] = useState(false);
  const [autoRenew, setAutoRenew] = useState(true);

  useEffect(() => {
    if (!plan) return;
    setName('');
    setEggId(eggs[0]?.id || '');
    setNodeId(nodes[0]?.id || '');
    setUseLinkedAccount(canAutoMatch);
    setPanelEmail(linkedEmail);
    const effectiveMode = plan.billingMode === 'paid'
      ? 'paid'
      : plan.billingMode === 'hzl'
      ? 'hzl'
      : (initialCheckoutType === 'paid' ? 'paid' : 'hzl');
    setCheckoutType(effectiveMode);
    setBillingCycle(initialCycle || 'monthly');
    setPromoInput('');
    setAppliedPromo(null);
    setPromoMsg('');
    setUseHzlCredit(false);
    setAutoRenew(true);
  }, [plan?.id, initialCheckoutType, initialCycle, linkedEmail, canAutoMatch]);

  useEffect(() => {
    setAppliedPromo(null);
    setPromoMsg('');
  }, [billingCycle]);

  if (!plan) return null;

  const isPaid = checkoutType === 'paid' && plan.billingMode !== 'hzl';
  const cost = Number(plan.cost || 0);
  const subtotalCents = getPlanCycleCents(plan, billingCycle);
  const promoDiscountCents = appliedPromo ? Math.min(subtotalCents, Number(appliedPromo.discountCents || 0)) : 0;
  const afterPromoCents = Math.max(0, subtotalCents - promoDiscountCents);
  const maxHzlDiscount = Math.min(Math.floor(afterPromoCents * 0.5), Math.floor(Math.max(0, Number(balance || 0)) / 10));
  const hzlDiscountCents = useHzlCredit ? maxHzlDiscount : 0;
  const hzlUsed = hzlDiscountCents * 10;
  const finalTotalCents = Math.max(0, afterPromoCents - hzlDiscountCents);

  const effectivePanelEmail = (useLinkedAccount && canAutoMatch ? linkedEmail : panelEmail).trim().toLowerCase();
  const validPanelEmail = EMAIL_RE.test(effectivePanelEmail);
  const canAfford = isPaid ? Number(walletCents) >= finalTotalCents : Number(balance) >= cost;
  const validName = /^[a-z0-9](?:[a-z0-9_-]{0,28}[a-z0-9])?$/i.test(name) && name.length >= 2;
  const hasCatalog = Boolean(eggId && nodeId && eggs.some(e => e.id === eggId) && nodes.some(n => n.id === nodeId));
  const canSubmit = validName && validPanelEmail && hasCatalog && canAfford && !busy;

  const currentEgg = eggs.find(e => e.id === eggId) || null;
  const currentNode = nodes.find(n => n.id === nodeId) || null;

  const memoryMb = plan.pterodactyl?.memory || 2048;
  const cores = plan.pterodactyl?.cores || 1;
  const diskGb = plan.pterodactyl?.disk || 10;

  async function handleApplyPromo() {
    const clean = promoInput.trim().toUpperCase();
    if (!clean) {
      setAppliedPromo(null);
      setPromoMsg('');
      return;
    }
    if (typeof onValidatePromo !== 'function') return;
    setPromoLoading(true);
    setPromoMsg('');
    try {
      const res = await onValidatePromo({ code: clean, subtotalCents, service: 'minecraft' });
      if (res?.valid) {
        setAppliedPromo({ code: res.promo?.code || clean, discountCents: res.discountCents });
        setPromoMsg(`Promo ${res.promo?.code || clean} applied (-${usd(res.discountCents)})`);
      } else {
        setAppliedPromo(null);
        setPromoMsg(res?.error || 'Invalid promo code.');
      }
    } catch (err) {
      setAppliedPromo(null);
      setPromoMsg(err?.message || 'Promo validation failed.');
    } finally {
      setPromoLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    if (isPaid) {
      onDeploy({
        checkoutType: 'paid',
        displayName: name,
        eggId,
        nodeId,
        panelEmail: effectivePanelEmail,
        billingCycle,
        promoCode: appliedPromo?.code || '',
        useHzlCredit,
        autoRenew
      });
    } else {
      onDeploy({
        checkoutType: 'hzl',
        displayName: name,
        eggId,
        nodeId,
        panelEmail: effectivePanelEmail
      });
    }
  }

  return (
    <div
      className="mc-modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="mc-deploy-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mc-modal-title"
      >
        <div className="mc-modal-ambient" />
        <header className="mc-modal-header">
          <div className="mc-modal-kicker">
            PTERODACTYL ENGINE <span style={{ opacity: 0.4 }}>/</span> {isPaid ? 'PAID MINECRAFT HOSTING' : 'MINECRAFT CLOUD'}
          </div>
          <button
            className="mc-modal-close"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X size={18} />
          </button>
          <h2 id="mc-modal-title">
            Deploy <span>Minecraft Server.</span>
          </h2>
          <p>
            {isPaid
              ? 'Isolated Pterodactyl container orchestration with dedicated NVMe storage, automatic port allocation, and instant wallet billing.'
              : 'Isolated Pterodactyl container orchestration powered by your verified HZL rewards balance.'}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mc-modal-layout">
          <div className="mc-config-fields">
            {/* Panel Account Pre-Requirement & Auto-Match Steps */}
            <div className="mc-panel-steps">
              <div className="mc-panel-steps-head">
                <div className="mc-panel-steps-title">
                  <ShieldCheck size={15} />
                  <span>Panel Account Linking Required</span>
                </div>
                <a
                  href={normalizedPanelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mc-panel-open-link"
                >
                  Open spg.helzerx.cyou <ExternalLink size={12} />
                </a>
              </div>

              <ol className="mc-step-list">
                <li>
                  <span>Register or sign in at </span>
                  <a href={normalizedPanelUrl} target="_blank" rel="noopener noreferrer">
                    {normalizedPanelUrl}
                  </a>
                  <span> before creating your server.</span>
                </li>
                <li>
                  <span>Enter that exact registered panel email below — your server is assigned directly to that account.</span>
                </li>
                <li>
                  <strong>Linked with Discord or Google?</strong>{' '}
                  <span>
                    If you signed into <code>spg.helzerx.cyou</code> using the same Discord or Google account linked here, you do not need to re-register — your server attaches automatically.
                  </span>
                </li>
              </ol>

              {canAutoMatch && (
                <label className="mc-automatch-toggle">
                  <input
                    type="checkbox"
                    checked={useLinkedAccount}
                    onChange={e => {
                      const next = e.target.checked;
                      setUseLinkedAccount(next);
                      if (next) setPanelEmail(linkedEmail);
                    }}
                  />
                  <div>
                    <strong>Auto-assign via linked {me?.discordLinked ? 'Discord' : 'Google'} account</strong>
                    <small>{linkedEmail} · No extra registration needed if matched on SPG panel</small>
                  </div>
                  <CheckCircle2 size={15} className={useLinkedAccount ? 'mc-check-active' : 'mc-check-muted'} />
                </label>
              )}

              <label className="mc-field" style={{ marginTop: '4px' }}>
                <span>
                  <Mail size={13} /> REGISTERED PANEL EMAIL (SPG.HELZERX.CYOU)
                </span>
                <input
                  type="email"
                  value={useLinkedAccount && canAutoMatch ? linkedEmail : panelEmail}
                  onChange={e => {
                    if (useLinkedAccount) setUseLinkedAccount(false);
                    setPanelEmail(e.target.value);
                  }}
                  readOnly={useLinkedAccount && canAutoMatch}
                  placeholder="player@gmail.com"
                  autoComplete="email"
                  required
                />
                <small className={effectivePanelEmail && !validPanelEmail ? 'mc-field-error' : 'mc-field-hint'}>
                  {effectivePanelEmail && !validPanelEmail
                    ? 'Enter a valid email address registered at https://spg.helzerx.cyou.'
                    : useLinkedAccount && canAutoMatch
                    ? `Matched automatically with your linked account (${linkedEmail}). Uncheck above to use another panel email.`
                    : 'Your Minecraft instance will be assigned to this panel account email.'}
                </small>
              </label>
            </div>

            {plan.billingMode === 'both' && (
              <div className="mc-field">
                <span><CreditCard size={13} /> PAYMENT MODE</span>
                <div className="mc-mode-switch">
                  <button type="button" className={!isPaid ? 'selected' : ''} onClick={() => setCheckoutType('hzl')}>
                    HZL Credit ({money(cost)} HZL)
                  </button>
                  <button type="button" className={isPaid ? 'selected' : ''} onClick={() => setCheckoutType('paid')}>
                    Paid Wallet ({usd(getPlanCycleCents(plan, billingCycle))})
                  </button>
                </div>
              </div>
            )}

            {isPaid && (
              <div className="mc-field">
                <span><CreditCard size={13} /> BILLING CYCLE</span>
                <div className="mc-cycle-pills">
                  {[
                    { id: 'monthly', label: 'Monthly' },
                    { id: 'quarterly', label: 'Quarterly (-10%)' },
                    { id: 'yearly', label: 'Yearly (-20%)' }
                  ].map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className={`mc-cycle-btn ${billingCycle === c.id ? 'selected' : ''}`}
                      onClick={() => setBillingCycle(c.id)}
                    >
                      <span>{c.label}</span>
                      <b>{usd(getPlanCycleCents(plan, c.id))}</b>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="mc-field">
              <span>
                SERVER DISPLAY NAME <small>2–26 characters</small>
              </span>
              <input
                value={name}
                onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 26))}
                placeholder="helzerx-smp"
                autoComplete="off"
                maxLength={26}
                required
              />
              <small className={name && !validName ? 'mc-field-error' : 'mc-field-hint'}>
                {name && !validName
                  ? 'Use 2–26 lowercase letters, numbers, or hyphens.'
                  : 'Your server identifier and in-game host label.'}
              </small>
            </label>

            <div className="mc-select-grid">
              <label className="mc-field">
                <span>
                  <Box size={13} /> SERVER SOFTWARE (EGG)
                </span>
                <div className="mc-select-wrap">
                  <select value={eggId} onChange={e => setEggId(e.target.value)} disabled={!eggs.length}>
                    {!eggs.length && <option value="">No eggs available</option>}
                    {eggs.map(egg => (
                      <option key={egg.id} value={egg.id}>
                        {egg.label || egg.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} />
                </div>
              </label>

              <label className="mc-field">
                <span>
                  <Server size={13} /> CLUSTER NODE
                </span>
                <div className="mc-select-wrap">
                  <select value={nodeId} onChange={e => setNodeId(e.target.value)} disabled={!nodes.length}>
                    {!nodes.length && <option value="">No nodes available</option>}
                    {nodes.map(node => (
                      <option key={node.id} value={node.id}>
                        {node.label || node.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} />
                </div>
              </label>
            </div>

            {isPaid && (
              <div className="mc-billing-extras">
                <div className="mc-promo-row">
                  <input
                    type="text"
                    value={promoInput}
                    onChange={e => setPromoInput(e.target.value.toUpperCase())}
                    placeholder="Promo code (optional)"
                    maxLength={24}
                  />
                  <button type="button" className="mc-promo-btn" onClick={handleApplyPromo} disabled={promoLoading}>
                    <Tag size={12} /> {promoLoading ? 'Checking…' : 'Apply'}
                  </button>
                </div>
                {promoMsg && <small className={appliedPromo ? 'mc-promo-ok' : 'mc-field-error'}>{promoMsg}</small>}

                {Number(balance) >= 100 && (
                  <label className="mc-checkbox-row">
                    <input type="checkbox" checked={useHzlCredit} onChange={e => setUseHzlCredit(e.target.checked)} />
                    <span>Apply HZL loyalty discount (1,000 HZL = $1.00, up to 50% off · saves {usd(maxHzlDiscount)})</span>
                  </label>
                )}

                <label className="mc-checkbox-row">
                  <input type="checkbox" checked={autoRenew} onChange={e => setAutoRenew(e.target.checked)} />
                  <span>Enable Auto-Renew from Wallet before expiration</span>
                </label>
              </div>
            )}
          </div>

          <aside className="mc-order-summary">
            {/* Smooth Scenic Minecraft Artwork Header (replaces 3D rotating cube) */}
            <div className="mc-visual-banner">
              <img
                src={mcBackdropImg}
                alt="Minecraft Cloud Infrastructure"
                className="mc-visual-bg"
                referrerPolicy="no-referrer"
              />
              <div className="mc-visual-scrim" />
              <div className="mc-visual-content">
                <span className="mc-visual-kicker">
                  {isPaid ? 'DEDICATED PRO NODE' : 'VERIFIED HZL CLOUD'}
                </span>
                <h4>Craft worlds without lag.</h4>
                <p>
                  Smooth Paper, Purpur &amp; Fabric runtimes with isolated NVMe storage and instant panel access.
                </p>
              </div>
            </div>

            <div className="mc-summary-body">
              <div className="mc-summary-label">DEPLOYMENT SUMMARY</div>
              <h3>{plan.name}</h3>
              <p className="mc-summary-desc">{plan.description}</p>

              <div className="mc-spec-list">
                <div className="mc-spec-item">
                  <span>Allocated Memory</span>
                  <b>{money(memoryMb)} MB RAM</b>
                </div>
                <div className="mc-spec-item">
                  <span>Compute vCPU</span>
                  <b>{cores} Dedicated Core{cores > 1 ? 's' : ''}</b>
                </div>
                <div className="mc-spec-item">
                  <span>NVMe Storage</span>
                  <b>{diskGb} GB SSD</b>
                </div>
                <div className="mc-spec-item">
                  <span>Software</span>
                  <b>{currentEgg ? (currentEgg.name || currentEgg.label) : '—'}</b>
                </div>
                <div className="mc-spec-item">
                  <span>Panel Account</span>
                  <b className="mc-spec-email">{validPanelEmail ? effectivePanelEmail : 'Required'}</b>
                </div>
                <div className="mc-spec-item">
                  <span>Target Node</span>
                  <b>{currentNode ? ((currentNode.name || currentNode.label)?.split('(')[0] || currentNode.name || currentNode.label) : '—'}</b>
                </div>
                {isPaid && promoDiscountCents > 0 && (
                  <div className="mc-spec-item" style={{ color: '#86efac' }}>
                    <span>Promo ({appliedPromo?.code})</span>
                    <b>-{usd(promoDiscountCents)}</b>
                  </div>
                )}
                {isPaid && hzlDiscountCents > 0 && (
                  <div className="mc-spec-item" style={{ color: '#fcd34d' }}>
                    <span>HZL Discount ({money(hzlUsed)} HZL)</span>
                    <b>-{usd(hzlDiscountCents)}</b>
                  </div>
                )}
              </div>

              {isPaid ? (
                <>
                  <div className="mc-cost-total">
                    <span>Total ({billingCycle})</span>
                    <b>{usd(finalTotalCents)} <small>({lkr(finalTotalCents, usdToLkrRate)})</small></b>
                  </div>
                  <div className="mc-balance-info">
                    <span>Wallet balance</span>
                    <strong style={{ color: canAfford ? '#34d399' : '#f87171' }}>
                      {usd(walletCents)}
                    </strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="mc-cost-total">
                    <span>Redemption Cost</span>
                    <b>{money(cost)} <small>HZL</small></b>
                  </div>
                  <div className="mc-balance-info">
                    <span>Your balance</span>
                    <strong style={{ color: canAfford ? '#34d399' : '#f87171' }}>
                      {money(balance)} HZL
                    </strong>
                  </div>
                </>
              )}

              {isPaid && !canAfford && typeof onOpenBilling === 'function' ? (
                <button
                  type="button"
                  className="mc-deploy-submit"
                  onClick={() => { onClose(); onOpenBilling(); }}
                >
                  <Wallet size={14} /> Top Up Wallet (+{usd(finalTotalCents - Number(walletCents || 0))} needed)
                </button>
              ) : (
                <button
                  type="submit"
                  className="mc-deploy-submit"
                  disabled={!canSubmit}
                >
                  {busy ? (
                    'Provisioning Server…'
                  ) : !canAfford ? (
                    isPaid ? 'Insufficient Wallet Balance' : 'Insufficient HZL Balance'
                  ) : !validPanelEmail ? (
                    'Enter Registered Panel Email'
                  ) : !validName ? (
                    'Enter Server Name'
                  ) : isPaid ? (
                    <>
                      <CreditCard size={14} /> Pay {usd(finalTotalCents)} &amp; Deploy
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} /> Deploy Minecraft Server
                    </>
                  )}
                </button>
              )}
            </div>
          </aside>
        </form>
      </section>
    </div>
  );
}
