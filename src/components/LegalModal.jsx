import React from 'react';
import { ShieldCheck, X } from 'lucide-react';

const POLICIES = {
  terms: {
    title: 'Terms of Service',
    updated: 'November 2026',
    sections: [
      {
        heading: '1. Service Provisioning & Acceptable Use',
        body: 'HelzerX Cloud provides Proxmox Linux Containers (LXC) and Pterodactyl Minecraft hosting via both community HZL redemptions and paid USD/LKR subscriptions. Cryptocurrency mining, DDoS origination, unauthorized port scanning, phishing, or malware hosting results in immediate account suspension.'
      },
      {
        heading: '2. Billing Cycles & Auto-Suspension',
        body: 'Paid instances renew monthly, quarterly, or yearly according to the billing cycle chosen at checkout. Unpaid renewals enter a 3-day grace window before automated container suspension. Wallet top-ups are non-transferable and tied to your HelzerX account.'
      },
      {
        heading: '3. HZL Community Credits',
        body: 'HZL credits earned from Discord invites and community server boosts carry zero cash withdrawal value and may be applied toward eligible free plans or loyalty discounts on paid orders.'
      }
    ]
  },
  refund: {
    title: 'Refund & Cancellation Policy',
    updated: 'November 2026',
    sections: [
      {
        heading: '1. Failed Automated Provisioning',
        body: 'If Proxmox or Pterodactyl fails before allocating your server or container ID, paid wallet charges and HZL credits are automatically refunded in full to your HelzerX balance.'
      },
      {
        heading: '2. Subscription Cancellations & Refunds',
        body: 'You may disable Auto-Renew anytime from Billing & Wallet or My Containers & Servers before the next renewal date. Eligible duplicate charges or unresolved hardware faults within 48 hours of purchase can be refunded to your HelzerX Wallet or original payment method upon review via Support.'
      },
      {
        heading: '3. Non-Refundable Cases',
        body: 'Accounts terminated for Terms of Service violations (abuse, attacks, or fraud) are ineligible for refunds.'
      }
    ]
  },
  privacy: {
    title: 'Privacy & Data Protection Policy',
    updated: 'November 2026',
    sections: [
      {
        heading: '1. Data Collected',
        body: 'We store account identifiers (email, Google/Discord IDs), encrypted passwords (scrypt), optional 2FA secrets, server deployment metadata, billing invoices, and security audit timestamps required to operate your hosting services.'
      },
      {
        heading: '2. Payment Security',
        body: 'HelzerX Cloud never stores raw credit card numbers. Card and wallet transactions are handled via Stripe or PayHere using signed webhook verification, or manual bank/crypto reference verification.'
      },
      {
        heading: '3. Credentials & SSH Hygiene',
        body: 'Root passwords and auto-generated SSH private keys are displayed once at creation time and are never saved in plaintext logs.'
      }
    ]
  }
};

export default function LegalModal({ docKey, onClose }) {
  if (!docKey || !POLICIES[docKey]) return null;
  const doc = POLICIES[docKey];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="section-label" style={{ marginBottom: '2px' }}>HELZERX CLOUD · LEGAL COMPLIANCE</div>
            <h3>{doc.title}</h3>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close legal policy"><X size={18} /></button>
        </div>

        <div style={{ fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldCheck size={13} color="var(--accent-gold)" /> Effective {doc.updated} · perks.helzerx.cyou
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
          {doc.sections.map(sec => (
            <div key={sec.heading} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '14px 16px' }}>
              <h4 style={{ fontSize: '13.5px', color: '#fff', marginBottom: '6px' }}>{sec.heading}</h4>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.65 }}>{sec.body}</p>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-pill primary sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
