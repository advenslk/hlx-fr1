import React, { useState, useEffect } from 'react';
import { Box, Cpu, HardDrive, Server, X, ChevronDown, Sparkles, ShieldCheck } from 'lucide-react';
import './MinecraftDeployModal.css';

const money = n => new Intl.NumberFormat('en-US').format(Number(n) || 0);

export default function MinecraftDeployModal({
  plan,
  eggs = [],
  nodes = [],
  balance = 0,
  busy,
  onClose,
  onDeploy
}) {
  const [name, setName] = useState('');
  const [eggId, setEggId] = useState(eggs[0]?.id || 'paper-1-20');
  const [nodeId, setNodeId] = useState(nodes[0]?.id || 'tokyo-01');

  useEffect(() => {
    if (!plan) return;
    setName('');
    if (eggs.length && !eggs.find(e => e.id === eggId)) {
      setEggId(eggs[0].id);
    }
    if (nodes.length && !nodes.find(n => n.id === nodeId)) {
      setNodeId(nodes[0].id);
    }
  }, [plan?.id]);

  if (!plan) return null;

  const cost = Number(plan.cost || 0);
  const canAfford = Number(balance) >= cost;
  const validName = /^[a-z0-9](?:[a-z0-9-]{0,24}[a-z0-9])?$/.test(name) && name.length >= 2;
  const canSubmit = validName && canAfford && !busy;

  const currentEgg = eggs.find(e => e.id === eggId) || { name: 'Paper 1.20' };
  const currentNode = nodes.find(n => n.id === nodeId) || { name: 'Tokyo, Japan' };

  const memoryMb = plan.pterodactyl?.memory || 2048;
  const cores = plan.pterodactyl?.cores || 1;
  const diskGb = plan.pterodactyl?.disk || 10;

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onDeploy({
      displayName: name,
      eggId,
      nodeId
    });
  }

  return (
    <div
      className="mc-modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="mc-deploy-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mc-modal-title"
      >
        <div className="mc-modal-ambient" />
        <header className="mc-modal-header">
          <div className="mc-modal-kicker">
            <i className="mc-live-dot" /> PTERODACTYL ENGINE <span style={{ opacity: 0.5 }}>/</span> MINECRAFT CLOUD
          </div>
          <button
            className="mc-modal-close"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X size={18} />
          </button>
          <h2 id="mc-modal-title">
            Deploy <span>Minecraft Server.</span>
          </h2>
          <p>
            Powered by Pterodactyl container orchestration. Redeem your verified HZL credits for dedicated game hosting.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mc-modal-layout">
          <div className="mc-config-fields">
            <label className="mc-field">
              <span>
                SERVER DISPLAY NAME <small>2–26 characters</small>
              </span>
              <input
                value={name}
                onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 26))}
                placeholder="helzerx-smp"
                autoComplete="off"
                maxLength={26}
                required
              />
              <small className={name && !validName ? 'mc-field-error' : 'mc-field-hint'}>
                {name && !validName
                  ? 'Use 2–26 lowercase letters, numbers, or hyphens.'
                  : 'Your server identifier and in-game MOTD host.'}
              </small>
            </label>

            <label className="mc-field">
              <span>
                <Box size={13} /> SERVER SOFTWARE (EGG)
              </span>
              <div className="mc-select-wrap">
                <select value={eggId} onChange={e => setEggId(e.target.value)}>
                  {(eggs.length ? eggs : [
                    { id: 'paper-1-20', name: 'Paper 1.20.4 (High Performance)' },
                    { id: 'purpur-1-20', name: 'Purpur 1.20.4 (Optimized SMP)' },
                    { id: 'fabric-1-20', name: 'Fabric 1.20.4 (Modern Modding)' },
                    { id: 'forge-1-20', name: 'Forge 1.20.2 (Heavy Modpacks)' },
                    { id: 'vanilla-1-20', name: 'Vanilla Minecraft 1.20.4' },
                    { id: 'bedrock', name: 'Bedrock Dedicated Server' }
                  ]).map(egg => (
                    <option key={egg.id} value={egg.id}>
                      {egg.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </div>
              <small className="mc-field-hint">
                Pterodactyl container image with auto-configured Java runtime.
              </small>
            </label>

            <label className="mc-field">
              <span>
                <Server size={13} /> CLUSTER REGION & NODE
              </span>
              <div className="mc-select-wrap">
                <select value={nodeId} onChange={e => setNodeId(e.target.value)}>
                  {(nodes.length ? nodes : [
                    { id: 'tokyo-01', name: 'Tokyo, Japan (Ultra Low Latency Asia)' },
                    { id: 'singapore-01', name: 'Singapore (Southeast Asia Node)' },
                    { id: 'us-east-01', name: 'US East (Virginia Datacenter)' }
                  ]).map(node => (
                    <option key={node.id} value={node.id}>
                      {node.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </div>
              <small className="mc-field-hint">
                Enterprise BGP network connection with DDoS protection.
              </small>
            </label>
          </div>

          <aside className="mc-order-summary">
            <div className="mc-3d-scene" aria-hidden="true">
              <div className="mc-shadow-plate" />
              <div className="mc-voxel-block">
                <div className="mc-face mc-face-front">
                  <div className="mc-block-gem" />
                  <span className="mc-block-text">HZL MC</span>
                </div>
                <div className="mc-face mc-face-back" />
                <div className="mc-face mc-face-top" />
                <div className="mc-face mc-face-bottom" />
                <div className="mc-face mc-face-left" />
                <div className="mc-face mc-face-right" />
              </div>
            </div>

            <div className="mc-summary-label">ORDER SUMMARY</div>
            <h3>{plan.name}</h3>
            <p className="mc-summary-desc">{plan.description}</p>

            <div className="mc-spec-list">
              <div className="mc-spec-item">
                <span>Allocated Memory</span>
                <b>{money(memoryMb)} MB RAM</b>
              </div>
              <div className="mc-spec-item">
                <span>Compute vCPU</span>
                <b>{cores} Dedicated Core{cores > 1 ? 's' : ''}</b>
              </div>
              <div className="mc-spec-item">
                <span>NVMe Storage</span>
                <b>{diskGb} GB Fast SSD</b>
              </div>
              <div className="mc-spec-item">
                <span>Software</span>
                <b>{currentEgg.name}</b>
              </div>
              <div className="mc-spec-item">
                <span>Target Node</span>
                <b>{currentNode.name?.split('(')[0] || currentNode.name}</b>
              </div>
            </div>

            <div className="mc-cost-total">
              <span>Redemption Cost</span>
              <b>{money(cost)} <small style={{ fontSize: '13px', color: '#c084fc' }}>HZL</small></b>
            </div>

            <div className="mc-balance-info">
              <span>Your balance:</span>
              <strong style={{ color: canAfford ? '#34d399' : '#f87171' }}>
                {money(balance)} HZL
              </strong>
            </div>

            <button
              type="submit"
              className="mc-deploy-submit"
              disabled={!canSubmit}
            >
              {busy ? (
                'Provisioning Server…'
              ) : !canAfford ? (
                'Insufficient HZL Balance'
              ) : !validName ? (
                'Enter Server Name'
              ) : (
                <>
                  <Sparkles size={14} /> Deploy Minecraft Server
                </>
              )}
            </button>
          </aside>
        </form>
      </section>
    </div>
  );
}
