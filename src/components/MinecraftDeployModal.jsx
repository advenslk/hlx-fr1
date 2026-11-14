import React, { useState, useEffect } from 'react';
import { Box, Server, X, ChevronDown, Sparkles, CreditCard, Tag, Wallet } from 'lucide-react';
import './MinecraftDeployModal.css';

const money = n => new Intl.NumberFormat('en-US').format(Number(n) || 0);
const usd = cents => '$' + (Number(cents || 0) / 100).toFixed(2);
const lkr = (cents, rate = 300) => 'Rs. ' + money(Math.round((Number(cents || 0) / 100) * Number(rate || 300)));

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
  const [name, setName] = useState('');
  const [eggId, setEggId] = useState(eggs[0]?.id || '');
  const [nodeId, setNodeId] = useState(nodes[0]?.id || '');

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

  const canAfford = isPaid ? Number(walletCents) >= finalTotalCents : Number(balance) >= cost;
  const validName = /^[a-z0-9](?:[a-z0-9_-]{0,28}[a-z0-9])?$/i.test(name) && name.length >= 2;
  const hasCatalog = Boolean(eggId && nodeId && eggs.some(e => e.id === eggId) && nodes.some(n => n.id === nodeId));
  const canSubmit = validName && hasCatalog && canAfford && !busy;

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
        nodeId
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
            <i className="mc-live-dot" /> PTERODACTYL ENGINE <span style={{ opacity: 0.5 }}>/</span> {isPaid ? 'PAID MINECRAFT HOSTING' : 'MINECRAFT CLOUD'}
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
              ? 'Powered by Pterodactyl container orchestration. Instant wallet settlement with recurring renewals and numbered invoices.'
              : 'Powered by Pterodactyl container orchestration. Redeem your verified HZL credits for dedicated game hosting.'}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mc-modal-layout">
          <div className="mc-config-fields">
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
                  : 'Your server identifier and in-game MOTD host.'}
              </small>
            </label>

            <label className="mc-field">
              <span>
                <Box size={13} /> SERVER SOFTWARE (EGG)
              </span>
              <div className="mc-select-wrap">
                <select value={eggId} onChange={e => setEggId(e.target.value)} disabled={!eggs.length}>
                  {!eggs.length && <option value="">No Pterodactyl eggs available</option>}
                  {eggs.map(egg => (
                    <option key={egg.id} value={egg.id}>
                      {egg.label || egg.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </div>
              <small className={eggs.length ? 'mc-field-hint' : 'mc-field-error'}>
                {eggs.length
                  ? 'Live Pterodactyl panel container runtime image.'
                  : 'Pterodactyl panel eggs are unavailable. Configure PTERODACTYL_* on the server.'}
              </small>
            </label>

            <label className="mc-field">
              <span>
                <Server size={13} /> CLUSTER REGION &amp; NODE
              </span>
              <div className="mc-select-wrap">
                <select value={nodeId} onChange={e => setNodeId(e.target.value)} disabled={!nodes.length}>
                  {!nodes.length && <option value="">No Pterodactyl nodes available</option>}
                  {nodes.map(node => (
                    <option key={node.id} value={node.id}>
                      {node.label || node.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </div>
              <small className={nodes.length ? 'mc-field-hint' : 'mc-field-error'}>
                {nodes.length
                  ? 'Live datacenter node from Pterodactyl panel allocation.'
                  : 'No live Pterodactyl nodes found. Verify PTERODACTYL_API_KEY and node setup.'}
              </small>
            </label>

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
            <div className="mc-3d-scene" aria-hidden="true">
              <div className="mc-shadow-plate" />
              <div className="mc-voxel-block">
                <div className="mc-face mc-face-front">
                  <div className="mc-block-gem" />
                  <span className="mc-block-text">{isPaid ? 'PRO MC' : 'HZL MC'}</span>
                </div>
                <div className="mc-face mc-face-back" />
                <div className="mc-face mc-face-top" />
                <div className="mc-face mc-face-bottom" />
                <div className="mc-face mc-face-left" />
                <div className="mc-face mc-face-right" />
              </div>
            </div>

            <div className="mc-summary-label">ORDER SUMMARY</div>
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
                <b>{diskGb} GB Fast SSD</b>
              </div>
              <div className="mc-spec-item">
                <span>Software</span>
                <b>{currentEgg ? (currentEgg.name || currentEgg.label) : '—'}</b>
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
                  <b>{usd(finalTotalCents)} <small style={{ fontSize: '11px', color: '#c084fc' }}>({lkr(finalTotalCents, usdToLkrRate)})</small></b>
                </div>
                <div className="mc-balance-info">
                  <span>Wallet balance:</span>
                  <strong style={{ color: canAfford ? '#34d399' : '#f87171' }}>
                    {usd(walletCents)}
                  </strong>
                </div>
              </>
            ) : (
              <>
                <div className="mc-cost-total">
                  <span>Redemption Cost</span>
                  <b>{money(cost)} <small style={{ fontSize: '13px', color: '#c084fc' }}>HZL</small></b>
                </div>
                <div className="mc-balance-info">
                  <span>Your balance:</span>
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
          </aside>
        </form>
      </section>
    </div>
  );
}
