import crypto from 'node:crypto';

export const BILLING_CYCLES = {
  monthly: { id: 'monthly', label: 'Monthly', days: 30, discountHint: '' },
  quarterly: { id: 'quarterly', label: 'Quarterly', days: 90, discountHint: 'Save ~10%' },
  yearly: { id: 'yearly', label: 'Yearly', days: 365, discountHint: 'Save ~20%' }
};

export const DAY_MS = 24 * 60 * 60 * 1000;
export const GRACE_DAYS = 3;
export const HZL_PER_CENT = 10; // 1,000 HZL = $1.00 USD discount credit

export function getUsdToLkrRate(env = process.env) {
  const parsed = Number(env.USD_TO_LKR_RATE || 300);
  return Number.isFinite(parsed) && parsed >= 50 && parsed <= 5000 ? parsed : 300;
}

export function formatUsd(cents) {
  const num = Number(cents || 0) / 100;
  return '$' + num.toFixed(2);
}

export function formatLkr(cents, rate = 300) {
  const lkr = Math.round((Number(cents || 0) / 100) * Number(rate || 300));
  return 'Rs. ' + new Intl.NumberFormat('en-US').format(lkr);
}

export function computeDefaultPaidPricing(plan) {
  const baseHzl = Math.max(100, Number(plan?.cost || 500));
  // Baseline mapping: ~500 HZL -> $2.99/mo, 1000 HZL -> $5.99/mo, 2000 HZL -> $11.99/mo
  const rawMonthly = Math.max(199, Math.round((baseHzl / 500) * 299));
  const monthlyCents = Math.floor(rawMonthly / 100) * 100 + 99;
  const quarterlyCents = Math.round(monthlyCents * 3 * 0.9);
  const yearlyCents = Math.round(monthlyCents * 12 * 0.8);
  return { monthlyCents, quarterlyCents, yearlyCents };
}

export function normalizePlanBilling(plan) {
  if (!plan || typeof plan !== 'object') return plan;
  const billingMode = ['hzl', 'paid', 'both'].includes(plan.billingMode) ? plan.billingMode : 'both';
  const fallback = computeDefaultPaidPricing(plan);
  const pp = plan.paidPricing && typeof plan.paidPricing === 'object' ? plan.paidPricing : {};
  const monthlyCents = Number.isInteger(Number(pp.monthlyCents)) && Number(pp.monthlyCents) > 0
    ? Number(pp.monthlyCents)
    : fallback.monthlyCents;
  const quarterlyCents = Number.isInteger(Number(pp.quarterlyCents)) && Number(pp.quarterlyCents) > 0
    ? Number(pp.quarterlyCents)
    : Math.round(monthlyCents * 3 * 0.9);
  const yearlyCents = Number.isInteger(Number(pp.yearlyCents)) && Number(pp.yearlyCents) > 0
    ? Number(pp.yearlyCents)
    : Math.round(monthlyCents * 12 * 0.8);
  return {
    ...plan,
    billingMode,
    paidPricing: { monthlyCents, quarterlyCents, yearlyCents }
  };
}

export function getCyclePriceCents(plan, cycle = 'monthly') {
  const normalized = normalizePlanBilling(plan);
  if (!normalized?.paidPricing) return 0;
  if (cycle === 'quarterly') return normalized.paidPricing.quarterlyCents;
  if (cycle === 'yearly') return normalized.paidPricing.yearlyCents;
  return normalized.paidPricing.monthlyCents;
}

export function calculateCycleEndIso(fromIsoOrMs, cycle = 'monthly') {
  const baseMs = typeof fromIsoOrMs === 'number'
    ? fromIsoOrMs
    : (fromIsoOrMs ? new Date(fromIsoOrMs).getTime() : Date.now());
  const days = BILLING_CYCLES[cycle]?.days || 30;
  return new Date(Math.max(Date.now(), baseMs) + days * DAY_MS).toISOString();
}

export function validatePromoCode({ data, code, subtotalCents, service = 'all', nowMs = Date.now() }) {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) return { valid: false, error: 'Enter a promo code.' };
  const list = Array.isArray(data?.promoCodes) ? data.promoCodes : [];
  const promo = list.find(p => p && String(p.code || '').toUpperCase() === cleanCode);
  if (!promo) return { valid: false, error: 'Promo code not found.' };
  if (promo.enabled === false) return { valid: false, error: 'This promo code is currently disabled.' };
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() <= nowMs) {
    return { valid: false, error: 'This promo code has expired.' };
  }
  if (Number.isInteger(promo.maxUses) && promo.maxUses > 0 && Number(promo.usedCount || 0) >= promo.maxUses) {
    return { valid: false, error: 'This promo code has reached its redemption limit.' };
  }
  if (promo.service && promo.service !== 'all' && service !== 'all' && promo.service !== service) {
    return { valid: false, error: `Promo code ${cleanCode} only applies to ${promo.service.toUpperCase()} plans.` };
  }
  const minSpend = Number(promo.minSpendCents || 0);
  if (subtotalCents < minSpend) {
    return { valid: false, error: `Minimum order of ${formatUsd(minSpend)} required for ${cleanCode}.` };
  }
  let discountCents = 0;
  if (promo.discountType === 'percent') {
    const pct = Math.min(95, Math.max(1, Number(promo.value || 0)));
    discountCents = Math.round((subtotalCents * pct) / 100);
  } else {
    discountCents = Math.min(subtotalCents, Math.max(0, Number(promo.value || 0)));
  }
  discountCents = Math.min(subtotalCents, Math.max(0, discountCents));
  return {
    valid: true,
    promo: {
      id: promo.id,
      code: promo.code,
      discountType: promo.discountType,
      value: promo.value,
      description: promo.description || ''
    },
    discountCents
  };
}

export function calculateHzlDiscountCents({ userHzlBalance = 0, useHzlCredit = false, remainingCents = 0 }) {
  if (!useHzlCredit || remainingCents <= 0) return { hzlUsed: 0, hzlDiscountCents: 0 };
  // Up to 50% of remaining paid invoice can be offset with earned HZL (1,000 HZL = $1.00 = 100 cents)
  const maxCentsByPolicy = Math.floor(remainingCents * 0.5);
  const maxCentsByBalance = Math.floor(Math.max(0, Number(userHzlBalance || 0)) / HZL_PER_CENT);
  const hzlDiscountCents = Math.max(0, Math.min(maxCentsByPolicy, maxCentsByBalance));
  const hzlUsed = hzlDiscountCents * HZL_PER_CENT;
  return { hzlUsed, hzlDiscountCents };
}

export function getPaidUpgradeDeltaCents({ currentPlan, targetPlan, server, nowMs = Date.now() }) {
  const cycle = BILLING_CYCLES[server?.billingCycle] ? server.billingCycle : 'monthly';
  const currentCyclePrice = Number(server?.recurringCents || getCyclePriceCents(currentPlan, cycle));
  const targetCyclePrice = getCyclePriceCents(targetPlan, cycle);
  if (targetCyclePrice <= currentCyclePrice) {
    return { allowed: false, error: 'Select a higher-tier plan to upgrade.', upgradeDeltaCents: 0, targetCyclePrice };
  }
  const daysTotal = BILLING_CYCLES[cycle]?.days || 30;
  const paidUntilMs = server?.paidUntil ? new Date(server.paidUntil).getTime() : nowMs;
  const remainingRatio = paidUntilMs > nowMs
    ? Math.min(1, Math.max(0.15, (paidUntilMs - nowMs) / (daysTotal * DAY_MS)))
    : 1;
  const fullDiff = targetCyclePrice - currentCyclePrice;
  const upgradeDeltaCents = Math.max(50, Math.round(fullDiff * remainingRatio));
  return { allowed: true, upgradeDeltaCents, targetCyclePrice, cycle, remainingRatio };
}

export function getBillingConfig(env = process.env) {
  const usdToLkrRate = getUsdToLkrRate(env);
  const stripeConfigured = Boolean(String(env.STRIPE_SECRET_KEY || '').trim());
  const stripeWebhookConfigured = Boolean(String(env.STRIPE_WEBHOOK_SECRET || '').trim());
  const payhereMerchantId = String(env.PAYHERE_MERCHANT_ID || '').trim();
  const payhereSecret = String(env.PAYHERE_MERCHANT_SECRET || '').trim();
  const payhereConfigured = Boolean(payhereMerchantId && payhereSecret);
  const payhereSandbox = String(env.PAYHERE_SANDBOX || 'true').toLowerCase() !== 'false';

  const bankTransfer = {
    enabled: true,
    bankName: String(env.BILLING_BANK_NAME || 'Commercial Bank / Hatton National Bank (Sri Lanka)').trim(),
    accountName: String(env.BILLING_BANK_ACCOUNT_NAME || 'HelzerX Cloud Hosting').trim(),
    accountNumber: String(env.BILLING_BANK_ACCOUNT_NUMBER || 'Configured via BILLING_BANK_ACCOUNT_NUMBER (Contact Support for Slip)').trim(),
    branch: String(env.BILLING_BANK_BRANCH || 'Colombo / Digital Clearing').trim(),
    configured: Boolean(String(env.BILLING_BANK_ACCOUNT_NUMBER || '').trim())
  };

  const cryptoPayment = {
    enabled: true,
    network: String(env.BILLING_CRYPTO_NETWORK || 'USDT (TRC-20 / BEP-20) & Binance Pay').trim(),
    address: String(env.BILLING_CRYPTO_ADDRESS || 'Configured via BILLING_CRYPTO_ADDRESS').trim(),
    binancePayId: String(env.BILLING_CRYPTO_BINANCE_ID || '').trim(),
    configured: Boolean(String(env.BILLING_CRYPTO_ADDRESS || '').trim() || String(env.BILLING_CRYPTO_BINANCE_ID || '').trim())
  };

  return {
    currency: 'USD',
    usdToLkrRate,
    hzlPerUsd: HZL_PER_CENT * 100,
    gateways: {
      stripe: { enabled: stripeConfigured, webhookReady: stripeWebhookConfigured },
      payhere: { enabled: payhereConfigured, sandbox: payhereSandbox },
      bankTransfer,
      crypto: cryptoPayment
    }
  };
}

export function createInvoiceNumber(data) {
  const year = new Date().getUTCFullYear();
  const existing = Array.isArray(data?.invoices) ? data.invoices.length : 0;
  const seq = String(existing + 1).padStart(4, '0');
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `INV-${year}-${seq}-${suffix}`;
}

export function ensureBillingCollections(data) {
  if (!Array.isArray(data.invoices)) data.invoices = [];
  if (!Array.isArray(data.transactions)) data.transactions = [];
  if (!Array.isArray(data.topupRequests)) data.topupRequests = [];
  if (!Array.isArray(data.promoCodes)) data.promoCodes = [];
}

export function createInvoice({
  data,
  userId,
  username,
  type = 'hosting_order',
  items = [],
  subtotalCents = 0,
  discountCents = 0,
  hzlDiscountCents = 0,
  hzlUsed = 0,
  totalCents = 0,
  currency = 'USD',
  paymentMethod = 'wallet',
  status = 'paid',
  serverId = null,
  gatewaySessionId = null,
  promoCode = null,
  note = ''
}) {
  ensureBillingCollections(data);
  const now = new Date().toISOString();
  const invoice = {
    id: 'inv_' + crypto.randomBytes(8).toString('hex'),
    invoiceNumber: createInvoiceNumber(data),
    userId,
    username: username || 'Member',
    type,
    items,
    subtotalCents: Math.max(0, Math.round(subtotalCents)),
    discountCents: Math.max(0, Math.round(discountCents)),
    hzlDiscountCents: Math.max(0, Math.round(hzlDiscountCents)),
    hzlUsed: Math.max(0, Math.round(hzlUsed)),
    totalCents: Math.max(0, Math.round(totalCents)),
    currency,
    paymentMethod,
    status,
    serverId,
    gatewaySessionId,
    promoCode: promoCode || null,
    note: String(note || '').slice(0, 300),
    createdAt: now,
    paidAt: status === 'paid' ? now : null
  };
  data.invoices.unshift(invoice);
  if (data.invoices.length > 5000) data.invoices.length = 5000;
  return invoice;
}

export function recordTransaction({
  data,
  userId,
  type,
  amountCents,
  direction = 'debit',
  method = 'wallet',
  invoiceId = null,
  referenceId = null,
  idempotencyKey = null,
  status = 'completed',
  description = ''
}) {
  ensureBillingCollections(data);
  if (idempotencyKey && data.transactions.some(t => t.idempotencyKey === idempotencyKey)) {
    return { duplicate: true, transaction: data.transactions.find(t => t.idempotencyKey === idempotencyKey) };
  }
  const tx = {
    id: 'tx_' + crypto.randomBytes(8).toString('hex'),
    userId,
    type,
    direction,
    amountCents: Math.max(0, Math.round(amountCents)),
    method,
    invoiceId,
    referenceId,
    idempotencyKey: idempotencyKey || null,
    status,
    description: String(description || '').slice(0, 300),
    createdAt: new Date().toISOString()
  };
  data.transactions.unshift(tx);
  if (data.transactions.length > 10000) data.transactions.length = 10000;
  return { duplicate: false, transaction: tx };
}

export function verifyStripeWebhookSignature({ rawBody, signatureHeader, webhookSecret, toleranceSeconds = 300 }) {
  if (!rawBody || !signatureHeader || !webhookSecret) return false;
  const parts = String(signatureHeader).split(',').map(p => p.trim());
  const tsPart = parts.find(p => p.startsWith('t='));
  const sigParts = parts.filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  if (!tsPart || !sigParts.length) return false;
  const timestamp = Number(tsPart.slice(2));
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > toleranceSeconds) return false;

  const payload = Buffer.isBuffer(rawBody)
    ? `${timestamp}.${rawBody.toString('utf8')}`
    : `${timestamp}.${String(rawBody)}`;
  const expected = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');

  return sigParts.some(sig => {
    const sigBuf = Buffer.from(sig, 'utf8');
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

export function buildPayhereHash({ merchantId, orderId, amountFormatted, currency = 'LKR', merchantSecret }) {
  const secretHash = crypto.createHash('md5').update(String(merchantSecret || '')).digest('hex').toUpperCase();
  return crypto
    .createHash('md5')
    .update(`${merchantId}${orderId}${amountFormatted}${currency}${secretHash}`)
    .digest('hex')
    .toUpperCase();
}

export function verifyPayhereNotifySignature({ body, merchantSecret }) {
  if (!body || !merchantSecret) return false;
  const { merchant_id, order_id, payhere_amount, payhere_currency, status_code, md5sig } = body;
  if (!merchant_id || !order_id || !payhere_amount || !payhere_currency || status_code === undefined || !md5sig) {
    return false;
  }
  const secretHash = crypto.createHash('md5').update(String(merchantSecret)).digest('hex').toUpperCase();
  const localSig = crypto
    .createHash('md5')
    .update(`${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${secretHash}`)
    .digest('hex')
    .toUpperCase();
  const a = Buffer.from(localSig, 'utf8');
  const b = Buffer.from(String(md5sig).toUpperCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function runBillingLifecycleCycle({
  data,
  writeData,
  manageLxc,
  manageMinecraftServer,
  nowMs = Date.now()
}) {
  ensureBillingCollections(data);
  const requests = Array.isArray(data.hostingRequests) ? data.hostingRequests : [];
  let renewedCount = 0;
  let suspendedCount = 0;
  let pastDueCount = 0;
  let changed = false;

  for (const item of requests) {
    if (!item || item.billingType !== 'paid') continue;
    if (!['provisioned', 'suspended'].includes(item.status)) continue;
    const paidUntilMs = item.paidUntil ? new Date(item.paidUntil).getTime() : 0;
    if (!paidUntilMs || !Number.isFinite(paidUntilMs)) continue;

    const owner = data.users?.[item.userId];
    const cycle = BILLING_CYCLES[item.billingCycle] ? item.billingCycle : 'monthly';
    const recurringCents = Number(item.recurringCents || 0);

    // 1. Not expired yet -> check due soon
    if (paidUntilMs > nowMs) {
      const nextStatus = paidUntilMs - nowMs <= 3 * DAY_MS ? 'due_soon' : 'active';
      if (item.billingStatus !== nextStatus && item.status === 'provisioned') {
        item.billingStatus = nextStatus;
        changed = true;
      }
      continue;
    }

    // 2. Expired -> Try Auto-Renew from Wallet first if enabled and balance is sufficient
    if (item.autoRenew && owner && recurringCents > 0 && Number(owner.cashBalanceCents || 0) >= recurringCents) {
      owner.cashBalanceCents = Number(owner.cashBalanceCents || 0) - recurringCents;
      const newPaidUntil = calculateCycleEndIso(nowMs, cycle);
      const graceUntil = new Date(new Date(newPaidUntil).getTime() + GRACE_DAYS * DAY_MS).toISOString();

      const invoice = createInvoice({
        data,
        userId: item.userId,
        username: owner.username || item.username,
        type: 'server_renewal',
        items: [{ description: `Auto-Renewal: ${item.planName || item.service} (${cycle})`, amountCents: recurringCents }],
        subtotalCents: recurringCents,
        totalCents: recurringCents,
        paymentMethod: 'wallet',
        status: 'paid',
        serverId: item.id,
        note: `Automatic wallet renewal for ${item.hostname || item.displayName || item.id}`
      });
      recordTransaction({
        data,
        userId: item.userId,
        type: 'auto_renewal',
        direction: 'debit',
        amountCents: recurringCents,
        method: 'wallet',
        invoiceId: invoice.id,
        referenceId: item.id,
        description: `Auto-renewed ${item.planName || item.service} (${cycle})`
      });

      item.paidUntil = newPaidUntil;
      item.graceUntil = graceUntil;
      item.billingStatus = 'active';
      item.lastRenewedAt = new Date(nowMs).toISOString();
      item.updatedAt = item.lastRenewedAt;

      if (item.status === 'suspended' && item.suspendedReason === 'billing_overdue') {
        try {
          if (item.service === 'lxc' && Number.isInteger(Number(item.vmid)) && typeof manageLxc === 'function') {
            await manageLxc({ vmid: item.vmid, action: 'resume', node: item.nodeId });
          } else if (item.service === 'minecraft' && item.identifier && typeof manageMinecraftServer === 'function') {
            await manageMinecraftServer({ identifier: item.identifier, action: 'start' });
          }
          item.status = 'provisioned';
          item.provisioningStatus = item.service === 'minecraft' ? 'server-running' : 'container-running';
          delete item.suspendedReason;
        } catch (err) {
          console.error('[billing lifecycle] Resume after auto-renew failed:', item.id, err?.message || err);
        }
      }

      data.auditLogs.unshift({
        id: crypto.randomUUID(),
        actorId: 'system:billing',
        actorName: 'Billing Engine',
        actorRole: 'system',
        action: 'paid_server_auto_renewed',
        targetType: 'hosting_request',
        targetId: item.id,
        details: { userId: item.userId, recurringCents, invoiceId: invoice.id, newPaidUntil },
        createdAt: new Date(nowMs).toISOString()
      });
      renewedCount++;
      changed = true;
      continue;
    }

    // 3. Past due & grace period check -> suspend if grace expired
    const graceUntilMs = item.graceUntil
      ? new Date(item.graceUntil).getTime()
      : paidUntilMs + GRACE_DAYS * DAY_MS;

    if (nowMs < graceUntilMs) {
      if (item.billingStatus !== 'past_due') {
        item.billingStatus = 'past_due';
        item.graceUntil = new Date(graceUntilMs).toISOString();
        changed = true;
        pastDueCount++;
      }
      continue;
    }

    if (item.status !== 'suspended') {
      item.status = 'suspended';
      item.billingStatus = 'suspended_billing';
      item.suspendedReason = 'billing_overdue';
      item.provisioningStatus = item.service === 'minecraft' ? 'server-suspended-billing' : 'container-suspended-billing';
      item.updatedAt = new Date(nowMs).toISOString();

      try {
        if (item.service === 'lxc' && Number.isInteger(Number(item.vmid)) && typeof manageLxc === 'function') {
          await manageLxc({ vmid: item.vmid, action: 'suspend', node: item.nodeId });
        } else if (item.service === 'minecraft' && item.identifier && typeof manageMinecraftServer === 'function') {
          await manageMinecraftServer({ identifier: item.identifier, action: 'stop' });
        }
      } catch (err) {
        console.error('[billing lifecycle] Container suspend failed:', item.id, err?.message || err);
      }

      data.auditLogs.unshift({
        id: crypto.randomUUID(),
        actorId: 'system:billing',
        actorName: 'Billing Engine',
        actorRole: 'system',
        action: 'paid_server_suspended_overdue',
        targetType: 'hosting_request',
        targetId: item.id,
        details: { userId: item.userId, paidUntil: item.paidUntil, graceUntil: item.graceUntil },
        createdAt: new Date(nowMs).toISOString()
      });
      if (data.auditLogs.length > 5000) data.auditLogs.length = 5000;
      suspendedCount++;
      changed = true;
    }
  }

  if (changed && typeof writeData === 'function') {
    writeData();
  }
  return { renewedCount, pastDueCount, suspendedCount, checkedAt: new Date(nowMs).toISOString() };
}
