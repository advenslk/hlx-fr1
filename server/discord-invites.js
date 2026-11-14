const DISCORD_API_BASE = 'https://discord.com/api/v10';

export const INVITE_TIERS = [
  [2, 200],
  [4, 600],
  [8, 900],
  [12, 1300],
  [16, 1700],
  [24, 2400],
  [28, 2900],
  [34, 3400],
  [38, 4000],
  [42, 4500]
];

export function getEffectiveDiscordId(userId, user) {
  if (user && typeof user.discordId === 'string' && /^\d{15,22}$/.test(user.discordId)) {
    return user.discordId;
  }
  if (typeof userId === 'string' && /^\d{15,22}$/.test(userId)) {
    return userId;
  }
  return null;
}

export function findUserByDiscordId(users, discordId) {
  const idStr = String(discordId || '').trim();
  if (!idStr || !users || typeof users !== 'object') return null;

  // Prefer active web accounts (`usr_*`) over legacy Discord-keyed records if both ever existed
  const entries = Object.entries(users);
  for (const [id, u] of entries) {
    if (u && u.discordId === idStr && /^usr_/.test(id)) {
      return { id, user: u };
    }
  }
  for (const [id, u] of entries) {
    if (!u) continue;
    if (u.discordId === idStr || id === idStr) {
      return { id, user: u };
    }
  }
  return null;
}

export function isDiscordOnlyAccount(userId, user) {
  if (!user) return false;
  if (user.email || user.googleSub || user.passwordHash) return false;
  const providers = Array.isArray(user.authProviders) ? user.authProviders : [];
  if (providers.some(p => p === 'email' || p === 'google')) return false;
  return Boolean(!/^usr_/.test(String(userId || '')) || providers.every(p => p === 'discord'));
}

export function mergeDiscordAccountIntoUser({ data, sourceId, targetId }) {
  if (!data?.users?.[sourceId] || !data?.users?.[targetId] || sourceId === targetId) {
    return false;
  }
  const src = data.users[sourceId];
  const dst = data.users[targetId];

  const srcMilestones = Array.isArray(src.creditedMilestones) ? src.creditedMilestones : [];
  const dstMilestones = Array.isArray(dst.creditedMilestones) ? dst.creditedMilestones : [];
  dst.creditedMilestones = Array.from(new Set([...dstMilestones, ...srcMilestones]));

  dst.balance = (Number(dst.balance) || 0) + (Number(src.balance) || 0);
  dst.verifiedInvites = Math.max(Number(dst.verifiedInvites) || 0, Number(src.verifiedInvites) || 0);
  dst.activeBoosts = Math.max(Number(dst.activeBoosts) || 0, Number(src.activeBoosts) || 0);
  dst.discordInviteUses = Math.max(Number(dst.discordInviteUses) || 0, Number(src.discordInviteUses) || 0);
  dst.manualInviteBonus = Math.max(Number(dst.manualInviteBonus) || 0, Number(src.manualInviteBonus) || 0);

  if (!dst.discordInviteCode && src.discordInviteCode) dst.discordInviteCode = src.discordInviteCode;
  if (!dst.discordInviteUrl && src.discordInviteUrl) dst.discordInviteUrl = src.discordInviteUrl;
  if (!dst.referrer && src.referrer) dst.referrer = src.referrer;

  const srcTracked = Array.isArray(src.discordTrackedCodes) ? src.discordTrackedCodes : [];
  const dstTracked = Array.isArray(dst.discordTrackedCodes) ? dst.discordTrackedCodes : [];
  const seenCodes = new Set(dstTracked.map(x => x?.code).filter(Boolean));
  for (const item of srcTracked) {
    if (item?.code && !seenCodes.has(item.code)) {
      dstTracked.push(item);
      seenCodes.add(item.code);
    }
  }
  dst.discordTrackedCodes = dstTracked;

  for (const req of data.hostingRequests || []) {
    if (req && req.userId === sourceId) req.userId = targetId;
  }
  for (const t of data.tickets || []) {
    if (t && t.userId === sourceId) t.userId = targetId;
  }
  for (const c of data.claims || []) {
    if (c && c.userId === sourceId) c.userId = targetId;
  }
  for (const ic of data.inviteClaims || []) {
    if (ic && ic.referrerId === sourceId) ic.referrerId = targetId;
  }

  delete data.users[sourceId];
  return true;
}

export function resolveDiscordCdnAvatar(discordId, avatarValue) {
  if (!discordId || !avatarValue) return null;
  const val = String(avatarValue).trim();
  if (/^https?:\/\//i.test(val)) return val;
  const ext = val.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${discordId}/${val}.${ext}?size=128`;
}

export function extractDiscordInviteCode(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) return null;

  // Match full URLs like https://discord.gg/abc123 or https://discord.com/invite/abc123
  const urlMatch = raw.match(/(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,32})/i);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Match raw invite code
  const clean = raw.replace(/^\/+|\/+$/g, '');
  if (/^[A-Za-z0-9-]{2,32}$/.test(clean)) {
    return clean;
  }

  return null;
}

export function buildServerInviteUrl(code) {
  const clean = extractDiscordInviteCode(code);
  return clean ? `https://discord.gg/${clean}` : null;
}

export function getDiscordInviteConfig(env = process.env) {
  const guildId = String(env.DISCORD_GUILD_ID || '').trim();
  const botToken = String(env.DISCORD_BOT_TOKEN || '').trim();
  const inviteChannelId = String(env.DISCORD_INVITE_CHANNEL_ID || '').trim();
  const rawServerUrl = String(env.DISCORD_SERVER_INVITE_URL || '').trim();
  const serverInviteUrl = rawServerUrl
    ? (/^https?:\/\//i.test(rawServerUrl) ? rawServerUrl : buildServerInviteUrl(rawServerUrl))
    : null;

  return {
    guildId,
    botToken,
    inviteChannelId,
    guildConfigured: Boolean(guildId),
    botConfigured: Boolean(guildId && botToken),
    serverInviteUrl
  };
}

export function calculateHzlEarnedFromInvites(creditedMilestones = [], tiers = INVITE_TIERS) {
  const set = new Set(Array.isArray(creditedMilestones) ? creditedMilestones : []);
  let total = 0;
  for (const [count, amount] of tiers) {
    if (set.has(`invite:${count}`)) {
      total += Number(amount) || 0;
    }
  }
  return total;
}

export function calculateNextInviteTier(verifiedInvites = 0, tiers = INVITE_TIERS) {
  const countNum = Math.max(0, Number(verifiedInvites) || 0);
  const next = tiers.find(([reqCount]) => countNum < reqCount);
  if (!next) return null;
  const [targetCount, rewardAmount] = next;
  const prevTier = [...tiers].reverse().find(([reqCount]) => reqCount <= countNum);
  const floor = prevTier ? prevTier[0] : 0;
  const span = Math.max(1, targetCount - floor);
  const progressPct = Math.min(100, Math.max(0, Math.round(((countNum - floor) / span) * 100)));
  return {
    count: targetCount,
    amount: rewardAmount,
    remaining: Math.max(0, targetCount - countNum),
    progressPct
  };
}

export function buildInviteSummary({ userId, user, data, env = process.env }) {
  const cfg = getDiscordInviteConfig(env);
  const discordId = getEffectiveDiscordId(userId, user);
  const discordLinked = Boolean(discordId);
  const verifiedInvites = Math.max(0, Number(user?.verifiedInvites) || 0);
  const discordInviteUses = Math.max(0, Number(user?.discordInviteUses) || 0);
  const creditedMilestones = Array.isArray(user?.creditedMilestones) ? user.creditedMilestones : [];
  const allClaims = Array.isArray(data?.inviteClaims) ? data.inviteClaims : [];
  const userClaims = allClaims
    .filter(c => c.referrerId === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 12)
    .map(c => ({
      id: c.id,
      type: c.type || 'referral',
      inviteCode: c.inviteCode || null,
      claimedCount: Number(c.claimedCount || 1),
      inviteeUsername: c.inviteeUsername || null,
      status: c.status || 'pending',
      note: c.note || null,
      createdAt: c.createdAt,
      reviewedAt: c.reviewedAt || null
    }));

  const pendingInvites = allClaims.filter(c => c.referrerId === userId && c.status === 'pending').length;
  const discordUsername = discordLinked
    ? (user?.discordUsername || (!/^usr_/.test(String(userId || '')) ? user?.username : null) || null)
    : null;
  const discordGlobalName = discordLinked
    ? (user?.discordGlobalName || (!/^usr_/.test(String(userId || '')) ? user?.global_name : null) || discordUsername)
    : null;
  const discordAvatar = discordLinked
    ? resolveDiscordCdnAvatar(discordId, user?.discordAvatar || (!/^usr_/.test(String(userId || '')) ? user?.avatar : null))
    : null;
  const discordInviteCode = user?.discordInviteCode || null;
  const discordInviteUrl = user?.discordInviteUrl || (discordInviteCode ? buildServerInviteUrl(discordInviteCode) : null);

  return {
    guildConfigured: cfg.guildConfigured,
    botConfigured: cfg.botConfigured,
    rewardsApiConfigured: Boolean(env.REWARDS_API_URL && env.REWARDS_API_TOKEN),
    serverInviteUrl: cfg.serverInviteUrl,
    discordLinked,
    discordId,
    discordUsername,
    discordGlobalName,
    discordAvatar,
    discordInGuild: Boolean(user?.discordInGuild),
    discordLinkedAt: user?.discordLinkedAt || null,
    discordInviteCode,
    discordInviteUrl,
    discordInviteUses,
    discordTrackedCodes: Array.isArray(user?.discordTrackedCodes) ? user.discordTrackedCodes : [],
    discordLastSyncedAt: user?.discordLastSyncedAt || null,
    discordSyncError: user?.discordSyncError || null,
    verifiedInvites,
    pendingInvites,
    creditedMilestones,
    hzlEarnedFromInvites: calculateHzlEarnedFromInvites(creditedMilestones),
    nextTier: calculateNextInviteTier(verifiedInvites),
    inviteTiers: INVITE_TIERS,
    claims: userClaims,
    referralCode: userId,
    referralUrl: `${String(env.APP_URL || 'https://perks.helzerx.cyou').replace(/\/+$/, '')}/?ref=${encodeURIComponent(userId)}`
  };
}

async function discordBotRequest(endpoint, { method = 'GET', body, headers = {}, botToken }, fetchImpl = fetch) {
  const res = await fetchImpl(`${DISCORD_API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bot ${botToken}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000)
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const err = new Error(json?.message || `Discord API returned HTTP ${res.status}`);
    err.status = res.status;
    err.discordCode = json?.code;
    throw err;
  }
  return json;
}

export async function resolveTargetInviteChannelId({ guildId, configuredChannelId, botToken }, fetchImpl = fetch) {
  if (configuredChannelId && /^\d{15,22}$/.test(configuredChannelId)) {
    return configuredChannelId;
  }
  const channels = await discordBotRequest(`/guilds/${guildId}/channels`, { botToken }, fetchImpl);
  if (!Array.isArray(channels) || !channels.length) {
    throw new Error('No channels found on the configured Discord server.');
  }
  const textChannels = channels
    .filter(c => c && (c.type === 0 || c.type === 5))
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0));

  if (!textChannels.length) {
    throw new Error('No text channel available to generate a Discord server invite.');
  }

  const preferred = textChannels.find(c => /^(welcome|rules|general|lobby|invite|chat)/i.test(String(c.name || '')));
  return (preferred || textChannels[0]).id;
}

export async function createGuildInviteForMember({ guildId, channelId, botToken, discordId, username }, fetchImpl = fetch) {
  const reason = `HelzerX invite link created for Discord user ${username || discordId} (${discordId})`;
  const inv = await discordBotRequest(
    `/channels/${channelId}/invites`,
    {
      method: 'POST',
      botToken,
      headers: { 'X-Audit-Log-Reason': encodeURIComponent(reason).slice(0, 200) },
      body: {
        max_age: 0,
        max_uses: 0,
        temporary: false,
        unique: true
      }
    },
    fetchImpl
  );

  if (!inv?.code) {
    throw new Error('Discord did not return an invite code.');
  }

  return {
    code: inv.code,
    url: `https://discord.gg/${inv.code}`,
    channelId: inv.channel?.id || channelId,
    channelName: inv.channel?.name || 'server-invite',
    uses: Number(inv.uses || 0),
    createdAt: inv.created_at || new Date().toISOString()
  };
}

export async function checkGuildMember({ guildId, botToken, discordId }, fetchImpl = fetch) {
  if (!guildId || !botToken || !discordId) return null;
  try {
    const member = await discordBotRequest(`/guilds/${guildId}/members/${discordId}`, { botToken }, fetchImpl);
    return {
      inGuild: true,
      joinedAt: member?.joined_at || null,
      nick: member?.nick || null
    };
  } catch (err) {
    if (err.status === 404) {
      return { inGuild: false, joinedAt: null, nick: null };
    }
    throw err;
  }
}

export async function fetchGuildInviteSnapshot({ guildId, botToken, discordId, registeredCode, knownCodes = [] }, fetchImpl = fetch) {
  let guildInvites;
  try {
    guildInvites = await discordBotRequest(`/guilds/${guildId}/invites`, { botToken }, fetchImpl);
  } catch (err) {
    if (err.status === 403) {
      const permErr = new Error('Discord Bot lacks "Manage Server" permission on the Discord server, so live invite counts cannot be read automatically.');
      permErr.status = 403;
      throw permErr;
    }
    if (err.status === 401) {
      const authErr = new Error('Server DISCORD_BOT_TOKEN is invalid or revoked.');
      authErr.status = 401;
      throw authErr;
    }
    throw err;
  }

  const memberStatus = await checkGuildMember({ guildId, botToken, discordId }, fetchImpl).catch(() => null);
  const codeSet = new Set(
    [registeredCode, ...(Array.isArray(knownCodes) ? knownCodes : [])]
      .map(c => (typeof c === 'string' ? c.trim() : ''))
      .filter(Boolean)
  );

  const list = Array.isArray(guildInvites) ? guildInvites : [];
  const matched = list.filter(inv => {
    if (!inv || !inv.code) return false;
    const isInviter = discordId && inv.inviter?.id === discordId;
    const isKnownCode = codeSet.has(inv.code);
    return Boolean(isInviter || isKnownCode);
  });

  const trackedInvites = matched.map(inv => ({
    code: inv.code,
    url: `https://discord.gg/${inv.code}`,
    uses: Math.max(0, Number(inv.uses) || 0),
    maxUses: Number(inv.max_uses) || 0,
    channelId: inv.channel?.id || null,
    channelName: inv.channel?.name || 'channel',
    inviterId: inv.inviter?.id || null,
    createdAt: inv.created_at || null
  }));

  const totalUses = trackedInvites.reduce((sum, inv) => sum + inv.uses, 0);
  const registeredCodeActive = Boolean(registeredCode && trackedInvites.some(inv => inv.code === registeredCode));

  return {
    inGuild: memberStatus ? memberStatus.inGuild : null,
    totalUses,
    trackedInvites,
    registeredCodeActive
  };
}
