import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  getEffectiveDiscordId,
  findUserByDiscordId,
  isDiscordOnlyAccount,
  mergeDiscordAccountIntoUser,
  extractDiscordInviteCode,
  buildServerInviteUrl,
  calculateHzlEarnedFromInvites,
  calculateNextInviteTier,
  buildInviteSummary,
  resolveTargetInviteChannelId,
  createGuildInviteForMember,
  fetchGuildInviteSnapshot
} from '../server/discord-invites.js';
import { startDiscordInviteWatcher } from '../server/discord-bot.js';

test('getEffectiveDiscordId & findUserByDiscordId support both Discord-keyed and Gmail-linked users', () => {
  const users = {
    '118822334455667788': { username: 'discordnative', verifiedInvites: 4 },
    usr_abc12345: {
      username: 'gmailuser',
      email: 'user@gmail.com',
      discordId: '998877665544332211',
      discordUsername: 'linked_user',
      verifiedInvites: 2
    }
  };

  assert.equal(getEffectiveDiscordId('118822334455667788', users['118822334455667788']), '118822334455667788');
  assert.equal(getEffectiveDiscordId('usr_abc12345', users.usr_abc12345), '998877665544332211');
  assert.equal(getEffectiveDiscordId('usr_unlinked', { username: 'nolink' }), null);

  const matchGmail = findUserByDiscordId(users, '998877665544332211');
  assert.equal(matchGmail?.id, 'usr_abc12345');

  const matchNative = findUserByDiscordId(users, '118822334455667788');
  assert.equal(matchNative?.id, '118822334455667788');
});

test('isDiscordOnlyAccount and mergeDiscordAccountIntoUser merge legacy Discord records cleanly', () => {
  const data = {
    users: {
      '555666777888999000': {
        username: 'helzo_old',
        authProviders: ['discord'],
        balance: 500,
        verifiedInvites: 3,
        activeBoosts: 1,
        creditedMilestones: ['invite:2'],
        discordInviteCode: 'hxOld1',
        discordTrackedCodes: [{ code: 'hxOld1', url: 'https://discord.gg/hxOld1', uses: 3 }]
      },
      usr_helzo_gmail: {
        username: 'Helzo',
        email: 'helzo@gmail.com',
        passwordHash: 'scrypt:abc',
        authProviders: ['email'],
        balance: 4000,
        verifiedInvites: 0,
        activeBoosts: 2,
        creditedMilestones: []
      }
    },
    hostingRequests: [{ id: 'hr1', userId: '555666777888999000' }],
    tickets: [{ id: 'tk1', userId: '555666777888999000' }],
    claims: [{ id: 'cl1', userId: '555666777888999000' }],
    inviteClaims: [{ id: 'ic1', referrerId: '555666777888999000', status: 'approved' }]
  };

  assert.equal(isDiscordOnlyAccount('555666777888999000', data.users['555666777888999000']), true);
  assert.equal(isDiscordOnlyAccount('usr_helzo_gmail', data.users.usr_helzo_gmail), false);

  const merged = mergeDiscordAccountIntoUser({
    data,
    sourceId: '555666777888999000',
    targetId: 'usr_helzo_gmail'
  });

  assert.equal(merged, true);
  assert.equal(data.users['555666777888999000'], undefined);
  assert.equal(data.users.usr_helzo_gmail.balance, 4500);
  assert.equal(data.users.usr_helzo_gmail.verifiedInvites, 3);
  assert.equal(data.users.usr_helzo_gmail.activeBoosts, 2);
  assert.equal(data.users.usr_helzo_gmail.discordInviteCode, 'hxOld1');
  assert.deepEqual(data.users.usr_helzo_gmail.creditedMilestones, ['invite:2']);
  assert.equal(data.hostingRequests[0].userId, 'usr_helzo_gmail');
  assert.equal(data.tickets[0].userId, 'usr_helzo_gmail');
  assert.equal(data.claims[0].userId, 'usr_helzo_gmail');
  assert.equal(data.inviteClaims[0].referrerId, 'usr_helzo_gmail');
});

test('extractDiscordInviteCode handles discord.gg URLs, discord.com/invite URLs, and raw codes', () => {
  assert.equal(extractDiscordInviteCode('https://discord.gg/helzerx99'), 'helzerx99');
  assert.equal(extractDiscordInviteCode('https://discord.com/invite/HxServer-01'), 'HxServer-01');
  assert.equal(extractDiscordInviteCode('  abcXYZ77  '), 'abcXYZ77');
  assert.equal(extractDiscordInviteCode('https://evil.example.com/nope/thing'), null);
  assert.equal(buildServerInviteUrl('https://discord.gg/helzerx99'), 'https://discord.gg/helzerx99');
});

test('milestone and HZL calculations compute next tier progress and credited earnings', () => {
  assert.equal(calculateHzlEarnedFromInvites(['invite:2', 'invite:4']), 800);
  const tier = calculateNextInviteTier(3);
  assert.deepEqual(tier, {
    count: 4,
    amount: 600,
    remaining: 1,
    progressPct: 50
  });
  assert.equal(calculateNextInviteTier(45), null);
});

test('buildInviteSummary reports linked Discord state, claims, and server invite URLs cleanly', () => {
  const user = {
    username: 'Kasun',
    discordId: '123456789012345678',
    discordUsername: 'kasun_dev',
    discordInGuild: true,
    discordInviteCode: 'hxKasun1',
    discordInviteUses: 5,
    verifiedInvites: 5,
    creditedMilestones: ['invite:2', 'invite:4']
  };
  const data = {
    inviteClaims: [
      {
        id: 'c1',
        type: 'discord_server',
        referrerId: 'usr_kasun',
        inviteCode: 'hxKasun1',
        claimedCount: 3,
        status: 'pending',
        createdAt: '2026-11-14T00:00:00.000Z'
      }
    ]
  };
  const summary = buildInviteSummary({
    userId: 'usr_kasun',
    user,
    data,
    env: {
      APP_URL: 'https://perks.helzerx.cyou',
      DISCORD_GUILD_ID: '111222333444555666',
      DISCORD_BOT_TOKEN: 'bot-token',
      DISCORD_SERVER_INVITE_URL: 'https://discord.gg/helzerx'
    }
  });

  assert.equal(summary.discordLinked, true);
  assert.equal(summary.botConfigured, true);
  assert.equal(summary.discordInviteUrl, 'https://discord.gg/hxKasun1');
  assert.equal(summary.serverInviteUrl, 'https://discord.gg/helzerx');
  assert.equal(summary.hzlEarnedFromInvites, 800);
  assert.equal(summary.pendingInvites, 1);
  assert.equal(summary.nextTier?.count, 8);
});

test('Discord Bot REST helpers resolve text channel, create invite, aggregate knownCodes, and explain 403 permission errors', async () => {
  const calls = [];
  const mockFetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    if (url.endsWith('/guilds/999/channels')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([
          { id: '1', type: 2, name: 'voice', position: 0 },
          { id: '2', type: 0, name: 'welcome', position: 1 }
        ])
      };
    }
    if (url.endsWith('/channels/2/invites') && init.method === 'POST') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          code: 'hxMember7',
          channel: { id: '2', name: 'welcome' },
          uses: 0,
          created_at: '2026-11-14T01:00:00.000Z'
        })
      };
    }
    if (url.endsWith('/guilds/999/invites')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([
          { code: 'hxMember7', uses: 6, max_uses: 0, channel: { id: '2', name: 'welcome' }, inviter: { id: '555' } },
          { code: 'hxExtra2', uses: 2, max_uses: 0, channel: { id: '2', name: 'welcome' }, inviter: { id: 'bot' } },
          { code: 'otherUser', uses: 9, max_uses: 0, channel: { id: '2', name: 'welcome' }, inviter: { id: '888' } }
        ])
      };
    }
    if (url.endsWith('/guilds/403/invites')) {
      return {
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ message: 'Missing Permissions', code: 50013 })
      };
    }
    if (url.endsWith('/guilds/999/members/555')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ joined_at: '2026-11-01T00:00:00.000Z' })
      };
    }
    return { ok: false, status: 404, text: async () => '{}' };
  };

  const chId = await resolveTargetInviteChannelId({ guildId: '999', botToken: 'tok' }, mockFetch);
  assert.equal(chId, '2');

  const inv = await createGuildInviteForMember({
    guildId: '999',
    channelId: chId,
    botToken: 'tok',
    discordId: '555',
    username: 'tester'
  }, mockFetch);
  assert.equal(inv.url, 'https://discord.gg/hxMember7');

  const snap = await fetchGuildInviteSnapshot({
    guildId: '999',
    botToken: 'tok',
    discordId: '555',
    registeredCode: 'hxMember7',
    knownCodes: ['hxExtra2']
  }, mockFetch);
  assert.equal(snap.inGuild, true);
  assert.equal(snap.totalUses, 8);
  assert.equal(snap.trackedInvites.length, 2);

  await assert.rejects(
    () => fetchGuildInviteSnapshot({ guildId: '403', botToken: 'tok', discordId: '555' }, mockFetch),
    /Manage Server/
  );

  const inactiveWatcher = startDiscordInviteWatcher({
    getData: () => ({ users: {} }),
    writeData: () => {},
    creditInviteMilestones: () => {},
    env: {}
  });
  assert.equal(inactiveWatcher.active, false);

  const serverSrc = fs.readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  for (const route of [
    '/api/invites/discord/create',
    '/api/invites/discord/register',
    '/api/invites/discord/sync',
    '/api/invites/claim',
    '/api/invites/discord/unlink'
  ]) {
    assert.ok(serverSrc.includes(route), 'missing invite route: ' + route);
  }
});
