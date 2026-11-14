import React, { useEffect, useState } from 'react';
import { Activity, Cpu, HardDrive, KeyRound, LockKeyhole, Server, ShieldCheck, X, ChevronDown, RefreshCw, Eye, EyeOff, CreditCard, Tag, Wallet } from 'lucide-react';
import './VpsDeployModal.css';

const money = n => new Intl.NumberFormat('en-US').format(Number(n) || 0);
const usd = cents => '$' + (Number(cents || 0) / 100).toFixed(2);
const lkr = (cents, rate = 300) => 'Rs. ' + money(Math.round((Number(cents || 0) / 100) * Number(rate || 300)));

function makePassword() {
  const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*-_'];
  const alphabet = groups.join('');
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const result = groups.map((group, index) => group[bytes[index] % group.length]);
  for (let i = result.length; i < 20; i++) result.push(alphabet[bytes[i] % alphabet.length]);
  for (let i = result.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.join('');
}

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

export default function VpsDeployModal({
  plan,
  nodes = [],
  osOptions = [],
  balance = 0,
  walletCents = 0,
  usdToLkrRate = 300,
  checkoutType: initialCheckoutType = 'hzl',
  initialCycle = 'monthly',
  busy,
  onClose,
  onDeploy,
  onLoadTemplates,
  onValidatePromo,
  onOpenBilling
}) {
  const [name, setName] = useState('');
  const [nodeId, setNodeId] = useState(nodes[0]?.id || '');
  const [osId, setOsId] = useState('');
  const [mode, setMode] = useState('auto');
  const [password, setPassword] = useState(makePassword());
  const [visible, setVisible] = useState(false);
  const [availableOs, setAvailableOs] = useState(osOptions);
  const [osLoading, setOsLoading] = useState(false);
  const [osError, setOsError] = useState('');
  const [templateRefresh, setTemplateRefresh] = useState(0);

  // Billing state
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
    setNodeId(nodes[0]?.id || '');
    setOsId('');
    setMode('auto');
    setPassword(makePassword());
    setVisible(false);
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
  }, [plan?.id, initialCheckoutType, initialCycle]);

  useEffect(() => {
    setAppliedPromo(null);
    setPromoMsg('');
  }, [billingCycle]);

  useEffect(() => {
    if (!plan || !nodeId || typeof onLoadTemplates !== 'function') return;
    let cancelled = false;
    setOsLoading(true);
    setOsError('');
    setAvailableOs([]);
    setOsId('');
    onLoadTemplates(nodeId).then(items => {
      if (cancelled) return;
      const next = Array.isArray(items) ? items : [];
      setAvailableOs(next);
      setOsId(next[0]?.id || '');
      if (!next.length) setOsError('No LXC templates were found on this node. Upload or download a template in Proxmox first.');
    }).catch(error => {
      if (cancelled) return;
      setAvailableOs([]);
      setOsError(error?.message || 'Could not load operating systems from Proxmox.');
    }).finally(() => {
      if (!cancelled) setOsLoading(false);
    });
    return () => { cancelled = true; };
  }, [nodeId, plan?.id, templateRefresh]);

  if (!plan) return null;
  const node = nodes.find(x => x.id === nodeId);
  const os = availableOs.find(x => x.id === osId);
  const hzlCost = Number(plan.cost || 0) + Number(node?.surcharge || 0) + Number(os?.surcharge || 0);
  const validName = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/.test(name) && name.length >= 2;
  const validPassword = mode === 'auto' || (password.length >= 10 && password.length <= 128);

  const isPaid = checkoutType === 'paid' && plan.billingMode !== 'hzl';
  const subtotalCents = getPlanCycleCents(plan, billingCycle);
  const promoDiscountCents = appliedPromo ? Math.min(subtotalCents, Number(appliedPromo.discountCents || 0)) : 0;
  const afterPromoCents = Math.max(0, subtotalCents - promoDiscountCents);
  const maxHzlDiscount = Math.min(Math.floor(afterPromoCents * 0.5), Math.floor(Math.max(0, Number(balance || 0)) / 10));
  const hzlDiscountCents = useHzlCredit ? maxHzlDiscount : 0;
  const hzlUsed = hzlDiscountCents * 10;
  const finalTotalCents = Math.max(0, afterPromoCents - hzlDiscountCents);

  const hasFunds = isPaid ? Number(walletCents) >= finalTotalCents : Number(balance) >= hzlCost;
  const canSubmit = Boolean(node && os && validName && validPassword && (isPaid ? subtotalCents > 0 : hzlCost > 0) && hasFunds && !busy && !osLoading);

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
      const res = await onValidatePromo({ code: clean, subtotalCents, service: plan.service || 'lxc' });
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

  return <div className="vps-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <section className="vps-deploy-modal" role="dialog" aria-modal="true" aria-labelledby="vps-modal-title">
      <div className="vps-modal-ambient" />
      <header className="vps-modal-header">
        <div className="vps-modal-kicker"><i className="vps-live-dot" /> HELZERX CLOUD <span className="vps-kicker-divider">/</span> {isPaid ? 'PAID HOSTING CHECKOUT' : 'SERVER CONFIGURATION'}</div>
        <button className="vps-modal-close" type="button" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
        <h2 id="vps-modal-title">Build your <span>server.</span></h2>
        <p>{isPaid ? 'Select billing cycle, optional promo code, and deploy directly from your HelzerX Cloud Wallet.' : 'Choose your configuration. We’ll handle the provisioning.'}</p>
      </header>
      <div className="vps-modal-layout">
        <div className="vps-config-fields">
          {plan.billingMode === 'both' && (
            <div className="vps-field">
              <span><CreditCard size={13} /> PAYMENT MODE</span>
              <div className="vps-password-modes">
                <button type="button" className={!isPaid ? 'selected' : ''} onClick={() => setCheckoutType('hzl')}>Community HZL ({money(plan.cost)} HZL)</button>
                <button type="button" className={isPaid ? 'selected' : ''} onClick={() => setCheckoutType('paid')}>Paid Wallet ({usd(getPlanCycleCents(plan, billingCycle))})</button>
              </div>
            </div>
          )}

          {isPaid && (
            <div className="vps-field">
              <span><CreditCard size={13} /> BILLING CYCLE</span>
              <div className="vps-cycle-pills">
                {[
                  { id: 'monthly', label: 'Monthly' },
                  { id: 'quarterly', label: 'Quarterly (-10%)' },
                  { id: 'yearly', label: 'Yearly (-20%)' }
                ].map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`vps-cycle-btn ${billingCycle === c.id ? 'selected' : ''}`}
                    onClick={() => setBillingCycle(c.id)}
                  >
                    <span>{c.label}</span>
                    <b>{usd(getPlanCycleCents(plan, c.id))}</b>
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="vps-field"><span>SERVER NAME <small>2–30 characters</small></span>
            <input value={name} onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0,30))} placeholder="my-first-vps" autoComplete="off" maxLength={30} />
            <small className={name && !validName ? 'vps-field-error' : 'vps-field-hint'}>{name && !validName ? 'Use 2–30 lowercase letters, numbers or hyphens.' : 'This will be your server hostname.'}</small>
          </label>
          <label className="vps-field"><span><Server size={13} /> PROXMOX NODE</span><div className="vps-select-wrap">
            <select value={nodeId} onChange={e => setNodeId(e.target.value)}>{nodes.map(n => <option key={n.id} value={n.id}>{n.label || n.id}</option>)}</select><ChevronDown size={15} /></div>
            {!nodes.length && <small className="vps-field-error">No nodes configured by the administrator.</small>}
          </label>
          <div className="vps-field"><span><HardDrive size={13} /> OPERATING SYSTEM <small>Live Proxmox templates</small></span><div className="vps-select-wrap">
            <select value={osId} onChange={e => setOsId(e.target.value)} disabled={osLoading || !availableOs.length}>
              {osLoading && <option value="">Reading Proxmox templates…</option>}
              {!osLoading && !availableOs.length && <option value="">No templates available</option>}
              {availableOs.map(o => <option key={o.id} value={o.id}>{o.label || o.id}{o.storage ? ' · ' + o.storage : ''}</option>)}
            </select><ChevronDown size={15} /></div>
            {osLoading && <small className="vps-field-hint"><RefreshCw size={11} className="vps-spin" /> Checking available templates on {node?.label || nodeId}…</small>}
            {!osLoading && osError && <div className="vps-os-error"><small className="vps-field-error">{osError}</small><button type="button" className="vps-inline-retry" onClick={() => setTemplateRefresh(v => v + 1)}><RefreshCw size={12} /> Retry</button></div>}
            {!osLoading && os && <small className="vps-field-hint">Template found in Proxmox storage: {os.storage || os.template}</small>}
          </div>
          <div className="vps-field"><span><KeyRound size={13} /> ROOT PASSWORD</span>
            <div className="vps-password-modes"><button type="button" className={mode === 'auto' ? 'selected' : ''} onClick={() => { setMode('auto'); setPassword(makePassword()); }}>Generate securely</button><button type="button" className={mode === 'custom' ? 'selected' : ''} onClick={() => setMode('custom')}>Set my own</button></div>
            <div className="vps-password-input"><input type={visible ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} readOnly={mode === 'auto'} autoComplete="new-password" placeholder="At least 10 characters" /><button type="button" onClick={() => setVisible(v => !v)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={15} /> : <Eye size={15} />}</button>{mode === 'auto' && <button type="button" onClick={() => setPassword(makePassword())} aria-label="Generate another password"><RefreshCw size={14} /></button>}</div>
            {mode === 'custom' && <small className={validPassword ? 'vps-field-hint' : 'vps-field-error'}>Use 10–128 characters.</small>}
            <small className="vps-field-hint"><LockKeyhole size={11} /> Shown once after creation. Not saved in request history.</small>
          </div>

          {isPaid && (
            <div className="vps-billing-extras">
              <div className="vps-promo-row">
                <input
                  type="text"
                  value={promoInput}
                  onChange={e => setPromoInput(e.target.value.toUpperCase())}
                  placeholder="Promo code (e.g. LAUNCH20)"
                  maxLength={24}
                />
                <button type="button" className="vps-inline-retry" onClick={handleApplyPromo} disabled={promoLoading}>
                  <Tag size={12} /> {promoLoading ? 'Checking…' : 'Apply'}
                </button>
              </div>
              {promoMsg && <small className={appliedPromo ? 'vps-promo-ok' : 'vps-field-error'}>{promoMsg}</small>}

              {Number(balance) >= 100 && (
                <label className="vps-checkbox-row">
                  <input type="checkbox" checked={useHzlCredit} onChange={e => setUseHzlCredit(e.target.checked)} />
                  <span>Apply HZL loyalty discount (1,000 HZL = $1.00, up to 50% off · saves {usd(maxHzlDiscount)})</span>
                </label>
              )}

              <label className="vps-checkbox-row">
                <input type="checkbox" checked={autoRenew} onChange={e => setAutoRenew(e.target.checked)} />
                <span>Enable Auto-Renew from Wallet before expiration</span>
              </label>
            </div>
          )}
        </div>

        <aside className="vps-order-summary">
          <div className="vps-3d-server" aria-hidden="true">
            <div className="vps-server-shadow" />
            <div className="vps-server-rack">
              <div className="vps-rack-side" />
              <div className="vps-rack-top" />
              <div className="vps-rack-front">
                <div className="vps-rack-brand"><span>HX</span><i /></div>
                <div className="vps-rack-bay"><b /><span /><span /><i /><i /><i /><i /><i /><i /></div>
                <div className="vps-rack-bay"><b /><span /><span /><i /><i /><i /><i /><i /><i /></div>
                <div className="vps-rack-bay"><b /><span /><span /><i /><i /><i /><i /><i /><i /></div>
                <div className="vps-rack-bay"><b /><span /><span /><i /><i /><i /><i /><i /><i /></div>
                <div className="vps-rack-lower"><i /><i /><i /><span>HELZERX SYSTEMS</span></div>
              </div>
              <div className="vps-rack-foot foot-left" /><div className="vps-rack-foot foot-right" />
            </div>
            <div className="vps-server-orbit orbit-one" /><div className="vps-server-orbit orbit-two" />
          </div>
          <div className="vps-summary-label">YOUR CONFIGURATION</div><h3>{plan.name}</h3><p className="vps-summary-description">{plan.description || 'Linux virtual server'}</p>
          <div className="vps-spec-row"><Cpu size={14} /><span>CPU</span><b>{plan.proxmox?.cores || plan.resources?.cores || '—'} cores</b></div>
          <div className="vps-spec-row"><Activity size={14} /><span>Memory</span><b>{(plan.proxmox?.memory || plan.resources?.memory) ? (Math.round((plan.proxmox?.memory || plan.resources?.memory) / 102.4) / 10) + ' GB' : '—'}</b></div>
          <div className="vps-spec-row"><HardDrive size={14} /><span>Storage</span><b>{plan.proxmox?.disk || plan.resources?.disk || '—'} GB</b></div>

          {isPaid ? (
            <div className="vps-cost-breakdown">
              <div><span>Subtotal ({billingCycle})</span><b>{usd(subtotalCents)}</b></div>
              {promoDiscountCents > 0 && <div style={{ color: '#86efac' }}><span>Promo ({appliedPromo?.code})</span><b>-{usd(promoDiscountCents)}</b></div>}
              {hzlDiscountCents > 0 && <div style={{ color: '#f5c84d' }}><span>HZL Offset ({money(hzlUsed)} HZL)</span><b>-{usd(hzlDiscountCents)}</b></div>}
              <div className="vps-total">
                <span>Total Due</span>
                <b>{usd(finalTotalCents)} <small>({lkr(finalTotalCents, usdToLkrRate)})</small></b>
              </div>
              <div className="vps-balance">
                <span>Wallet balance</span>
                <b style={{ color: hasFunds ? '#86efac' : '#f87171' }}>{usd(walletCents)}</b>
              </div>
            </div>
          ) : (
            <div className="vps-cost-breakdown"><div><span>Plan price</span><b>{money(plan.cost)} HZL</b></div>
              {Number(node?.surcharge || 0) > 0 && <div><span>Node fee</span><b>+{money(node.surcharge)} HZL</b></div>}
              {Number(os?.surcharge || 0) > 0 && <div><span>OS fee</span><b>+{money(os.surcharge)} HZL</b></div>}
              <div className="vps-total"><span>Total</span><b>{money(hzlCost)} <small>HZL</small></b></div><div className="vps-balance"><span>Available balance</span><b>{money(balance)} HZL</b></div>
            </div>
          )}

          {isPaid && !hasFunds && typeof onOpenBilling === 'function' ? (
            <button
              className="vps-deploy-submit"
              type="button"
              onClick={() => { onClose(); onOpenBilling(); }}
            >
              <Wallet size={16} /> Top Up Wallet (+{usd(finalTotalCents - Number(walletCents || 0))} needed)
            </button>
          ) : (
            <button
              className="vps-deploy-submit"
              type="button"
              disabled={!canSubmit}
              onClick={() => onDeploy(
                isPaid
                  ? {
                      checkoutType: 'paid',
                      displayName: name,
                      nodeId,
                      osId,
                      password,
                      passwordMode: mode,
                      billingCycle,
                      promoCode: appliedPromo?.code || '',
                      useHzlCredit,
                      autoRenew
                    }
                  : { checkoutType: 'hzl', displayName: name, nodeId, osId, password, passwordMode: mode, cost: hzlCost }
              )}
            >
              {busy ? (
                <><Activity size={16} className="vps-spin" /> Creating server…</>
              ) : isPaid ? (
                <><CreditCard size={16} /> Pay {usd(finalTotalCents)} &amp; Deploy <span>→</span></>
              ) : (
                <><Server size={16} /> Deploy server <span>→</span></>
              )}
            </button>
          )}
          {!validName && <small className="vps-submit-note">Enter a valid server name to continue.</small>}
          {!isPaid && Number(balance) < hzlCost && <small className="vps-submit-note">You need {money(hzlCost - Number(balance))} more HZL.</small>}
          {isPaid && !hasFunds && <small className="vps-submit-note">Need {usd(finalTotalCents - Number(walletCents || 0))} more USD in your wallet.</small>}
          {(!nodes.length) && <small className="vps-submit-note">Node configuration is missing.</small>}
          <div className="vps-trust-note"><ShieldCheck size={13} /> {isPaid ? 'Numbered invoice & instant wallet settlement · 3-day grace window' : 'Secure configuration · HZL pricing shown before deployment'}</div>
        </aside>
      </div>
    </section>
  </div>;
}
