import crypto from 'node:crypto';
import QRCode from 'qrcode';

const COMMON_WEAK_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'password123!', '12345678', '123456789',
  '1234567890', 'qwerty123', 'qwertyuiop', 'admin123', 'admin1234', 'letmein123',
  'welcome123', 'helzerx123', 'helzerx2026', 'iloveyou1', 'monkey123', 'dragon123',
  'changeme1', 'abc123456', 'p@ssw0rd', 'p@ssword1'
]);

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'temp-mail.org',
  'tempmail.com', 'yopmail.com', 'trashmail.com', 'throwawaymail.com',
  'sharklasers.com', 'getnada.com', 'dispostable.com', 'mintemail.com'
]);

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function normalizeEmail(rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email || email.length > 254 || /[\x00-\x20\x7f<>()[\]\\,;:]/.test(email)) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  const parts = email.split('@');
  if (parts.length !== 2) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  const [local, domain] = parts;
  if (!local || local.length > 64 || !domain || domain.length > 253 || !domain.includes('.')) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..') || domain.startsWith('.') || domain.includes('..')) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, error: 'Disposable temporary email addresses are not permitted for security reasons.' };
  }

  let canonicalLocal = local;
  let canonicalDomain = domain;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    canonicalDomain = 'gmail.com';
    canonicalLocal = local.split('+')[0].replace(/\./g, '');
  } else {
    canonicalLocal = local.split('+')[0];
  }

  return {
    valid: true,
    email,
    canonicalEmail: `${canonicalLocal}@${canonicalDomain}`,
    isGmail: canonicalDomain === 'gmail.com',
    domain
  };
}

export function validatePasswordStrength(password, context = {}) {
  const pwd = String(password || '');
  const errors = [];

  if (pwd.length < 10) errors.push('At least 10 characters');
  if (pwd.length > 128) errors.push('Maximum 128 characters');
  if (/[\x00-\x1f\x7f]/.test(pwd)) errors.push('No control characters');
  if (!/[a-z]/.test(pwd)) errors.push('At least one lowercase letter');
  if (!/[A-Z]/.test(pwd)) errors.push('At least one uppercase letter');
  if (!/[0-9]/.test(pwd)) errors.push('At least one number');
  if (!/[^A-Za-z0-9]/.test(pwd)) errors.push('At least one special symbol (!@#$%^&*)');

  const lowered = pwd.toLowerCase();
  if (COMMON_WEAK_PASSWORDS.has(lowered)) {
    errors.push('Choose a less common password');
  }

  const emailLocal = String(context.email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  if (emailLocal.length >= 4 && lowered.includes(emailLocal)) {
    errors.push('Password cannot contain your email username');
  }

  const nameTokens = String(context.name || '').toLowerCase().split(/\s+/).filter(t => t.length >= 4);
  if (nameTokens.some(token => lowered.includes(token))) {
    errors.push('Password cannot contain your name');
  }

  let score = 0;
  if (pwd.length >= 10) score++;
  if (pwd.length >= 14) score++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;

  return {
    valid: errors.length === 0,
    score: Math.min(4, score),
    errors
  };
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };

export function hashPassword(password, providedSalt) {
  const salt = providedSalt || crypto.randomBytes(32).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64, SCRYPT_PARAMS).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, storedHash, storedSalt) {
  if (!password || !storedHash || !storedSalt) return false;
  try {
    const derived = crypto.scryptSync(String(password), String(storedSalt), 64, SCRYPT_PARAMS);
    const expected = Buffer.from(String(storedHash), 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function safeTimingEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// RFC 6238 TOTP (30s period, 6 digits, HMAC-SHA1)
export function generateTotpSecret() {
  const bytes = crypto.randomBytes(20);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(base32) {
  const clean = String(base32 || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(secret, stepCounter) {
  const key = decodeBase32(secret);
  const counter = Buffer.alloc(8);
  const step = Number.isInteger(stepCounter) ? stepCounter : Math.floor(Date.now() / 30000);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

export function verifyTotpToken(secret, token, lastUsedStep = null, windowSteps = 1) {
  const clean = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean) || !secret) {
    return { valid: false, step: null };
  }
  const currentStep = Math.floor(Date.now() / 30000);
  for (let delta = -windowSteps; delta <= windowSteps; delta++) {
    const step = currentStep + delta;
    if (lastUsedStep !== null && lastUsedStep !== undefined && step <= Number(lastUsedStep)) {
      continue;
    }
    const candidate = generateTotpCode(secret, step);
    if (safeTimingEqual(clean, candidate)) {
      return { valid: true, step };
    }
  }
  return { valid: false, step: null };
}

export async function buildTotpSetupPayload({ secret, accountLabel, issuer = 'HelzerX Cloud' }) {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const otpauthUrl = `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
    width: 220,
    margin: 2,
    color: {
      dark: '#09090d',
      light: '#ffffff'
    }
  });
  return { otpauthUrl, qrDataUrl };
}

export function generateBackupCodes(count = 8) {
  const plainCodes = [];
  const hashedCodes = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    const salt = crypto.randomBytes(8).toString('hex');
    const digest = crypto.createHash('sha256').update(`${salt}:${formatted}`).digest('hex');
    plainCodes.push(formatted);
    hashedCodes.push({ id: crypto.randomUUID(), salt, digest, usedAt: null });
  }
  return { plainCodes, hashedCodes };
}

export function consumeBackupCode(storedHashes, inputCode) {
  if (!Array.isArray(storedHashes)) return { valid: false };
  const normalized = String(inputCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.length !== 8) return { valid: false };
  const formatted = `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}`;

  for (const entry of storedHashes) {
    if (!entry || entry.usedAt || !entry.salt || !entry.digest) continue;
    const candidate = crypto.createHash('sha256').update(`${entry.salt}:${formatted}`).digest('hex');
    if (safeTimingEqual(candidate, entry.digest)) {
      entry.usedAt = new Date().toISOString();
      return { valid: true, entryId: entry.id };
    }
  }
  return { valid: false };
}

export function createAuthRateLimiter({ windowMs, maxAttempts, blockDurationMs }) {
  const buckets = new Map();

  function prune(now) {
    if (buckets.size > 5000) {
      for (const [key, entry] of buckets) {
        if (entry.blockedUntil <= now && now - entry.startedAt > windowMs) {
          buckets.delete(key);
        }
      }
    }
  }

  return {
    check(key) {
      const now = Date.now();
      prune(now);
      const entry = buckets.get(key);
      if (!entry) return { allowed: true, retryAfterSeconds: 0 };
      if (entry.blockedUntil > now) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000))
        };
      }
      if (now - entry.startedAt > windowMs) {
        buckets.delete(key);
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (entry.count >= maxAttempts) {
        entry.blockedUntil = now + blockDurationMs;
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil(blockDurationMs / 1000))
        };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
    recordFailure(key) {
      const now = Date.now();
      let entry = buckets.get(key);
      if (!entry || now - entry.startedAt > windowMs) {
        entry = { startedAt: now, count: 0, blockedUntil: 0 };
      }
      entry.count += 1;
      if (entry.count >= maxAttempts) {
        entry.blockedUntil = now + blockDurationMs;
      }
      buckets.set(key, entry);
      return {
        attemptsRemaining: Math.max(0, maxAttempts - entry.count),
        blockedUntil: entry.blockedUntil
      };
    },
    reset(key) {
      buckets.delete(key);
    }
  };
}

export function buildPkceChallenge() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function summarizeUserAgent(uaRaw) {
  const ua = String(uaRaw || '');
  if (!ua) return 'Unknown device';
  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
  else if (ua.includes('curl/')) browser = 'CLI';

  let os = 'Desktop';
  if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return `${browser} · ${os}`;
}

export function recordSecurityEvent(userRecord, req, type, summary, status = 'info') {
  if (!userRecord) return;
  if (!Array.isArray(userRecord.securityEvents)) userRecord.securityEvents = [];
  const ip = String(req?.ip || req?.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '');
  const maskedIp = ip.includes('.')
    ? ip.split('.').slice(0, 3).join('.') + '.xxx'
    : (ip.length > 10 ? ip.slice(0, 10) + '…' : ip);

  userRecord.securityEvents.unshift({
    id: crypto.randomUUID(),
    type,
    status,
    summary,
    device: summarizeUserAgent(req?.get?.('user-agent')),
    ip: maskedIp,
    createdAt: new Date().toISOString()
  });
  if (userRecord.securityEvents.length > 30) {
    userRecord.securityEvents.length = 30;
  }
}

export function resolveGoogleOAuthConfig(req) {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const baseAppUrl = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  const requestOrigin = req ? `${req.protocol}://${req.get('host')}` : '';
  const redirectUri = String(
    process.env.GOOGLE_REDIRECT_URI ||
    (baseAppUrl ? `${baseAppUrl}/api/auth/google/callback` : (requestOrigin ? `${requestOrigin}/api/auth/google/callback` : ''))
  ).trim();
  return {
    configured: Boolean(clientId && clientSecret && redirectUri),
    clientId,
    clientSecret,
    redirectUri
  };
}
