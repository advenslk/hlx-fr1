import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeEmail,
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
  generateTotpSecret,
  generateTotpCode,
  verifyTotpToken,
  buildTotpSetupPayload,
  generateBackupCodes,
  consumeBackupCode,
  createAuthRateLimiter,
  buildPkceChallenge
} from '../server/auth-security.js';

test('normalizeEmail canonicalizes Gmail dots and plus tags and blocks disposable domains', () => {
  const a = normalizeEmail('  John.Doe+vps1@gmail.com ');
  const b = normalizeEmail('johndoe@googlemail.com');
  assert.equal(a.valid, true);
  assert.equal(b.valid, true);
  assert.equal(a.canonicalEmail, 'johndoe@gmail.com');
  assert.equal(a.canonicalEmail, b.canonicalEmail);
  assert.equal(a.isGmail, true);

  const disp = normalizeEmail('spam@mailinator.com');
  assert.equal(disp.valid, false);
});

test('validatePasswordStrength enforces high security complexity and rejects weak or personal passwords', () => {
  const weak = validatePasswordStrength('password123', { email: 'kavindu@gmail.com', name: 'Kavindu' });
  assert.equal(weak.valid, false);

  const personal = validatePasswordStrength('Kavindu#2026!', { email: 'kavindu@gmail.com', name: 'Kavindu' });
  assert.equal(personal.valid, false);

  const strong = validatePasswordStrength('HxCloud!9482#Zx', { email: 'kavindu@gmail.com', name: 'Kavindu' });
  assert.equal(strong.valid, true);
  assert.ok(strong.score >= 3);
});

test('scrypt password hashing and timing-safe verification round-trips properly', () => {
  const { salt, hash } = hashPassword('HxCloud!9482#Zx');
  assert.equal(salt.length, 64);
  assert.equal(hash.length, 128);
  assert.equal(verifyPassword('HxCloud!9482#Zx', hash, salt), true);
  assert.equal(verifyPassword('WrongPassword!99', hash, salt), false);
});

test('TOTP RFC 6238 verifies valid 6-digit tokens, generates QR data URL, and prevents replay attacks', async () => {
  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);

  const payload = await buildTotpSetupPayload({ secret, accountLabel: 'user@gmail.com' });
  assert.ok(payload.otpauthUrl.startsWith('otpauth://totp/'));
  assert.ok(payload.qrDataUrl.startsWith('data:image/png;base64,'));

  const currentStep = Math.floor(Date.now() / 30000);
  const code = generateTotpCode(secret, currentStep);
  assert.match(code, /^\d{6}$/);

  const first = verifyTotpToken(secret, code, null, 1);
  assert.equal(first.valid, true);
  assert.equal(first.step, currentStep);

  // Replay with same step must fail
  const replay = verifyTotpToken(secret, code, first.step, 1);
  assert.equal(replay.valid, false);
});

test('backup recovery codes are single-use and hashed', () => {
  const { plainCodes, hashedCodes } = generateBackupCodes(8);
  assert.equal(plainCodes.length, 8);
  assert.equal(hashedCodes.length, 8);

  const firstUse = consumeBackupCode(hashedCodes, plainCodes[0]);
  assert.equal(firstUse.valid, true);

  const secondUse = consumeBackupCode(hashedCodes, plainCodes[0]);
  assert.equal(secondUse.valid, false);
});

test('rate limiter blocks after max failures and resets on success', () => {
  const limiter = createAuthRateLimiter({ windowMs: 60000, maxAttempts: 3, blockDurationMs: 60000 });
  assert.equal(limiter.check('ip:1').allowed, true);
  limiter.recordFailure('ip:1');
  limiter.recordFailure('ip:1');
  assert.equal(limiter.check('ip:1').allowed, true);
  limiter.recordFailure('ip:1');
  assert.equal(limiter.check('ip:1').allowed, false);
  limiter.reset('ip:1');
  assert.equal(limiter.check('ip:1').allowed, true);
});

test('PKCE challenge generates S256 verifier and challenge and server exposes security routes', () => {
  const pkce = buildPkceChallenge();
  assert.ok(pkce.verifier.length >= 32);
  assert.ok(pkce.challenge.length >= 32);

  const serverSrc = fs.readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  for (const route of [
    '/api/auth/providers',
    '/api/auth/google/url',
    '/api/auth/google/callback',
    '/api/auth/discord/url',
    '/api/auth/register',
    '/api/auth/login',
    '/api/auth/2fa/login-verify',
    '/api/auth/security',
    '/api/auth/2fa/setup',
    '/api/auth/2fa/enable',
    '/api/auth/2fa/disable',
    '/api/auth/password/change',
    '/api/auth/sessions/revoke-all'
  ]) {
    assert.ok(serverSrc.includes(route), 'missing auth route: ' + route);
  }
});
