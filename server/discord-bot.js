import {
  getDiscordInviteConfig,
  findUserByDiscordId,
  fetchGuildInviteSnapshot
} from './discord-invites.js';

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
// Intents: GUILDS (1 << 0) + GUILD_INVITES (1 << 7) -> no privileged intents required!
const BOT_INTENTS = (1 << 0) | (1 << 7);

export function startDiscordInviteWatcher({
  getData,
  writeData,
  creditInviteMilestones,
  env = process.env
}) {
  const cfg = getDiscordInviteConfig(env);
  if (!cfg.botConfigured || typeof globalThis.WebSocket !== 'function') {
    return { active: false, stop() {} };
  }

  let ws = null;
  let stopped = false;
  let heartbeatTimer = null;
  let sweepTimer = null;
  let reconnectTimer = null;
  let seq = null;
  let syncing = false;

  async function syncAllLinkedUsers() {
    if (stopped || syncing) return;
    syncing = true;
    try {
      const data = getData();
      if (!data?.users) return;

      const res = await fetch(`https://discord.com/api/v10/guilds/${cfg.guildId}/invites`, {
        headers: { Authorization: `Bot ${cfg.botToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          console.warn(`[discord-watcher] Guild invites API returned HTTP ${res.status} — verify DISCORD_BOT_TOKEN and Manage Server permission.`);
        }
        return;
      }
      const guildInvites = await res.json();
      if (!Array.isArray(guildInvites)) return;

      let changed = false;
      const nowIso = new Date().toISOString();

      for (const [userId, u] of Object.entries(data.users)) {
        if (!u || u.status === 'suspended') continue;
        const discordId = (u.discordId && /^\d{15,22}$/.test(u.discordId))
          ? u.discordId
          : (/^\d{15,22}$/.test(userId) ? userId : null);
        if (!discordId) continue;

        const knownCodes = new Set(
          [
            u.discordInviteCode,
            ...(Array.isArray(u.discordTrackedCodes) ? u.discordTrackedCodes.map(x => x?.code) : [])
          ].filter(Boolean)
        );

        const matched = guildInvites.filter(inv =>
          inv && inv.code && (inv.inviter?.id === discordId || knownCodes.has(inv.code))
        );
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
        const totalUses = trackedInvites.reduce((sum, item) => sum + item.uses, 0);
        const targetVerified = Math.max(
          Number(u.verifiedInvites) || 0,
          totalUses + Number(u.manualInviteBonus || 0)
        );

        const prevUses = Number(u.discordInviteUses) || 0;
        const prevVerified = Number(u.verifiedInvites) || 0;
        const prevCodesCount = Array.isArray(u.discordTrackedCodes) ? u.discordTrackedCodes.length : 0;

        if (
          totalUses !== prevUses ||
          targetVerified !== prevVerified ||
          trackedInvites.length !== prevCodesCount ||
          (!u.discordInviteCode && trackedInvites.length > 0)
        ) {
          u.discordInviteUses = totalUses;
          u.discordTrackedCodes = trackedInvites;
          u.discordLastSyncedAt = nowIso;
          u.discordSyncError = null;
          if (!u.discordInviteCode && trackedInvites.length > 0) {
            u.discordInviteCode = trackedInvites[0].code;
            u.discordInviteUrl = trackedInvites[0].url;
          }
          u.verifiedInvites = targetVerified;
          creditInviteMilestones(userId);
          changed = true;
        }
      }

      if (changed) {
        writeData();
      }
    } catch (err) {
      console.warn('[discord-watcher] Sweep failed:', err.message);
    } finally {
      syncing = false;
    }
  }

  function handleInviteCreate(d) {
    if (!d || d.guild_id !== cfg.guildId || !d.code || !d.inviter?.id) return;
    const data = getData();
    const match = findUserByDiscordId(data.users, d.inviter.id);
    if (!match) return;
    const { user: u } = match;
    const entry = {
      code: d.code,
      url: `https://discord.gg/${d.code}`,
      uses: Math.max(0, Number(d.uses) || 0),
      maxUses: Number(d.max_uses) || 0,
      channelId: d.channel_id || null,
      channelName: 'server',
      inviterId: d.inviter.id,
      createdAt: d.created_at || new Date().toISOString()
    };
    const prev = Array.isArray(u.discordTrackedCodes) ? u.discordTrackedCodes.filter(x => x && x.code !== d.code) : [];
    u.discordTrackedCodes = [entry, ...prev];
    if (!u.discordInviteCode) {
      u.discordInviteCode = entry.code;
      u.discordInviteUrl = entry.url;
    }
    u.discordLastSyncedAt = new Date().toISOString();
    writeData();
  }

  function connect() {
    if (stopped) return;
    try {
      ws = new globalThis.WebSocket(GATEWAY_URL);
    } catch (err) {
      scheduleReconnect();
      return;
    }

    ws.addEventListener('message', event => {
      let msg;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (msg.s !== null && msg.s !== undefined) seq = msg.s;

      if (msg.op === 10 && msg.d?.heartbeat_interval) {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({ op: 1, d: seq }));
          }
        }, Math.max(10000, Number(msg.d.heartbeat_interval)));

        ws.send(JSON.stringify({
          op: 2,
          d: {
            token: cfg.botToken,
            intents: BOT_INTENTS,
            properties: { os: 'linux', browser: 'helzerx', device: 'helzerx' }
          }
        }));
      } else if (msg.op === 0) {
        if (msg.t === 'READY') {
          syncAllLinkedUsers();
        } else if (msg.t === 'INVITE_CREATE') {
          handleInviteCreate(msg.d);
        } else if (msg.t === 'INVITE_DELETE') {
          syncAllLinkedUsers();
        }
      } else if (msg.op === 7 || msg.op === 9) {
        try { ws.close(); } catch {}
      }
    });

    ws.addEventListener('close', () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // close event handles reconnect
    });
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 15000);
  }

  connect();
  sweepTimer = setInterval(syncAllLinkedUsers, 25000);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

  return {
    active: true,
    syncNow: syncAllLinkedUsers,
    stop() {
      stopped = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (sweepTimer) clearInterval(sweepTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { if (ws) ws.close(); } catch {}
    }
  };
}
