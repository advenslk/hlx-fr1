import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Building2,
  Check,
  Coins,
  CreditCard,
  FileText,
  Printer,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Wallet,
  X
} from 'lucide-react';

const money = n => new Intl.NumberFormat('en-US').format(Number(n) || 0);
const usd = cents => '$' + (Number(cents || 0) / 100).toFixed(2);
const lkr = (cents, rate = 300) => 'Rs. ' + money(Math.round((Number(cents || 0) / 100) * Number(rate || 300)));

export default function BillingCenter({
  me,
  rewards,
  billing,
  hostingRequests = [],
  hostingOptions = [],
  busy,
  onRefreshBilling,
  onSubmitManualTopup,
  onStartStripeTopup,
  onStartPayhereTopup,
  onRenewServer,
  onToggleAutoRenew,
  onUpgradeServer,
  onGoToDeploy,
  onToast
}) {
  const [topupMethod, setTopupMethod] = useState('bank_transfer'); // 'bank_transfer' | 'crypto' | 'stripe' | 'payhere'
  const [amountUsd, setAmountUsd] = useState('10');
  const [referenceCode, setReferenceCode] = useState('');
  const [senderName, setSenderName] = useState(me?.global_name || me?.username || '');
  const [topupNote, setTopupNote] = useState('');
  const [invoiceFilter, setInvoiceFilter] = useState('all'); // 'all' | 'paid' | 'pending' | 'refunded'
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [upgradeModalServer, setUpgradeModalServer] = useState(null);
  const [upgradeTargetPlanId, setUpgradeTargetPlanId] = useState('');

  const rate = billing?.usdToLkrRate || 300;
  const cashCents = Number(billing?.cashBalanceCents ?? rewards?.cashBalanceCents ?? 0);
  const hzlBalance = Number(rewards?.balance || 0);
  const numericUsd = Math.max(0, Number(amountUsd) || 0);
  const previewCents = Math.round(numericUsd * 100);

  const paidServers = useMemo(
    () => (hostingRequests || []).filter(r => r.billingType === 'paid' && ['provisioned', 'suspended'].includes(r.status)),
    [hostingRequests]
  );

  const invoices = useMemo(() => {
    const list = Array.isArray(billing?.invoices) ? billing.invoices : [];
    if (invoiceFilter === 'all') return list;
    return list.filter(i => i.status === invoiceFilter);
  }, [billing?.invoices, invoiceFilter]);

  const transactions = Array.isArray(billing?.transactions) ? billing.transactions : [];
  const topupRequests = Array.isArray(billing?.topupRequests) ? billing.topupRequests : [];

  const bankCfg = billing?.gateways?.bankTransfer || {};
  const cryptoCfg = billing?.gateways?.crypto || {};
  const stripeEnabled = Boolean(billing?.gateways?.stripe?.enabled);
  const payhereEnabled = Boolean(billing?.gateways?.payhere?.enabled);

  async function handleTopupSubmit(e) {
    e.preventDefault();
    if (numericUsd < 1) {
      onToast?.('Enter a valid amount of at least $1.00 USD.');
      return;
    }
    if (topupMethod === 'stripe') {
      await onStartStripeTopup?.(numericUsd);
      return;
    }
    if (topupMethod === 'payhere') {
      await onStartPayhereTopup?.(numericUsd);
      return;
    }
    const ok = await onSubmitManualTopup?.({
      method: topupMethod,
      amountUsd: numericUsd,
      referenceCode,
      senderName,
      note: topupNote
    });
    if (ok) {
      setReferenceCode('');
      setTopupNote('');
    }
  }

  function openUpgradeDialog(srv) {
    const candidates = (hostingOptions || []).filter(
      p => p.service === srv.service && p.billingMode !== 'hzl' && p.id !== srv.planId
    );
    const higher = candidates.filter(p => {
      const cycle = srv.billingCycle || 'monthly';
      const price = p.paidPricing?.[cycle === 'yearly' ? 'yearlyCents' : cycle === 'quarterly' ? 'quarterlyCents' : 'monthlyCents'] || 0;
      return price > Number(srv.recurringCents || 0);
    });
    setUpgradeTargetPlanId(higher[0]?.id || '');
    setUpgradeModalServer({ server: srv, options: higher });
  }

  return (
    <section className="rewards-section" id="billing">
      <div className="services-head">
        <div>
          <div className="section-label">REAL-MONEY BILLING &amp; WALLET</div>
          <h2 className="services-title">Billing, Wallet &amp; Paid Subscriptions</h2>
          <p className="services-sub">
            Top up your HelzerX Cloud Wallet via Bank Transfer, Crypto, PayHere (LKR), or Stripe, manage recurring paid VPS &amp; Minecraft plans, and download invoices.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn-pill secondary sm" onClick={onRefreshBilling} disabled={busy}>
            <RefreshCw size={12} /> Refresh Billing
          </button>
          <button className="btn-pill primary sm" onClick={onGoToDeploy}>
            <Sparkles size={12} /> Order Paid Plan
          </button>
        </div>
      </div>

      {/* Wallet & Billing Metrics Strip */}
      <div className="invite-progress-panel">
        <div className="invite-progress-metrics">
          <div className="invite-metric-tile">
            <span>Wallet Credit Balance</span>
            <strong style={{ color: 'var(--accent-gold)' }}>{usd(cashCents)}</strong>
            <small className="billing-sub-figure">{lkr(cashCents, rate)} est.</small>
          </div>
          <div className="invite-metric-tile">
            <span>HZL Loyalty Credit</span>
            <strong>{money(hzlBalance)} <small style={{ fontSize: '12px', color: 'var(--accent-gold)' }}>HZL</small></strong>
            <small className="billing-sub-figure">Up to {usd(Math.floor(hzlBalance / 10))} checkout discount</small>
          </div>
          <div className="invite-metric-tile">
            <span>Paid Active Servers</span>
            <strong>{paidServers.length}</strong>
            <small className="billing-sub-figure">
              {billing?.dueServersCount ? `${billing.dueServersCount} due / past due` : 'All subscriptions current'}
            </small>
          </div>
          <div className="invite-metric-tile">
            <span>Total Paid Spend</span>
            <strong style={{ color: '#86efac' }}>{usd(billing?.totalPaidSpendCents || 0)}</strong>
            <small className="billing-sub-figure">{(billing?.invoices || []).length} total invoice(s)</small>
          </div>
        </div>
      </div>

      {/* Top-Up Wallet + Payment Methods Grid */}
      <div className="invite-hub-grid">
        <article className="invite-hub-card highlight">
          <div className="invite-card-head">
            <div>
              <span className="invite-step-tag">WALLET TOP-UP</span>
              <h3>Add Funds to Wallet</h3>
            </div>
            <Wallet size={20} color="var(--accent-gold)" />
          </div>

          <div className="billing-preset-row">
            {['5', '10', '25', '50', '100'].map(preset => (
              <button
                key={preset}
                type="button"
                className={`billing-preset-btn ${amountUsd === preset ? 'active' : ''}`}
                onClick={() => setAmountUsd(preset)}
              >
                ${preset}
              </button>
            ))}
          </div>

          <form onSubmit={handleTopupSubmit} className="billing-topup-form">
            <div className="invite-claim-grid">
              <div className="form-group" style={{ gap: '6px' }}>
                <label htmlFor="billing-topup-amount">Amount (USD)</label>
                <input
                  id="billing-topup-amount"
                  type="number"
                  min="1"
                  max="2500"
                  step="0.5"
                  value={amountUsd}
                  onChange={e => setAmountUsd(e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{ gap: '6px' }}>
                <label>LKR Equivalent (1 USD = {rate})</label>
                <div className="billing-lkr-box">{lkr(previewCents, rate)}</div>
              </div>
            </div>

            <div className="billing-method-tabs">
              <button
                type="button"
                className={`billing-method-btn ${topupMethod === 'bank_transfer' ? 'active' : ''}`}
                onClick={() => setTopupMethod('bank_transfer')}
              >
                <Building2 size={14} /> Bank Transfer
              </button>
              <button
                type="button"
                className={`billing-method-btn ${topupMethod === 'crypto' ? 'active' : ''}`}
                onClick={() => setTopupMethod('crypto')}
              >
                <Coins size={14} /> Crypto (USDT)
              </button>
              <button
                type="button"
                className={`billing-method-btn ${topupMethod === 'payhere' ? 'active' : ''}`}
                onClick={() => setTopupMethod('payhere')}
              >
                <Banknote size={14} /> PayHere LKR
              </button>
              <button
                type="button"
                className={`billing-method-btn ${topupMethod === 'stripe' ? 'active' : ''}`}
                onClick={() => setTopupMethod('stripe')}
              >
                <CreditCard size={14} /> Stripe Card
              </button>
            </div>

            {topupMethod === 'bank_transfer' && (
              <div className="billing-gateway-box">
                <div className="billing-gateway-title">Sri Lanka Bank Transfer Details</div>
                <div className="billing-bank-grid">
                  <div><span>Bank</span><b>{bankCfg.bankName || 'Commercial Bank / HNB'}</b></div>
                  <div><span>Account Name</span><b>{bankCfg.accountName || 'HelzerX Cloud Hosting'}</b></div>
                  <div><span>Account No</span><b style={{ fontFamily: 'var(--font-mono)' }}>{bankCfg.accountNumber}</b></div>
                  <div><span>Transfer Amount</span><b style={{ color: 'var(--accent-gold)' }}>{lkr(previewCents, rate)}</b></div>
                </div>
                <div className="invite-claim-grid" style={{ marginTop: '8px' }}>
                  <div className="form-group" style={{ gap: '6px' }}>
                    <label htmlFor="topup-ref">Bank Reference / Slip No.</label>
                    <input
                      id="topup-ref"
                      type="text"
                      placeholder="e.g. CEFTS-9941283"
                      value={referenceCode}
                      onChange={e => setReferenceCode(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ gap: '6px' }}>
                    <label htmlFor="topup-sender">Sender Name</label>
                    <input
                      id="topup-sender"
                      type="text"
                      placeholder="Account holder name"
                      value={senderName}
                      onChange={e => setSenderName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="form-group" style={{ gap: '6px' }}>
                  <label htmlFor="topup-note">Transfer Note / Branch (Optional)</label>
                  <input
                    id="topup-note"
                    type="text"
                    placeholder="Branch or date/time of transfer"
                    value={topupNote}
                    onChange={e => setTopupNote(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn-pill primary" disabled={busy}>
                  <Check size={14} /> Submit Bank Slip For Approval
                </button>
              </div>
            )}

            {topupMethod === 'crypto' && (
              <div className="billing-gateway-box">
                <div className="billing-gateway-title">Crypto Deposit ({cryptoCfg.network || 'USDT TRC-20'})</div>
                <div className="billing-bank-grid">
                  <div><span>Network</span><b>{cryptoCfg.network || 'USDT TRC-20 / BEP-20'}</b></div>
                  <div><span>Deposit Address</span><b style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{cryptoCfg.address}</b></div>
                  {cryptoCfg.binancePayId && <div><span>Binance Pay ID</span><b style={{ fontFamily: 'var(--font-mono)' }}>{cryptoCfg.binancePayId}</b></div>}
                  <div><span>Amount (USDT)</span><b style={{ color: '#86efac' }}>{usd(previewCents)}</b></div>
                </div>
                <div className="invite-claim-grid" style={{ marginTop: '8px' }}>
                  <div className="form-group" style={{ gap: '6px' }}>
                    <label htmlFor="crypto-tx">Transaction Hash (TXID)</label>
                    <input
                      id="crypto-tx"
                      type="text"
                      placeholder="0x... or TRC20 TxHash"
                      value={referenceCode}
                      onChange={e => setReferenceCode(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ gap: '6px' }}>
                    <label htmlFor="crypto-sender">Wallet / Binance Nickname</label>
                    <input
                      id="crypto-sender"
                      type="text"
                      placeholder="Sender label"
                      value={senderName}
                      onChange={e => setSenderName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <button type="submit" className="btn-pill primary" disabled={busy}>
                  <Check size={14} /> Submit Crypto Deposit Verification
                </button>
              </div>
            )}

            {topupMethod === 'payhere' && (
              <div className="billing-gateway-box">
                <div className="billing-gateway-title">PayHere Sri Lanka Instant Checkout</div>
                <p className="invite-helper-text">
                  Pay {lkr(previewCents, rate)} ({usd(previewCents)} USD) via Visa, MasterCard, Frimi, Genie, or eZ Cash with instant MD5-signed wallet crediting.
                </p>
                {!payhereEnabled && (
                  <div className="invite-diagnostic-banner warn" style={{ padding: '10px 12px', fontSize: '11.5px' }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                    <span>Add <code>PAYHERE_MERCHANT_ID</code> and <code>PAYHERE_MERCHANT_SECRET</code> in server <code>.env</code> to activate instant PayHere checkout, or use Bank Transfer right now.</span>
                  </div>
                )}
                <button type="submit" className="btn-pill primary" disabled={busy || !payhereEnabled}>
                  <ArrowUpRight size={14} /> {payhereEnabled ? `Pay ${lkr(previewCents, rate)} via PayHere` : 'PayHere Standby Mode'}
                </button>
              </div>
            )}

            {topupMethod === 'stripe' && (
              <div className="billing-gateway-box">
                <div className="billing-gateway-title">Stripe Global Card Checkout</div>
                <p className="invite-helper-text">
                  Instant credit via Visa, Mastercard, Apple Pay, or Google Pay. Verified automatically using signed Stripe webhooks.
                </p>
                {!stripeEnabled && (
                  <div className="invite-diagnostic-banner warn" style={{ padding: '10px 12px', fontSize: '11.5px' }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                    <span>Add <code>STRIPE_SECRET_KEY</code> &amp; <code>STRIPE_WEBHOOK_SECRET</code> in server <code>.env</code> to accept live card payments, or use Bank Transfer / Crypto.</span>
                  </div>
                )}
                <button type="submit" className="btn-pill primary" disabled={busy || !stripeEnabled}>
                  <ArrowUpRight size={14} /> {stripeEnabled ? `Pay ${usd(previewCents)} via Stripe` : 'Stripe Standby Mode'}
                </button>
              </div>
            )}
          </form>
        </article>

        {/* Active Paid Subscriptions Card */}
        <article className="invite-hub-card">
          <div className="invite-card-head">
            <div>
              <span className="invite-step-tag">SUBSCRIPTIONS &amp; AUTO-RENEW</span>
              <h3>Active Paid Instances</h3>
            </div>
            <Server size={20} color="var(--accent-violet)" />
          </div>

          {paidServers.length === 0 ? (
            <div style={{ padding: '26px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Server size={28} style={{ margin: '0 auto 10px', opacity: 0.45 }} />
              <p style={{ color: '#fff', fontWeight: 600 }}>No paid servers yet</p>
              <p style={{ fontSize: '12px', marginTop: '4px' }}>
                Deploy a Paid Cloud VPS or Paid Minecraft Server from Hosting Catalog to manage renewal dates and upgrades here.
              </p>
              <button type="button" className="btn-pill secondary sm" style={{ marginTop: '14px' }} onClick={onGoToDeploy}>
                Browse Paid Plans
              </button>
            </div>
          ) : (
            <div className="billing-subs-list">
              {paidServers.map(srv => {
                const dueDate = srv.paidUntil ? new Date(srv.paidUntil) : null;
                const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
                const isOverdue = srv.billingStatus === 'past_due' || srv.billingStatus === 'suspended_billing' || (daysLeft !== null && daysLeft <= 0);
                return (
                  <div key={srv.id} className="billing-sub-item">
                    <div className="billing-sub-top">
                      <div>
                        <div className="billing-sub-title">{srv.displayName || srv.hostname || srv.planName}</div>
                        <div className="billing-sub-meta">
                          {srv.planName} · {usd(srv.recurringCents)} / {srv.billingCycle || 'monthly'}
                        </div>
                      </div>
                      <span className={`billing-status-tag ${isOverdue ? 'overdue' : 'ok'}`}>
                        {srv.billingStatus === 'suspended_billing'
                          ? 'Suspended (Overdue)'
                          : isOverdue
                          ? 'Past Due'
                          : daysLeft !== null
                          ? `Due in ${daysLeft}d`
                          : 'Active'}
                      </span>
                    </div>

                    <div className="billing-sub-controls">
                      <label className="billing-autorenew-toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(srv.autoRenew)}
                          onChange={e => onToggleAutoRenew?.(srv.id, e.target.checked)}
                          disabled={busy}
                        />
                        <span>Auto-Renew ({dueDate ? dueDate.toLocaleDateString() : '—'})</span>
                      </label>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn-pill primary sm"
                          style={{ padding: '6px 12px', fontSize: '11px' }}
                          onClick={() => onRenewServer?.(srv.id, srv.billingCycle || 'monthly')}
                          disabled={busy}
                        >
                          Renew ({usd(srv.recurringCents)})
                        </button>
                        <button
                          type="button"
                          className="btn-pill secondary sm"
                          style={{ padding: '6px 12px', fontSize: '11px' }}
                          onClick={() => openUpgradeDialog(srv)}
                          disabled={busy}
                        >
                          Upgrade
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pending Bank/Crypto Top-Up Verifications */}
          {topupRequests.length > 0 && (
            <div className="invite-sub-table">
              <div className="invite-sub-table-title">
                <ShieldCheck size={14} color="var(--accent-gold)" />
                <span>Deposit Verification Queue</span>
              </div>
              <div className="invite-code-list">
                {topupRequests.slice(0, 5).map(t => (
                  <div className="invite-code-row" key={t.id}>
                    <div className="invite-code-left">
                      <code>{t.referenceCode}</code>
                      <span>{t.method === 'bank_transfer' ? 'Bank Transfer' : 'Crypto'} · {usd(t.amountCents)}</span>
                    </div>
                    <span className={`status-badge ${t.status === 'approved' ? 'provisioned' : t.status === 'rejected' ? 'error' : 'pending'}`}>
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>
      </div>

      {/* Invoices & Ledger Table */}
      <div className="table-panel">
        <div className="table-head">
          <div>
            <h3>Invoices &amp; Receipts</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Official tax-ready billing history, promo discounts, and HZL loyalty offsets.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['all', 'paid', 'pending', 'refunded'].map(st => (
              <button
                key={st}
                type="button"
                className={`btn-pill ${invoiceFilter === st ? 'primary' : 'secondary'} sm`}
                onClick={() => setInvoiceFilter(st)}
              >
                {st.charAt(0).toUpperCase() + st.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {invoices.length === 0 ? (
          <div style={{ padding: '44px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <FileText size={28} style={{ margin: '0 auto 10px', opacity: 0.45 }} />
            <p style={{ color: '#fff', fontWeight: 600 }}>No invoices matching filter</p>
            <p style={{ fontSize: '12px', marginTop: '4px' }}>Wallet top-ups and paid server orders generate numbered invoices automatically.</p>
          </div>
        ) : (
          <div>
            {invoices.map(inv => (
              <div className="request-item" key={inv.id}>
                <div className="request-info">
                  <span className="request-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={14} color="var(--accent-gold)" />
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{inv.invoiceNumber}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                      · {inv.items?.[0]?.description || inv.type}
                    </span>
                  </span>
                  <span className="request-meta">
                    Method: {inv.paymentMethod} · Total: <strong style={{ color: '#fff' }}>{usd(inv.totalCents)}</strong>
                    {inv.discountCents > 0 ? ` · Promo (${inv.promoCode}): -${usd(inv.discountCents)}` : ''}
                    {inv.hzlDiscountCents > 0 ? ` · HZL Offset: -${usd(inv.hzlDiscountCents)}` : ''}
                    {' · '}{new Date(inv.createdAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`status-badge ${inv.status === 'paid' ? 'provisioned' : inv.status === 'pending' ? 'pending' : 'error'}`}>
                    {inv.status}
                  </span>
                  <button
                    type="button"
                    className="btn-pill secondary sm"
                    style={{ padding: '5px 11px', fontSize: '11px' }}
                    onClick={() => setSelectedInvoice(inv)}
                  >
                    <Printer size={11} /> Invoice
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Wallet Transactions Ledger */}
      {transactions.length > 0 && (
        <div className="table-panel">
          <div className="table-head">
            <div>
              <h3>Wallet Transaction Ledger</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Immutable credit &amp; debit movements on your USD cash balance.
              </p>
            </div>
          </div>
          <div>
            {transactions.slice(0, 25).map(tx => (
              <div className="request-item" key={tx.id}>
                <div className="request-info">
                  <span className="request-title" style={{ fontSize: '14px' }}>{tx.description || tx.type}</span>
                  <span className="request-meta">
                    {tx.id} · {tx.method} · {new Date(tx.createdAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '14px', color: tx.direction === 'credit' ? '#86efac' : '#f5b041' }}>
                  {tx.direction === 'credit' ? '+' : '-'}{usd(tx.amountCents)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Printable Invoice Modal */}
      {selectedInvoice && (
        <div className="modal-overlay" onClick={() => setSelectedInvoice(null)}>
          <div className="modal-card invoice-printable-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="section-label" style={{ marginBottom: '2px' }}>HELZERX CLOUD · OFFICIAL INVOICE</div>
                <h3 style={{ fontFamily: 'var(--font-mono)' }}>{selectedInvoice.invoiceNumber}</h3>
              </div>
              <button className="modal-close" onClick={() => setSelectedInvoice(null)} aria-label="Close invoice"><X size={18} /></button>
            </div>

            <div className="invoice-meta-grid">
              <div><span>Billed To</span><b>{me?.global_name || me?.username}</b><small>{me?.email || me?.id}</small></div>
              <div><span>Status</span><b style={{ textTransform: 'uppercase', color: selectedInvoice.status === 'paid' ? '#86efac' : '#fcd34d' }}>{selectedInvoice.status}</b></div>
              <div><span>Payment Method</span><b>{selectedInvoice.paymentMethod}</b></div>
              <div><span>Issued Date</span><b>{new Date(selectedInvoice.createdAt).toLocaleString()}</b></div>
            </div>

            <div className="invoice-items-box">
              {(selectedInvoice.items || []).map((it, idx) => (
                <div className="invoice-line" key={idx}>
                  <span>{it.description}</span>
                  <b>{usd(it.amountCents)}</b>
                </div>
              ))}
              {selectedInvoice.discountCents > 0 && (
                <div className="invoice-line discount">
                  <span>Promo Code Discount ({selectedInvoice.promoCode})</span>
                  <b>-{usd(selectedInvoice.discountCents)}</b>
                </div>
              )}
              {selectedInvoice.hzlDiscountCents > 0 && (
                <div className="invoice-line discount">
                  <span>HZL Loyalty Offset ({money(selectedInvoice.hzlUsed)} HZL)</span>
                  <b>-{usd(selectedInvoice.hzlDiscountCents)}</b>
                </div>
              )}
              <div className="invoice-line total">
                <span>Total Amount</span>
                <b>{usd(selectedInvoice.totalCents)} <small>({lkr(selectedInvoice.totalCents, rate)})</small></b>
              </div>
            </div>

            {selectedInvoice.note && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>Note: {selectedInvoice.note}</p>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-pill secondary sm" onClick={() => window.print()}>
                <Printer size={12} /> Print / Save PDF
              </button>
              <button type="button" className="btn-pill primary sm" onClick={() => setSelectedInvoice(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Upgrade Modal */}
      {upgradeModalServer && (
        <div className="modal-overlay" onClick={() => setUpgradeModalServer(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Upgrade Paid Server Plan</h3>
              <button className="modal-close" onClick={() => setUpgradeModalServer(null)} aria-label="Close upgrade dialog"><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '14px' }}>
              Upgrading <strong>{upgradeModalServer.server.displayName || upgradeModalServer.server.planName}</strong> charges only the prorated difference for your remaining billing period.
            </p>
            {upgradeModalServer.options.length === 0 ? (
              <div className="invite-diagnostic-banner warn">
                <AlertTriangle size={16} />
                <span>You are already on the highest available {upgradeModalServer.server.service.toUpperCase()} tier.</span>
              </div>
            ) : (
              <div className="form-group">
                <label htmlFor="upgrade-plan-select">Select Higher Tier Plan</label>
                <select
                  id="upgrade-plan-select"
                  value={upgradeTargetPlanId}
                  onChange={e => setUpgradeTargetPlanId(e.target.value)}
                >
                  {upgradeModalServer.options.map(opt => {
                    const cyc = upgradeModalServer.server.billingCycle || 'monthly';
                    const pCents = opt.paidPricing?.[cyc === 'yearly' ? 'yearlyCents' : cyc === 'quarterly' ? 'quarterlyCents' : 'monthlyCents'] || 0;
                    return (
                      <option key={opt.id} value={opt.id}>
                        {opt.name} — {usd(pCents)} / {cyc}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-pill secondary sm" onClick={() => setUpgradeModalServer(null)}>Cancel</button>
              {upgradeModalServer.options.length > 0 && (
                <button
                  type="button"
                  className="btn-pill primary sm"
                  disabled={busy || !upgradeTargetPlanId}
                  onClick={async () => {
                    const ok = await onUpgradeServer?.(upgradeModalServer.server.id, upgradeTargetPlanId);
                    if (ok) setUpgradeModalServer(null);
                  }}
                >
                  {busy ? 'Upgrading...' : 'Confirm Prorated Upgrade'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
