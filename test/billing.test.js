import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  DAY_MS,
  normalizePlanBilling,
  getCyclePriceCents,
  validatePromoCode,
  calculateHzlDiscountCents,
  getPaidUpgradeDeltaCents,
  verifyStripeWebhookSignature,
  buildPayhereHash,
  verifyPayhereNotifySignature,
  runBillingLifecycleCycle
} from '../server/billing.js';

test('normalizePlanBilling & getCyclePriceCents generate consistent cycle tiers', () => {
  const plan = normalizePlanBilling({ id: 'starter', service: 'lxc', name: 'Starter', cost: 500 });
  assert.equal(plan.billingMode, 'both');
  assert.equal(plan.paidPricing.monthlyCents, 299);
  assert.equal(getCyclePriceCents(plan, 'monthly'), 299);
  assert.equal(getCyclePriceCents(plan, 'quarterly'), Math.round(299 * 3 * 0.9));
  assert.equal(getCyclePriceCents(plan, 'yearly'), Math.round(299 * 12 * 0.8));

  const custom = normalizePlanBilling({
    id: 'enterprise-lxc',
    service: 'lxc',
    name: 'Enterprise LXC',
    cost: 4000,
    billingMode: 'paid',
    paidPricing: { monthlyCents: 1999, quarterlyCents: 5399, yearlyCents: 19199 }
  });
  assert.equal(custom.billingMode, 'paid');
  assert.equal(getCyclePriceCents(custom, 'monthly'), 1999);
  assert.equal(getCyclePriceCents(custom, 'quarterly'), 5399);
  assert.equal(getCyclePriceCents(custom, 'yearly'), 19199);
});

test('validatePromoCode validates percent, fixed, service scope, expiry, and usage limits', () => {
  const now = Date.now();
  const data = {
    promoCodes: [
      { id: 'p1', code: 'LAUNCH25', discountType: 'percent', value: 25, service: 'all', maxUses: 10, usedCount: 2, enabled: true },
      { id: 'p2', code: 'LXC200', discountType: 'fixed', value: 200, service: 'lxc', maxUses: 5, usedCount: 0, enabled: true },
      { id: 'p3', code: 'EXPIRED', discountType: 'percent', value: 10, service: 'all', expiresAt: new Date(now - 60_000).toISOString(), enabled: true },
      { id: 'p4', code: 'MAXED', discountType: 'percent', value: 15, service: 'all', maxUses: 2, usedCount: 2, enabled: true },
      { id: 'p5', code: 'OFF', discountType: 'percent', value: 20, service: 'all', enabled: false }
    ]
  };

  const okPercent = validatePromoCode({ data, code: ' launch25 ', subtotalCents: 1000, service: 'minecraft', nowMs: now });
  assert.equal(okPercent.valid, true);
  assert.equal(okPercent.discountCents, 250);

  const wrongService = validatePromoCode({ data, code: 'LXC200', subtotalCents: 1000, service: 'minecraft', nowMs: now });
  assert.equal(wrongService.valid, false);

  const okFixed = validatePromoCode({ data, code: 'LXC200', subtotalCents: 1000, service: 'lxc', nowMs: now });
  assert.equal(okFixed.valid, true);
  assert.equal(okFixed.discountCents, 200);

  assert.equal(validatePromoCode({ data, code: 'EXPIRED', subtotalCents: 1000, nowMs: now }).valid, false);
  assert.equal(validatePromoCode({ data, code: 'MAXED', subtotalCents: 1000, nowMs: now }).valid, false);
  assert.equal(validatePromoCode({ data, code: 'OFF', subtotalCents: 1000, nowMs: now }).valid, false);
});

test('calculateHzlDiscountCents caps offset at 50% and uses 1000 HZL = $1.00', () => {
  const capped = calculateHzlDiscountCents({ userHzlBalance: 50000, useHzlCredit: true, remainingCents: 1000 });
  assert.equal(capped.hzlDiscountCents, 500);
  assert.equal(capped.hzlUsed, 5000);

  const balanceLimited = calculateHzlDiscountCents({ userHzlBalance: 2500, useHzlCredit: true, remainingCents: 1000 });
  assert.equal(balanceLimited.hzlDiscountCents, 250);
  assert.equal(balanceLimited.hzlUsed, 2500);

  const disabled = calculateHzlDiscountCents({ userHzlBalance: 50000, useHzlCredit: false, remainingCents: 1000 });
  assert.equal(disabled.hzlDiscountCents, 0);
  assert.equal(disabled.hzlUsed, 0);
});

test('getPaidUpgradeDeltaCents computes prorated delta and blocks downgrades', () => {
  const now = Date.now();
  const starter = normalizePlanBilling({ id: 'starter', service: 'lxc', cost: 500, paidPricing: { monthlyCents: 500, quarterlyCents: 1350, yearlyCents: 4800 } });
  const pro = normalizePlanBilling({ id: 'pro', service: 'lxc', cost: 2000, paidPricing: { monthlyCents: 1500, quarterlyCents: 4050, yearlyCents: 14400 } });

  const downgrade = getPaidUpgradeDeltaCents({
    currentPlan: pro,
    targetPlan: starter,
    server: { billingCycle: 'monthly', recurringCents: 1500, paidUntil: new Date(now + 15 * DAY_MS).toISOString() },
    nowMs: now
  });
  assert.equal(downgrade.allowed, false);

  const upgrade = getPaidUpgradeDeltaCents({
    currentPlan: starter,
    targetPlan: pro,
    server: { billingCycle: 'monthly', recurringCents: 500, paidUntil: new Date(now + 15 * DAY_MS).toISOString() },
    nowMs: now
  });
  assert.equal(upgrade.allowed, true);
  assert.equal(upgrade.upgradeDeltaCents, 500); // half cycle of ($15 - $5) = $5.00
});

test('verifyStripeWebhookSignature validates HMAC-SHA256 signatures and rejects invalid/stale timestamps', () => {
  const secret = 'whsec_test_secret_123';
  const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

  assert.equal(verifyStripeWebhookSignature({ rawBody: body, signatureHeader: `t=${ts},v1=${sig}`, webhookSecret: secret }), true);
  assert.equal(verifyStripeWebhookSignature({ rawBody: body, signatureHeader: `t=${ts},v1=${'0'.repeat(sig.length)}`, webhookSecret: secret }), false);

  const oldTs = ts - 600;
  const oldSig = crypto.createHmac('sha256', secret).update(`${oldTs}.${body}`).digest('hex');
  assert.equal(verifyStripeWebhookSignature({ rawBody: body, signatureHeader: `t=${oldTs},v1=${oldSig}`, webhookSecret: secret }), false);
});

test('buildPayhereHash & verifyPayhereNotifySignature compute and verify MD5 signatures', () => {
  const merchantId = '1210001';
  const merchantSecret = 'payhere_secret_test';
  const orderId = 'ORD-991';
  const amountFormatted = '1500.00';
  const currency = 'LKR';

  const checkoutHash = buildPayhereHash({ merchantId, orderId, amountFormatted, currency, merchantSecret });
  assert.equal(checkoutHash.length, 32);

  const secretHash = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
  const statusCode = '2';
  const md5sig = crypto
    .createHash('md5')
    .update(`${merchantId}${orderId}${amountFormatted}${currency}${statusCode}${secretHash}`)
    .digest('hex')
    .toUpperCase();

  assert.equal(
    verifyPayhereNotifySignature({
      body: { merchant_id: merchantId, order_id: orderId, payhere_amount: amountFormatted, payhere_currency: currency, status_code: statusCode, md5sig },
      merchantSecret
    }),
    true
  );
  assert.equal(
    verifyPayhereNotifySignature({
      body: { merchant_id: merchantId, order_id: orderId, payhere_amount: amountFormatted, payhere_currency: currency, status_code: statusCode, md5sig: 'BADSIG' },
      merchantSecret
    }),
    false
  );
});

test('runBillingLifecycleCycle handles auto-renewal, grace past_due, and overdue suspension', async () => {
  const now = Date.now();
  const lxcActions = [];
  const data = {
    users: {
      u1: { username: 'AutoUser', cashBalanceCents: 1000, balance: 0 },
      u2: { username: 'GraceUser', cashBalanceCents: 0, balance: 0 },
      u3: { username: 'OverdueUser', cashBalanceCents: 0, balance: 0 }
    },
    hostingRequests: [
      {
        id: 'srv_auto',
        userId: 'u1',
        username: 'AutoUser',
        service: 'lxc',
        vmid: 101,
        nodeId: 'pve1',
        planName: 'Pro LXC',
        billingType: 'paid',
        billingCycle: 'monthly',
        recurringCents: 499,
        autoRenew: true,
        status: 'suspended',
        suspendedReason: 'billing_overdue',
        paidUntil: new Date(now - 60_000).toISOString()
      },
      {
        id: 'srv_grace',
        userId: 'u2',
        username: 'GraceUser',
        service: 'lxc',
        vmid: 102,
        planName: 'Starter LXC',
        billingType: 'paid',
        billingCycle: 'monthly',
        recurringCents: 299,
        autoRenew: false,
        status: 'provisioned',
        paidUntil: new Date(now - DAY_MS).toISOString(),
        graceUntil: new Date(now + 2 * DAY_MS).toISOString()
      },
      {
        id: 'srv_suspend',
        userId: 'u3',
        username: 'OverdueUser',
        service: 'lxc',
        vmid: 103,
        nodeId: 'pve1',
        planName: 'Starter LXC',
        billingType: 'paid',
        billingCycle: 'monthly',
        recurringCents: 299,
        autoRenew: false,
        status: 'provisioned',
        paidUntil: new Date(now - 5 * DAY_MS).toISOString(),
        graceUntil: new Date(now - 60_000).toISOString()
      }
    ],
    invoices: [],
    transactions: [],
    topupRequests: [],
    promoCodes: [],
    auditLogs: []
  };

  let wrote = false;
  const summary = await runBillingLifecycleCycle({
    data,
    writeData: () => { wrote = true; },
    manageLxc: async args => { lxcActions.push(args); },
    manageMinecraftServer: async () => {},
    nowMs: now
  });

  assert.equal(wrote, true);
  assert.equal(summary.renewedCount, 1);
  assert.equal(summary.pastDueCount, 1);
  assert.equal(summary.suspendedCount, 1);

  assert.equal(data.users.u1.cashBalanceCents, 501);
  assert.equal(data.hostingRequests[0].status, 'provisioned');
  assert.equal(data.hostingRequests[0].billingStatus, 'active');
  assert.equal(data.invoices.length, 1);
  assert.equal(data.transactions.length, 1);

  assert.equal(data.hostingRequests[1].status, 'provisioned');
  assert.equal(data.hostingRequests[1].billingStatus, 'past_due');

  assert.equal(data.hostingRequests[2].status, 'suspended');
  assert.equal(data.hostingRequests[2].suspendedReason, 'billing_overdue');

  assert.deepEqual(lxcActions, [
    { vmid: 101, action: 'resume', node: 'pve1' },
    { vmid: 103, action: 'suspend', node: 'pve1' }
  ]);
});

test('billing routes and admin billing UI are wired', () => {
  const serverSrc = fs.readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  for (const route of [
    '/api/billing/summary',
    '/api/billing/checkout',
    '/api/billing/topup/manual',
    '/api/billing/topup/stripe',
    '/api/billing/topup/payhere',
    '/api/billing/webhooks/stripe',
    '/api/billing/webhooks/payhere',
    '/api/admin/billing/overview',
    '/api/admin/billing/topups/:id/review',
    '/api/admin/billing/promos'
  ]) {
    assert.ok(serverSrc.includes(route), 'missing billing route: ' + route);
  }

  const adminHtml = fs.readFileSync(new URL('../private/admin.html', import.meta.url), 'utf8');
  assert.ok(adminHtml.includes('data-view="billing"'));
  assert.ok(adminHtml.includes('/api/admin/billing/overview'));
  assert.ok(adminHtml.includes('/api/admin/users/'));
});
