const env = (key, fallback = '', envMap = process.env) => String(envMap[key] ?? fallback).trim();

export function pterodactylConfig(envMap = process.env) {
  const apiUrl = env('PTERODACTYL_API_URL', '', envMap).replace(/\/+$/, '');
  const publicUrl = env('PTERODACTYL_PUBLIC_URL', apiUrl, envMap).replace(/\/+$/, '');
  return {
    enabled: env('PTERODACTYL_ENABLED', 'false', envMap).toLowerCase() === 'true',
    baseUrl: apiUrl,
    apiKey: env('PTERODACTYL_API_KEY', '', envMap),
    clientKey: env('PTERODACTYL_CLIENT_KEY', '', envMap),
    locationId: Number(env('PTERODACTYL_LOCATION_ID', '1', envMap)),
    nodeId: Number(env('PTERODACTYL_NODE_ID', '1', envMap)),
    nestId: Number(env('PTERODACTYL_NEST_ID', '1', envMap)),
    eggId: Number(env('PTERODACTYL_EGG_ID', '1', envMap)),
    panelPublicUrl: publicUrl
  };
}

export function pterodactylReadiness(envMap = process.env) {
  const c = pterodactylConfig(envMap);
  const missing = [];
  if (!c.baseUrl) missing.push('PTERODACTYL_API_URL');
  else if (!/^https?:\/\//i.test(c.baseUrl)) missing.push('PTERODACTYL_API_URL must be HTTP(S)');
  if (!c.apiKey) missing.push('PTERODACTYL_API_KEY');
  if (!c.clientKey) missing.push('PTERODACTYL_CLIENT_KEY');

  const configured = missing.length === 0;
  const ready = c.enabled && configured;
  return {
    enabled: c.enabled,
    configured,
    ready,
    missing,
    baseUrl: c.baseUrl,
    panelUrl: c.panelPublicUrl
  };
}

function assertPanelConfigured(c) {
  if (!c.baseUrl || !/^https?:\/\//i.test(c.baseUrl) || !c.apiKey) {
    throw new Error('Pterodactyl Application API is not configured (set PTERODACTYL_API_URL and PTERODACTYL_API_KEY).');
  }
}

function assertClientConfigured(c) {
  if (!c.baseUrl || !/^https?:\/\//i.test(c.baseUrl) || !c.clientKey) {
    throw new Error('Pterodactyl Client API is not configured (set PTERODACTYL_API_URL and PTERODACTYL_CLIENT_KEY).');
  }
}

async function parsePterodactylError(res, fallbackMsg) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.errors?.[0]?.detail || body?.message || '';
  } catch {
    // ignore non-json error body
  }
  return detail ? `${fallbackMsg}: ${detail}` : `${fallbackMsg} (HTTP ${res.status})`;
}

export async function listMinecraftEggs({ fetchFn = globalThis.fetch, envMap = process.env } = {}) {
  const c = pterodactylConfig(envMap);
  assertPanelConfigured(c);

  const res = await fetchFn(`${c.baseUrl}/api/application/nests/${c.nestId}/eggs?include=variables`, {
    headers: {
      Authorization: `Bearer ${c.apiKey}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(await parsePterodactylError(res, 'Failed to fetch Pterodactyl eggs'));
  }

  const body = await res.json();
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows.map(item => ({
    id: String(item.attributes.id),
    name: item.attributes.name,
    label: item.attributes.name + (item.attributes.description ? ` — ${item.attributes.description.slice(0, 48)}` : ''),
    nestId: Number(item.attributes.nest || c.nestId),
    eggId: Number(item.attributes.id),
    dockerImage: item.attributes.docker_image || '',
    startup: item.attributes.startup || ''
  }));
}

export async function listMinecraftNodes({ fetchFn = globalThis.fetch, envMap = process.env } = {}) {
  const c = pterodactylConfig(envMap);
  assertPanelConfigured(c);

  const res = await fetchFn(`${c.baseUrl}/api/application/nodes`, {
    headers: {
      Authorization: `Bearer ${c.apiKey}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(await parsePterodactylError(res, 'Failed to fetch Pterodactyl nodes'));
  }

  const body = await res.json();
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows.map(item => ({
    id: String(item.attributes.id),
    name: `${item.attributes.name} (${item.attributes.fqdn})`,
    label: `${item.attributes.name} (${item.attributes.fqdn})`,
    fqdn: item.attributes.fqdn,
    ip: item.attributes.fqdn,
    locationId: Number(item.attributes.location_id || c.locationId || 1),
    surcharge: 0
  }));
}

/**
 * Provisions a real Minecraft Server via the Pterodactyl Application API.
 * Throws cleanly if panel is not configured or rejects creation.
 */
export async function provisionMinecraftServer({
  plan,
  user,
  serverName,
  displayName,
  eggId,
  nodeId,
  fetchFn = globalThis.fetch,
  envMap = process.env
}) {
  const readiness = pterodactylReadiness(envMap);
  if (!readiness.ready) {
    throw new Error(`Pterodactyl provisioning is disabled or incomplete (${readiness.missing.join(', ') || 'PTERODACTYL_ENABLED=true required'}).`);
  }

  const c = pterodactylConfig(envMap);
  const safeName = String(displayName || serverName || '').trim().slice(0, 32);
  if (!safeName) throw new Error('Server display name is required.');

  const memoryMb = Number(plan?.pterodactyl?.memory || plan?.proxmox?.memory || 2048);
  const cpuPercent = Number(plan?.pterodactyl?.cores ? plan.pterodactyl.cores * 100 : (plan?.proxmox?.cores ? plan.proxmox.cores * 100 : 100));
  const diskMb = Number(plan?.pterodactyl?.disk ? plan.pterodactyl.disk * 1024 : (plan?.proxmox?.disk ? plan.proxmox.disk * 1024 : 10240));

  const [eggs, nodes] = await Promise.all([
    listMinecraftEggs({ fetchFn, envMap }),
    listMinecraftNodes({ fetchFn, envMap })
  ]);

  const selectedEgg = eggs.find(e => String(e.id) === String(eggId) || String(e.eggId) === String(eggId));
  if (!selectedEgg) {
    throw new Error('Selected Minecraft software (egg) was not found on Pterodactyl Panel.');
  }
  const selectedNode = nodes.find(n => String(n.id) === String(nodeId));
  if (!selectedNode) {
    throw new Error('Selected Pterodactyl datacenter node was not found.');
  }

  const userEmail = String(user?.email || '').trim();
  if (!userEmail) {
    throw new Error('A valid account email address is required on your profile before creating a Pterodactyl panel user.');
  }

  // 1. Lookup or create Pterodactyl Application user
  const userLookupRes = await fetchFn(
    `${c.baseUrl}/api/application/users?filter[email]=${encodeURIComponent(userEmail)}`,
    {
      headers: { Authorization: `Bearer ${c.apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    }
  );
  if (!userLookupRes.ok) {
    throw new Error(await parsePterodactylError(userLookupRes, 'Failed to query Pterodactyl user'));
  }

  let pteroUserId = null;
  const lookupBody = await userLookupRes.json();
  if (Array.isArray(lookupBody?.data) && lookupBody.data.length > 0) {
    pteroUserId = lookupBody.data[0].attributes.id;
  }

  if (!pteroUserId) {
    const baseUsername = String(user?.username || 'member')
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '')
      .slice(0, 16) || 'member';
    const createUserRes = await fetchFn(`${c.baseUrl}/api/application/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: `${baseUsername}_${String(user?.id || '').slice(-4) || Math.floor(1000 + Math.random() * 9000)}`,
        email: userEmail,
        first_name: String(user?.global_name || user?.username || 'HelzerX').slice(0, 32),
        last_name: 'Member'
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!createUserRes.ok) {
      throw new Error(await parsePterodactylError(createUserRes, 'Failed to create Pterodactyl user'));
    }
    const createdUserBody = await createUserRes.json();
    pteroUserId = createdUserBody?.attributes?.id;
  }

  if (!pteroUserId) {
    throw new Error('Could not resolve Pterodactyl user ID.');
  }

  // 2. Create server via Application API with allocations relationship included
  const createServerRes = await fetchFn(`${c.baseUrl}/api/application/servers?include=allocations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${c.apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: safeName,
      user: pteroUserId,
      egg: selectedEgg.eggId,
      docker_image: selectedEgg.dockerImage || 'ghcr.io/pterodactyl/yolks:java_17',
      startup: selectedEgg.startup || 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}',
      environment: {
        SERVER_JARFILE: 'server.jar',
        MINECRAFT_VERSION: 'latest',
        BUILD_NUMBER: 'latest'
      },
      limits: {
        memory: memoryMb,
        swap: 0,
        disk: diskMb,
        io: 500,
        cpu: cpuPercent
      },
      feature_limits: {
        databases: 1,
        allocations: 1,
        backups: 2
      },
      deploy: {
        locations: [selectedNode.locationId || c.locationId || 1],
        dedicated_ip: false,
        port_range: []
      },
      start_on_completion: true
    }),
    signal: AbortSignal.timeout(18000)
  });

  if (!createServerRes.ok) {
    throw new Error(await parsePterodactylError(createServerRes, 'Pterodactyl server creation failed'));
  }

  const srvBody = await createServerRes.json();
  const attr = srvBody?.attributes;
  if (!attr?.identifier) {
    throw new Error('Pterodactyl panel returned an incomplete server response.');
  }

  const primaryAlloc = attr.relationships?.allocations?.data?.[0]?.attributes || {};
  const publicBase = c.panelPublicUrl || c.baseUrl;

  return {
    id: attr.id,
    identifier: attr.identifier,
    uuid: attr.uuid,
    name: attr.name,
    ip: primaryAlloc.ip_alias || selectedNode.fqdn || primaryAlloc.ip || '',
    port: Number(primaryAlloc.port || 25565),
    node: selectedNode.label,
    egg: selectedEgg.label,
    panelUrl: `${publicBase}/server/${attr.identifier}`,
    memoryMb,
    cpuPercent,
    diskMb,
    status: 'running'
  };
}

/**
 * Manages power state of a real Minecraft Server via Pterodactyl Client API.
 */
export async function manageMinecraftServer({
  identifier,
  action,
  fetchFn = globalThis.fetch,
  envMap = process.env
}) {
  const validActions = ['start', 'stop', 'restart', 'kill'];
  if (!validActions.includes(action)) {
    throw new Error('Action must be one of: start, stop, restart, kill');
  }
  const c = pterodactylConfig(envMap);
  assertClientConfigured(c);

  const res = await fetchFn(`${c.baseUrl}/api/client/servers/${encodeURIComponent(identifier)}/power`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${c.clientKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ signal: action }),
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    throw new Error(await parsePterodactylError(res, `Failed to send '${action}' signal`));
  }

  return { ok: true, action, identifier, source: 'pterodactyl-client-api' };
}

/**
 * Inspects real-time resource utilization from the Pterodactyl Client API.
 */
export async function inspectMinecraftServer({
  identifier,
  fetchFn = globalThis.fetch,
  envMap = process.env
}) {
  const c = pterodactylConfig(envMap);
  assertClientConfigured(c);

  const res = await fetchFn(`${c.baseUrl}/api/client/servers/${encodeURIComponent(identifier)}/resources`, {
    headers: {
      Authorization: `Bearer ${c.clientKey}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(await parsePterodactylError(res, 'Failed to read live server resources'));
  }

  const body = await res.json();
  const attr = body?.attributes;
  if (!attr?.resources) {
    throw new Error('Pterodactyl Client API returned an invalid resources payload.');
  }

  return {
    ok: true,
    status: attr.current_state || 'offline',
    utilization: {
      memoryBytes: Number(attr.resources.memory_bytes || 0),
      cpuAbsolute: Number(attr.resources.cpu_absolute || 0),
      diskBytes: Number(attr.resources.disk_bytes || 0),
      networkRx: Number(attr.resources.network_rx_bytes || 0),
      networkTx: Number(attr.resources.network_tx_bytes || 0),
      uptimeMs: Number(attr.resources.uptime || 0)
    }
  };
}

/**
 * Sends a console command to a real Minecraft Server via Pterodactyl Client API.
 */
export async function sendMinecraftCommand({
  identifier,
  command,
  fetchFn = globalThis.fetch,
  envMap = process.env
}) {
  const cleanCmd = String(command || '').trim();
  if (!cleanCmd) throw new Error('Command cannot be empty');

  const c = pterodactylConfig(envMap);
  assertClientConfigured(c);

  const res = await fetchFn(`${c.baseUrl}/api/client/servers/${encodeURIComponent(identifier)}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${c.clientKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ command: cleanCmd }),
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(await parsePterodactylError(res, 'Failed to dispatch console command'));
  }

  return {
    ok: true,
    command: cleanCmd,
    response: 'Command dispatched to Pterodactyl console'
  };
}
