import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pterodactylReadiness,
  listMinecraftEggs,
  listMinecraftNodes,
  provisionMinecraftServer,
  manageMinecraftServer,
  inspectMinecraftServer,
  sendMinecraftCommand
} from '../server/pterodactyl.js';

test('Pterodactyl module readiness and catalog discovery', async () => {
  const readiness = pterodactylReadiness();
  assert.ok(typeof readiness.enabled === 'boolean');
  assert.strictEqual(readiness.ready, true);

  const eggs = await listMinecraftEggs();
  assert.ok(Array.isArray(eggs));
  assert.ok(eggs.some(e => e.id.includes('paper')));
  assert.ok(eggs.some(e => e.id.includes('purpur')));
  assert.ok(eggs.some(e => e.id.includes('fabric')));

  const nodes = await listMinecraftNodes();
  assert.ok(Array.isArray(nodes));
  assert.ok(nodes.some(n => n.id.includes('mc')));
});

test('Minecraft server lifecycle: provision, inspect, power action, and command', async () => {
  const mockUser = {
    id: 'user_test_mc_01',
    username: 'MinecraftTester',
    email: 'mc_tester@helzerx.net'
  };

  const mockPlan = {
    id: 'mc-smp',
    name: 'Minecraft Community SMP',
    cost: 800,
    pterodactyl: {
      memory: 4096,
      cores: 2,
      disk: 25
    }
  };

  // 1. Provision
  const instance = await provisionMinecraftServer({
    user: mockUser,
    plan: mockPlan,
    displayName: 'test-smp-world',
    eggId: 'paper-1.20',
    nodeId: 'hlx-mc-asia-01'
  });

  assert.ok(instance.identifier);
  assert.ok(instance.port >= 25565);
  assert.strictEqual(instance.status, 'running');
  assert.ok(instance.egg.includes('Paper'));

  // 2. Inspect
  const telemetry = await inspectMinecraftServer({ identifier: instance.identifier });
  assert.strictEqual(telemetry.ok, true);
  assert.strictEqual(telemetry.status, 'running');
  assert.ok(telemetry.utilization.memoryMaxBytes > 0);

  // 3. Power Action
  const restartResult = await manageMinecraftServer({ identifier: instance.identifier, action: 'restart' });
  assert.strictEqual(restartResult.ok, true);
  assert.strictEqual(restartResult.action, 'restart');

  // 4. Command dispatch
  const cmdResult = await sendMinecraftCommand({ identifier: instance.identifier, command: 'list' });
  assert.strictEqual(cmdResult.ok, true);
  assert.ok(cmdResult.output.includes('players online'));
});
