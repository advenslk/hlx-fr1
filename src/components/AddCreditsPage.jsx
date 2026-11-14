import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  Check,
  Coins,
  CreditCard,
  Layers,
  RefreshCw,
  ShieldCheck,
  Wallet
} from 'lucide-react';

const money = n => new Intl.NumberFormat('en-US').format(Number(n) || 0);
const usd = cents => '$' + (Number(cents || 0) / 100).toFixed(2);
const lkr = (cents, rate = 300) => 'Rs. ' + money(Math.round((Number(cents || 0) / 100) * Number(rate || 300)));

export default function AddCreditsPage({
  me,
  rewards,
  billing,
  busy,
  onRefreshBilling,
  onSubmitManualTopup,
  onStartStripeTopup,
  onStartPayhereTopup,
  onBackToBilling,
  onGoToDeploy,
  onGoToSecurity,
  onToast
}) {
  const bankCfg = billing?.gateways?.bankTransfer || {};
  const cryptoCfg = billing?.gateways?.crypto || {};
  const stripeEnabled = Boolean(billing?.gateways?.stripe?.enabled);
  const stripeWebhookReady = Boolean(billing?.gateways?.stripe?.webhookReady);
  const payhereEnabled = Boolean(billing?.gateways?.payhere?.enabled);
  const payhereSandbox = Boolean(billing?.gateways?.payhere?.sandbox);

  const initialMethod = stripeEnabled
    ? 'stripe'
    : payhereEnabled
    ? 'payhere'
    : bankCfg.enabled
    ? 'bank_transfer'
    : cryptoCfg.enabled
    ? 'crypto'
    : 'bank_transfer';

  const [topupMethod, setTopupMethod] = useState(initialMethod);
  const [amountUsd, setAmountUsd] = useState('10');
  const [referenceCode, setReferenceCode] = useState('');
  const [senderName, setSenderName] = useState(me?.global_name || me?.username || '');
  const [topupNote, setTopupNote] = useState('');
  const [payherePhone, setPayherePhone] = useState('');
  const [payhereAddress, setPayhereAddress] = useState('');
  const [payhereCity, setPayhereCity] = useState('');

  const rate = billing?.usdToLkrRate || 300;
  const cashCents = Number(billing?.cashBalanceCents ?? rewards?.cashBalanceCents ?? 0);
  const hzlBalance = Number(rewards?.balance || 0);
  const numericUsd = Math.max(0, Number(amountUsd) || 0);
  const previewCents = Math.round(numericUsd * 100);

  const topupRequests = Array.isArray(billing?.topupRequests) ? billing.topupRequests : [];
  const depositTransactions = useMemo(() => {
    const list = Array.isArray(billing?.transactions) ? billing.transactions : [];
    return list.filter(tx => tx.direction === 'credit');
  }, [billing?.transactions]);

  async function handleTopupSubmit(e) {
    e.preventDefault();
    if (numericUsd < 1 || numericUsd > 2500) {
      onToast?.('Enter a valid top-up amount between $1.00 and $2,500.00 USD.');
      return;
    }

    if (topupMethod === 'stripe') {
      if (numericUsd < 2) {
        onToast?.('Stripe Checkout minimum top-up is $2.00 USD.');
        return;
      }
      await onStartStripeTopup?.(numericUsd);
      return;
    }

    if (topupMethod === 'payhere') {
      if (!me?.email) {
        onToast?.('Your account needs a real email address before using PayHere Checkout.');
        return;
      }
      if (!/^\+?[0-9\s-]{8,20}$/.test(payherePhone.trim())) {
        onToast?.('Enter a valid phone number (8–20 digits) for PayHere verification.');
        return;
      }
      if (payhereAddress.trim().length < 4) {
        onToast?.('Enter your real billing street address for PayHere checkout.');
        return;
      }
      if (payhereCity.trim().length < 2) {
        onToast?.('Enter your billing city for PayHere checkout.');
        return;
      }
      await onStartPayhereTopup?.({
        amountUsd: numericUsd,
        phone: payherePhone.trim(),
        address: payhereAddress.trim(),
        city: payhereCity.trim()
      });
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

  return (
    <section className="rewards-section" id="credits">
      <div className="services-head">
        <div>
          <div className="section-label">WALLET CREDITS · ADD FUNDS</div>
          <h2 className="services-title">Add Credits to Wallet</h2>
          <p className="services-sub">
            Deposit USD or LKR into your HelzerX Cloud Wallet to pay for instant VPS or Minecraft deployments, automatic renewals, and plan upgrades.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className="btn-pill secondary sm" onClick={onBackToBilling}>
            <ArrowLeft size={12} /> Billing &amp; Invoices
          </button>
          <button type="button" className="btn-pill secondary sm" onClick={onRefreshBilling} disabled={busy}>
            <RefreshCw size={12} /> Refresh
          </button>
          <button type="button" className="btn-pill primary sm" onClick={onGoToDeploy}>
            <Layers size={12} /> Browse Paid Plans
          </button>
        </div>
      </div>

      {/* Live Wallet Summary Strip */}
      <div className="invite-progress-panel">
        <div className="invite-progress-metrics">
          <div className="invite-metric-tile">
            <span>Current Wallet Balance</span>
            <strong style={{ color: 'var(--accent-gold)', fontVariantNumeric: 'tabular-nums' }}>{usd(cashCents)}</strong>
            <small className="billing-sub-figure">{lkr(cashCents, rate)} est.</small>
          </div>
          <div className="invite-metric-tile">
            <span>New Balance After Top-Up</span>
            <strong style={{ color: '#86efac', fontVariantNumeric: 'tabular-nums' }}>{usd(cashCents + previewCents)}</strong>
            <small className="billing-sub-figure">+{usd(previewCents)} ({lkr(previewCents, rate)})</small>
          </div>
          <div className="invite-metric-tile">
            <span>Exchange Rate</span>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{rate} LKR</strong>
            <small className="billing-sub-figure">Per $1.00 USD settlement</small>
          </div>
          <div className="invite-metric-tile">
            <span>HZL Checkout Credit</span>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{money(hzlBalance)} <small style={{ fontSize: '12px', color: 'var(--accent-gold)' }}>HZL</small></strong>
            <small className="billing-sub-figure">Up to {usd(Math.floor(hzlBalance / 10))} promo offset</small>
          </div>
        </div>
      </div>

      {/* Main Add Credits Workspace */}
      <div className="invite-hub-grid credits-page-grid">
        <article className="invite-hub-card highlight">
          <div className="invite-card-head">
            <div>
              <span className="invite-step-tag">STEP 1 · AMOUNT &amp; GATEWAY</span>
              <h3>Select Amount &amp; Payment Method</h3>
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
                <label htmlFor="credits-topup-amount">Deposit Amount (USD)</label>
                <input
                  id="credits-topup-amount"
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
                <label>LKR Settlement (1 USD = {rate} LKR)</label>
                <div className="billing-lkr-box">{lkr(previewCents, rate)}</div>
              </div>
            </div>

            <div className="billing-method-tabs">
              <button
                type="button"
                className={`billing-method-btn ${topupMethod === 'stripe' ? 'active' : ''}`}
                onClick={() => setTopupMethod('stripe')}
              >
                <CreditCard size={14} /> Stripe Card {stripeEnabled ? '' : '· Standby'}
              </button>
              <button
                type="button"
                className={`billing-method-btn ${topupMethod === 'payhere' ? 'active' : ''}`}
                onClick={() => setTopupMethod('payhere')}
              >
                <Banknote size={14} /> PayHere LKR {payhereEnabled ? '' : '· Standby'}
              </button>
              <button
                type="button"
                className={`billing-method-btn ${topupMethod === 'bank_transfer' ? 'active' : ''}`}
                onClick={() => setTopupMethod('bank_transfer')}
              >
                <Building2 size={14} /> Bank Transfer {bankCfg.enabled ? '' : '· Standby'}
              </button>
              <button
                type="button"
                className={`billing-method-btn ${topupMethod === 'crypto' ? 'active' : ''}`}
                onClick={() => setTopupMethod('crypto')}
              >
                <Coins size={14} /> Crypto (USDT) {cryptoCfg.enabled ? '' : '· Standby'}
              </button>
            </div>

            {topupMethod === 'stripe' && (
              <div className="billing-gateway-box">
                <div className="billing-gateway-title">Stripe Global Card Checkout</div>
                <p className="invite-helper-text">
                  Instant wallet top-up via Visa, Mastercard, Apple Pay, or Google Pay. Confirmed directly by Stripe webhooks.
                </p>
                {!stripeEnabled ? (
                  <div className="invite-diagnostic-banner warn" style={{ padding: '10px 12px', fontSize: '12px' }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                    <span>Stripe gateway is not configured on the server yet. Set <code>STRIPE_SECRET_KEY</code> and <code>STRIPE_WEBHOOK_SECRET</code> in <code>.env</code> to accept live card payments.</span>
                  </div>
                ) : !stripeWebhookReady && (
                  <div className="invite-diagnostic-banner warn" style={{ padding: '10px 12px', fontSize: '12px' }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                    <span>Stripe webhook secret (<code>STRIPE_WEBHOOK_SECRET</code>) is not set yet; instant automatic credit confirmation requires webhook verification.</span>
                  </div>
                )}
                <button type="submit" className="btn-pill primary" disabled={busy || !stripeEnabled}>
                  <ArrowUpRight size={14} /> {stripeEnabled ? `Continue to Stripe (${usd(previewCents)})` : 'Stripe Not Configured'}
                </button>
              </div>
            )}

            {topupMethod === 'payhere' && (
              <div className="billing-gateway-box">
                <div className="billing-gateway-title">
                  PayHere Sri Lanka Checkout ({payhereSandbox ? 'Sandbox Mode' : 'Live LKR'})
                </div>
                <p className="invite-helper-text">
                  Pay {lkr(previewCents, rate)} ({usd(previewCents)} USD) via Sri Lankan bank cards, Frimi, Genie, or eZ Cash. Wallet credits immediately upon signed PayHere notify callback.
                </p>

                {!payhereEnabled ? (
                  <div className="invite-diagnostic-banner warn" style={{ padding: '10px 12px', fontSize: '12px' }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                    <span>PayHere gateway is not configured on the server yet. Set <code>PAYHERE_MERCHANT_ID</code> and <code>PAYHERE_MERCHANT_SECRET</code> in <code>.env</code>.</span>
                  </div>
                ) : (
                  <>
                    {!me?.email && (
                      <div className="invite-diagnostic-banner warn" style={{ padding: '10px 12px', fontSize: '12px' }}>
                        <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                        <span>
                          PayHere requires a real email address on your account.{' '}
                          <button
                            type="button"
                            onClick={onGoToSecurity}
                            style={{ background: 'none', border: 'none', color: '#fde68a', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontWeight: 700 }}
                          >
                            Open Security &amp; Account
                          </button>
                        </span>
                      </div>
                    )}
                    <div className="invite-claim-grid">
                      <div className="form-group" style={{ gap: '6px' }}>
                        <label htmlFor="payhere-phone">Mobile Phone Number</label>
                        <input
                          id="payhere-phone"
                          type="tel"
                          placeholder="+94771234567"
                          value={payherePhone}
                          onChange={e => setPayherePhone(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group" style={{ gap: '6px' }}>
                        <label htmlFor="payhere-city">City</label>
                        <input
                          id="payhere-city"
                          type="text"
                          placeholder="Your billing city"
                          value={payhereCity}
                          onChange={e => setPayhereCity(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-group" style={{ gap: '6px' }}>
                      <label htmlFor="payhere-address">Billing Street Address</label>
                      <input
                        id="payhere-address"
                        type="text"
                        placeholder="Street address for invoice & PayHere verification"
                        value={payhereAddress}
                        onChange={e => setPayhereAddress(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}

                <button type="submit" className="btn-pill primary" disabled={busy || !payhereEnabled || !me?.email}>
                  <ArrowUpRight size={14} /> {payhereEnabled ? `Pay ${lkr(previewCents, rate)} via PayHere` : 'PayHere Not Configured'}
                </button>
              </div>
            )}

            {topupMethod === 'bank_transfer' && (
              <div className="billing-gateway-box">
                <div className="billing-gateway-title">Sri Lanka Bank Transfer</div>
                {!bankCfg.enabled ? (
                  <div className="invite-diagnostic-banner warn" style={{ padding: '10px 12px', fontSize: '12px' }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                    <span>
                      Bank Transfer destination details are not configured on the server yet. Administrator must set <code>BILLING_BANK_NAME</code>, <code>BILLING_BANK_ACCOUNT_NAME</code>, and <code>BILLING_BANK_ACCOUNT_NUMBER</code> in <code>.env</code>.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="billing-bank-grid">
                      <div><span>Bank</span><b>{bankCfg.bankName}</b></div>
                      <div><span>Account Name</span><b>{bankCfg.accountName}</b></div>
                      <div><span>Account No</span><b style={{ fontFamily: 'var(--font-mono)' }}>{bankCfg.accountNumber}</b></div>
                      <div><span>Branch</span><b>{bankCfg.branch || 'Main Clearing'}</b></div>
                      <div><span>Transfer Amount</span><b style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)' }}>{lkr(previewCents, rate)} ({usd(previewCents)})</b></div>
                    </div>
                    <div className="invite-claim-grid" style={{ marginTop: '4px' }}>
                      <div className="form-group" style={{ gap: '6px' }}>
                        <label htmlFor="credits-bank-ref">Bank Reference / Slip No.</label>
                        <input
                          id="credits-bank-ref"
                          type="text"
                          placeholder="e.g. CEFTS / Slip Reference"
                          value={referenceCode}
                          onChange={e => setReferenceCode(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group" style={{ gap: '6px' }}>
                        <label htmlFor="credits-bank-sender">Sender Account Name</label>
                        <input
                          id="credits-bank-sender"
                          type="text"
                          placeholder="Full account holder name"
                          value={senderName}
                          onChange={e => setSenderName(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-group" style={{ gap: '6px' }}>
                      <label htmlFor="credits-bank-note">Transfer Note / Branch (Optional)</label>
                      <input
                        id="credits-bank-note"
                        type="text"
                        placeholder="Branch or date/time of transfer"
                        value={topupNote}
                        onChange={e => setTopupNote(e.target.value)}
                      />
                    </div>
                  </>
                )}
                <button type="submit" className="btn-pill primary" disabled={busy || !bankCfg.enabled}>
                  <Check size={14} /> {bankCfg.enabled ? 'Submit Bank Slip For Verification' : 'Bank Transfer Not Configured'}
                </button>
              </div>
            )}

            {topupMethod === 'crypto' && (
              <div className="billing-gateway-box">
                <div className="billing-gateway-title">Crypto Deposit ({cryptoCfg.network || 'USDT'})</div>
                {!cryptoCfg.enabled ? (
                  <div className="invite-diagnostic-banner warn" style={{ padding: '10px 12px', fontSize: '12px' }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                    <span>
                      Crypto deposit address is not configured on the server yet. Administrator must set <code>BILLING_CRYPTO_NETWORK</code> &amp; <code>BILLING_CRYPTO_ADDRESS</code> (or <code>BILLING_CRYPTO_BINANCE_ID</code>) in <code>.env</code>.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="billing-bank-grid">
                      {cryptoCfg.network && <div><span>Network</span><b>{cryptoCfg.network}</b></div>}
                      {cryptoCfg.address && <div><span>Deposit Address</span><b style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{cryptoCfg.address}</b></div>}
                      {cryptoCfg.binancePayId && <div><span>Binance Pay ID</span><b style={{ fontFamily: 'var(--font-mono)' }}>{cryptoCfg.binancePayId}</b></div>}
                      <div><span>Amount (USDT)</span><b style={{ color: '#86efac', fontFamily: 'var(--font-mono)' }}>{usd(previewCents)}</b></div>
                    </div>
                    <div className="invite-claim-grid" style={{ marginTop: '4px' }}>
                      <div className="form-group" style={{ gap: '6px' }}>
                        <label htmlFor="credits-crypto-tx">Transaction Hash (TXID)</label>
                        <input
                          id="credits-crypto-tx"
                          type="text"
                          placeholder="TRC20 / BEP20 TxHash"
                          value={referenceCode}
                          onChange={e => setReferenceCode(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group" style={{ gap: '6px' }}>
                        <label htmlFor="credits-crypto-sender">Sender Wallet / Binance Nickname</label>
                        <input
                          id="credits-crypto-sender"
                          type="text"
                          placeholder="Sender label"
                          value={senderName}
                          onChange={e => setSenderName(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  </>
                )}
                <button type="submit" className="btn-pill primary" disabled={busy || !cryptoCfg.enabled}>
                  <Check size={14} /> {cryptoCfg.enabled ? 'Submit Crypto Deposit Verification' : 'Crypto Not Configured'}
                </button>
              </div>
            )}
          </form>
        </article>

        {/* Right Column: Deposit Queue & Credit Ledger */}
        <article className="invite-hub-card">
          <div className="invite-card-head">
            <div>
              <span className="invite-step-tag">VERIFICATION &amp; LEDGER</span>
              <h3>Recent Deposits &amp; Queue</h3>
            </div>
            <ShieldCheck size={20} color="var(--accent-violet)" />
          </div>

          <div className="credits-verification-meta">
            <div>
              <strong>Real Gateway Verification</strong>
              <p>
                Every Stripe &amp; PayHere payment is cryptographically verified by signed webhook callbacks before crediting your wallet. Manual slips require admin approval in the billing ledger.
              </p>
            </div>
          </div>

          <div className="invite-sub-table" style={{ marginTop: '6px' }}>
            <div className="invite-sub-table-title">
              <ShieldCheck size={14} color="var(--accent-gold)" />
              <span>Deposit Verification Queue ({topupRequests.length})</span>
            </div>
            {topupRequests.length === 0 ? (
              <div className="credits-empty-box">
                No pending or past manual deposit submissions yet.
              </div>
            ) : (
              <div className="invite-code-list">
                {topupRequests.slice(0, 8).map(t => (
                  <div className="invite-code-row" key={t.id}>
                    <div className="invite-code-left">
                      <code>{t.referenceCode}</code>
                      <span>
                        {t.method === 'bank_transfer' ? 'Bank Transfer' : 'Crypto'} · <strong style={{ color: '#fff' }}>{usd(t.amountCents)}</strong> ({lkr(t.amountCents, rate)})
                      </span>
                    </div>
                    <span className={`status-badge ${t.status === 'approved' ? 'provisioned' : t.status === 'rejected' ? 'error' : 'pending'}`}>
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="invite-sub-table" style={{ marginTop: '14px' }}>
            <div className="invite-sub-table-title">
              <Coins size={14} color="#86efac" />
              <span>Completed Wallet Credits ({depositTransactions.length})</span>
            </div>
            {depositTransactions.length === 0 ? (
              <div className="credits-empty-box">
                Approved deposits, refunds, and admin wallet credits appear here automatically.
              </div>
            ) : (
              <div className="invite-code-list">
                {depositTransactions.slice(0, 8).map(tx => (
                  <div className="invite-code-row" key={tx.id}>
                    <div className="invite-code-left">
                      <span>{tx.description || tx.type}</span>
                      <small style={{ color: 'var(--text-subtle)', fontSize: '11px' }}>
                        {tx.method} · {new Date(tx.createdAt).toLocaleDateString()}
                      </small>
                    </div>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: '#86efac', fontVariantNumeric: 'tabular-nums' }}>
                      +{usd(tx.amountCents)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
