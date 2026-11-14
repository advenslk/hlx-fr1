import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import crypto from 'node:crypto';
import { provisionLxc, proxmoxReadiness, manageLxc, inspectLxc, runLxcTerminal, manageLxcSnapshot, listLxcTemplates } from './proxmox.js';
import { provisionMinecraftServer, pterodactylReadiness, manageMinecraftServer, inspectMinecraftServer, sendMinecraftCommand, listMinecraftEggs, listMinecraftNodes } from './pterodactyl.js';
import { readState, writeState } from './database.js';
import {
  normalizeEmail,
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
  generateTotpSecret,
  verifyTotpToken,
  buildTotpSetupPayload,
  generateBackupCodes,
  consumeBackupCode,
  createAuthRateLimiter,
  buildPkceChallenge,
  recordSecurityEvent,
  resolveGoogleOAuthConfig
} from './auth-security.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app=express(),__dirname=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(__dirname,'..');
const PORT=Number(process.env.PORT||3000),prod=process.env.NODE_ENV==='production';
fs.mkdirSync(path.join(root,'data'),{recursive:true});
const required=['SESSION_SECRET','DISCORD_CLIENT_ID','DISCORD_CLIENT_SECRET','DISCORD_REDIRECT_URI'];
const missing=required.filter(k=>!process.env[k]);if(prod&&missing.length)console.error('[startup] Missing environment variables:',missing.join(', '));
if(prod&&(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32))throw new Error('SESSION_SECRET must be at least 32 characters in production.');
app.disable('x-powered-by');app.set('trust proxy',1);app.use(express.json({limit:'20kb'}));
app.use((_req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control','off');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  next();
});
app.use(session({name:'hx_freehost_sid',secret:process.env.SESSION_SECRET||'development-only-change-me',resave:false,saveUninitialized:false,rolling:true,cookie:{httpOnly:true,secure:'auto',sameSite:'lax',maxAge:604800000}}));
app.use((req,_res,next)=>{
  const isHttps=req.secure||req.get('x-forwarded-proto')==='https';
  if(isHttps){req.session.cookie.secure=true;req.session.cookie.sameSite='none';}
  else{req.session.cookie.secure=false;req.session.cookie.sameSite='lax';}
  next();
});

// Never let a CDN, browser cache, or SPA fallback serve a stale public page for staff-only paths.
app.use(['/admin', '/admin/', '/admin.html'], (_req, res, next) => {
  res.set({
    'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'X-Content-Type-Options': 'nosniff'
  });
  next();
});
app.get('/admin.html', (_req, res) => res.status(404).type('text/plain').send('Not found'));

// Serve both slash variants directly. Redirecting between them can loop when a proxy/CDN
// also canonicalizes the path, so neither URL redirects to the other.
function sendPrivateAdmin(_req, res) {
  res.status(200);
  res.type('html');
  res.sendFile(path.join(root, 'private', 'admin.html'), { dotfiles: 'deny', cacheControl: false }, (err) => {
    if (err && !res.headersSent) res.status(404).type('text/plain').send('Not found');
  });
}
app.get(['/admin', '/admin/'], sendPrivateAdmin);

// Customer control panel: private, authenticated and never cached.
app.use(['/control','/control/','/control.html'],(_req,res,next)=>{
 res.set({'Cache-Control':'private, no-store, no-cache, must-revalidate, max-age=0','Pragma':'no-cache','Expires':'0','X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff'});next();
});
app.get(['/control','/control/'],(req,res)=>{
 if(!req.session.user)return res.redirect('/?login=required&next=%2Fcontrol');
 res.type('html').sendFile(path.join(root,'private','control.html'),{dotfiles:'deny',cacheControl:false},err=>{if(err&&!res.headersSent)res.status(404).type('text/plain').send('Not found');});
});

const pendingOAuth=new Map();
const adminLoginAttempts=new Map();
const ADMIN_LOCK_WINDOW_MS=15*60*1000, ADMIN_MAX_ATTEMPTS=6;
function safeEqual(a,b){const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function adminLoginLimiter(req,res,next){
 const key=req.ip||req.socket.remoteAddress||'unknown',now=Date.now();
 let entry=adminLoginAttempts.get(key);
 if(!entry||now-entry.startedAt>ADMIN_LOCK_WINDOW_MS){entry={startedAt:now,count:0,blockedUntil:0};adminLoginAttempts.set(key,entry);}
 if(entry.blockedUntil>now)return res.status(429).json({error:'Too many sign-in attempts. Try again in 15 minutes.'});
 next();
}
function adminMutationOrigin(req,res,next){
 const origin=req.get('origin');
 if(origin){try{if(new URL(origin).origin!==new URL(`${req.protocol}://${req.get('host')}`).origin)return res.status(403).json({error:'Cross-origin admin request denied.'});}catch{return res.status(403).json({error:'Invalid request origin.'});}}
 if(!req.is('application/json'))return res.status(415).json({error:'JSON requests required.'});
 next();
}
const LEGACY_DATA_FILE=path.join(root,'data','rewards.json');
function readData(){
  const stored=readState();
  const hasDatabaseData=Object.values(stored).some(value=>Array.isArray(value)?value.length>0:Object.keys(value||{}).length>0);
  if(!hasDatabaseData&&fs.existsSync(LEGACY_DATA_FILE)){
    try {
      const legacy=JSON.parse(fs.readFileSync(LEGACY_DATA_FILE,'utf8'));
      const migrated={
        users:legacy?.users&&typeof legacy.users==='object'&&!Array.isArray(legacy.users)?legacy.users:{},
        claims:Array.isArray(legacy?.claims)?legacy.claims:[],
        inviteClaims:Array.isArray(legacy?.inviteClaims)?legacy.inviteClaims:[],
        hostingRequests:Array.isArray(legacy?.hostingRequests)?legacy.hostingRequests:[],
        tickets:[], plans:[], auditLogs:[]
      };
      writeState(migrated);
      return migrated;
    } catch(error) { console.error('[database migration] Legacy rewards file could not be migrated:',error.message); }
  }
  let envPlans=[];
  try { envPlans=JSON.parse(process.env.HOSTING_REDEMPTION_OPTIONS||'[]'); } catch {}
  const state={
    users:stored.users||{},
    claims:stored.claims||[],
    inviteClaims:stored.inviteClaims||[],
    hostingRequests:stored.hostingRequests||[],
    tickets:stored.tickets||[],
    plans:Array.isArray(stored.plans)?stored.plans:[],
    auditLogs:stored.auditLogs||[]
  };
  const defaultSystemPlans = [
    { id: 'starter-lxc', service: 'lxc', name: 'Starter Cloud VPS', cost: 500, description: 'AMD EPYC™ compute container, 1 vCPU, 1024 MB RAM, 10 GB NVMe storage.', enabled: true, proxmox: { cores: 1, memory: 1024, disk: 10, swap: 512 } },
    { id: 'pro-lxc', service: 'lxc', name: 'Pro Performance VPS', cost: 1000, description: 'High throughput cloud VPS, 2 vCPU, 2048 MB RAM, 25 GB NVMe storage.', enabled: true, proxmox: { cores: 2, memory: 2048, disk: 25, swap: 1024 } },
    { id: 'ultra-lxc', service: 'lxc', name: 'Ultra Compute VPS', cost: 2000, description: 'Heavy workload VPS, 4 vCPU, 4096 MB RAM, 50 GB NVMe storage.', enabled: true, proxmox: { cores: 4, memory: 4096, disk: 50, swap: 2048 } },
    { id: 'mc-starter', service: 'minecraft', name: 'Minecraft Paper Starter', cost: 400, description: 'Pterodactyl Paper 1.20 server with 2 GB RAM, 100% vCPU, 10 GB NVMe, and DDOS protection.', enabled: true, pterodactyl: { memory: 2048, cores: 1, disk: 10 } },
    { id: 'mc-smp', service: 'minecraft', name: 'Minecraft SMP Community', cost: 800, description: 'Survival Multiplayer with Purpur/Paper performance patches, 4 GB RAM, and 200% vCPU.', enabled: true, pterodactyl: { memory: 4096, cores: 2, disk: 25 } },
    { id: 'mc-modded', service: 'minecraft', name: 'Minecraft Forge / Fabric Modded', cost: 1500, description: 'High-memory container designed for heavy Fabric/Forge modpacks, 8 GB RAM, and 400% vCPU.', enabled: true, pterodactyl: { memory: 8192, cores: 4, disk: 50 } }
  ];
  if(!state.plans.length){
    if(Array.isArray(envPlans)&&envPlans.length){
      state.plans=envPlans.filter(x=>x&&typeof x.id==='string'&&typeof x.service==='string').map(x=>({...x,enabled:x.enabled!==false}));
    } else {
      state.plans=defaultSystemPlans;
    }
    writeState(state);
  }
  return state;
}
let data=readData();
function writeData(){writeState(data);}
function ensureUser(id){
  if(!data.users[id]){
    data.users[id]={balance:0,verifiedInvites:0,activeBoosts:0,referrer:null,pendingReferrer:null,creditedMilestones:[],sessionVersion:1,authProviders:[],twoFactorEnabled:false,securityEvents:[],createdAt:Date.now()};
  }
  const u=data.users[id];
  if(!Number.isInteger(u.sessionVersion)||u.sessionVersion<1)u.sessionVersion=1;
  if(!Array.isArray(u.authProviders))u.authProviders=[];
  if(!Array.isArray(u.securityEvents))u.securityEvents=[];
  if(!Array.isArray(data.inviteClaims))data.inviteClaims=[];
  if(!Array.isArray(data.hostingRequests))data.hostingRequests=[];
  return u;
}
const inviteTiers=[[2,200],[4,600],[8,900],[12,1300],[16,1700],[24,2400],[28,2900],[34,3400],[38,4000],[42,4500]];
const boostTiers=[[1,2000],[2,4000],[3,4700],[4,5000],[7,6900],[10,10000]];
function creditInviteMilestones(id){const u=ensureUser(id);for(const [count,amount] of inviteTiers){const key='invite:'+count;if(u.verifiedInvites>=count&&!u.creditedMilestones.includes(key)){u.balance+=amount;u.creditedMilestones.push(key);}}}
function discordGuildMemberships(accessToken){return fetch('https://discord.com/api/users/@me/guilds',{headers:{Authorization:'Bearer '+accessToken,Accept:'application/json'},signal:AbortSignal.timeout(10000)});}

const loginIpLimiter=createAuthRateLimiter({windowMs:15*60*1000,maxAttempts:10,blockDurationMs:15*60*1000});
const loginEmailLimiter=createAuthRateLimiter({windowMs:15*60*1000,maxAttempts:5,blockDurationMs:15*60*1000});
const registerIpLimiter=createAuthRateLimiter({windowMs:60*60*1000,maxAttempts:8,blockDurationMs:60*60*1000});
const twoFaLimiter=createAuthRateLimiter({windowMs:10*60*1000,maxAttempts:5,blockDurationMs:10*60*1000});

function clientIp(req){return String(req.ip||req.socket?.remoteAddress||'unknown');}
function sameOriginAuthGuard(req,res,next){
  const origin=req.get('origin');
  if(origin){
    try{
      const parsedOrigin=new URL(origin);
      const reqHost=String(req.get('host')||'').toLowerCase();
      const expectedOrigin=new URL(`${req.protocol}://${req.get('host')}`).origin;
      const appUrlOrigin=process.env.APP_URL?new URL(process.env.APP_URL).origin:null;
      const matchesOrigin=parsedOrigin.origin===expectedOrigin||(appUrlOrigin&&parsedOrigin.origin===appUrlOrigin)||(reqHost&&parsedOrigin.host.toLowerCase()===reqHost);
      if(!matchesOrigin){
        return res.status(403).json({error:'Cross-origin authentication request denied.'});
      }
    }catch{return res.status(403).json({error:'Invalid request origin.'});}
  }
  next();
}
function requireJsonAuth(req,res,next){
  if(!req.is('application/json'))return res.status(415).json({error:'JSON requests required.'});
  next();
}

function resolveAvatarUrl(u){
  if(!u||!u.avatar)return null;
  if(/^https?:\/\//i.test(String(u.avatar)))return u.avatar;
  return 'https://cdn.discordapp.com/avatars/'+u.id+'/'+u.avatar+'.'+(String(u.avatar).startsWith('a_')?'gif':'png')+'?size=128';
}
function publicUser(u){
  if(!u)return null;
  const account=data.users[u.id];
  return {
    id:u.id,
    username:u.username,
    global_name:u.global_name||u.username,
    email:account?.email||u.email||null,
    avatar:resolveAvatarUrl({...u,avatar:account?.avatar||u.avatar}),
    authProviders:Array.isArray(account?.authProviders)?account.authProviders:(Array.isArray(u.authProviders)?u.authProviders:[]),
    twoFactorEnabled:Boolean(account?.twoFactorEnabled)
  };
}
function buildSessionUser(account,id){
  return {
    id,
    email:account.email||null,
    username:account.username||account.global_name||'Member',
    global_name:account.global_name||account.username||'Member',
    avatar:account.avatar||null,
    sessionVersion:Number(account.sessionVersion)||1,
    loggedAt:Date.now()
  };
}
function findUserByEmail(email,canonicalEmail){
  for(const [id,u] of Object.entries(data.users)){
    if(!u)continue;
    if(u.email&&u.email.toLowerCase()===email)return {id,user:u};
    if(canonicalEmail&&u.canonicalEmail&&u.canonicalEmail===canonicalEmail)return {id,user:u};
    if(canonicalEmail&&u.email){
      const parsed=normalizeEmail(u.email);
      if(parsed.valid&&parsed.canonicalEmail===canonicalEmail)return {id,user:u};
    }
  }
  return null;
}
function findUserByGoogleSub(sub){
  for(const [id,u] of Object.entries(data.users)){
    if(u&&u.googleSub===sub)return {id,user:u};
  }
  return null;
}
function auth(req,res,next){
  if(!req.session.user)return res.status(401).json({error:'LOGIN_REQUIRED'});
  const account=data.users[req.session.user.id];
  if(account?.status==='suspended')return res.status(403).json({error:'ACCOUNT_SUSPENDED'});
  const expectedVer=Number(account?.sessionVersion||1);
  const tokenVer=Number(req.session.user.sessionVersion||1);
  if(account&&tokenVer!==expectedVer){
    req.session.destroy(()=>{});
    return res.status(401).json({error:'SESSION_REVOKED'});
  }
  next();
}
function oauthPopupResponse(res,{ok,type,message}){
  const payload=JSON.stringify({type:type||(ok?'OAUTH_AUTH_SUCCESS':'OAUTH_AUTH_ERROR'),ok:Boolean(ok),message:message||''});
  const redirectTarget=ok?'/?login=success':('/?login=failed');
  res.set('Cache-Control','no-store');
  res.type('html').send(`<!doctype html><html><body style="background:#09090d;color:#fff;font-family:sans-serif;display:grid;place-items:center;min-height:100vh;margin:0"><div style="text-align:center;padding:24px"><p>${ok?'Authentication verified. Closing window...':String(message||'Authentication could not complete.')}</p><script>if(window.opener){window.opener.postMessage(${payload},'*');setTimeout(()=>window.close(),150);}else{window.location.href=${JSON.stringify(redirectTarget)};}</script></div></body></html>`);
}
async function rewardsFor(user){const u=ensureUser(user.id);return {connected:true,balance:u.balance,verifiedInvites:u.verifiedInvites,activeBoosts:u.activeBoosts,rewards:[],message:null,inviteTiers,boostTiers,referralCode:user.id};}
app.get('/api/health',(req,r)=>{
  const g=resolveGoogleOAuthConfig(req);
  r.json({ok:true,service:'helzerx-freehost',discordConfigured:Boolean(process.env.DISCORD_CLIENT_ID&&process.env.DISCORD_CLIENT_SECRET),googleConfigured:g.configured,emailAuthEnabled:true,rewardsConfigured:Boolean(process.env.REWARDS_API_URL&&process.env.REWARDS_API_TOKEN),proxmox:{enabled:proxmoxReadiness().enabled,ready:proxmoxReadiness().ready},pterodactyl:pterodactylReadiness()});
});
app.get('/api/auth/providers',(req,res)=>{
  const g=resolveGoogleOAuthConfig(req);
  res.set('Cache-Control','no-store');
  res.json({
    emailAuthEnabled:true,
    discordConfigured:Boolean(process.env.DISCORD_CLIENT_ID&&process.env.DISCORD_CLIENT_SECRET&&process.env.DISCORD_REDIRECT_URI),
    googleConfigured:g.configured,
    googleRedirectUri:g.redirectUri,
    minPasswordLength:10,
    twoFactorSupported:true
  });
});

function buildDiscordAuthUrl({referral='',popup=false}){
  const state=crypto.randomBytes(32).toString('hex');
  pendingOAuth.set(state,{provider:'discord',createdAt:Date.now(),referral,popup:Boolean(popup)});
  for(const [k,v] of pendingOAuth)if(Date.now()-v.createdAt>600000)pendingOAuth.delete(k);
  const u=new URL('https://discord.com/oauth2/authorize');
  u.searchParams.set('client_id',process.env.DISCORD_CLIENT_ID);
  u.searchParams.set('response_type','code');
  u.searchParams.set('redirect_uri',process.env.DISCORD_REDIRECT_URI);
  u.searchParams.set('scope','identify guilds');
  u.searchParams.set('state',state);
  return u.toString();
}
app.get('/api/auth/discord/url',(req,res)=>{
  if(!process.env.DISCORD_CLIENT_ID||!process.env.DISCORD_REDIRECT_URI)return res.status(503).json({configured:false,error:'Discord OAuth is not configured yet.'});
  const url=buildDiscordAuthUrl({referral:typeof req.query.ref==='string'?req.query.ref:'',popup:true});
  res.set('Cache-Control','no-store');
  res.json({configured:true,url});
});
app.get('/api/auth/discord',(req,res)=>{
  if(!process.env.DISCORD_CLIENT_ID||!process.env.DISCORD_REDIRECT_URI)return res.status(503).send('Discord login is not configured yet.');
  res.redirect(buildDiscordAuthUrl({referral:typeof req.query.ref==='string'?req.query.ref:'',popup:false}));
});
app.get(['/api/auth/discord/callback','/api/auth/discord/callback/'],async(req,res)=>{
  const {code,state,error}=req.query;
  const issued=pendingOAuth.get(String(state||''));pendingOAuth.delete(String(state||''));
  const isPopup=Boolean(issued?.popup);
  if(error){return isPopup?oauthPopupResponse(res,{ok:false,message:'Discord login was cancelled.'}):res.redirect('/?login=cancelled');}
  const referral=issued?.referral||'';
  if(!issued||issued.provider!=='discord'||Date.now()-issued.createdAt>600000||typeof code!=='string'){
    return isPopup?oauthPopupResponse(res,{ok:false,message:'Invalid or expired Discord login state.'}):res.status(400).send('Invalid or expired Discord login state. Please return and try again.');
  }
  try{
    const form=new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID,client_secret:process.env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:process.env.DISCORD_REDIRECT_URI});
    const tr=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:form,signal:AbortSignal.timeout(10000)});const tok=await tr.json();if(!tr.ok||!tok.access_token)throw new Error('Discord token exchange failed');
    const guildsResponse=await discordGuildMemberships(tok.access_token);let guilds=[];if(guildsResponse.ok)guilds=await guildsResponse.json();if(process.env.DISCORD_GUILD_ID&&(!guildsResponse.ok||!guilds.some(g=>g.id===process.env.DISCORD_GUILD_ID)))return isPopup?oauthPopupResponse(res,{ok:false,type:'OAUTH_JOIN_DISCORD',message:'Join the official HelzerX Discord server to sign in.'}):res.redirect('/?login=join-discord');
    const mr=await fetch('https://discord.com/api/users/@me',{headers:{Authorization:'Bearer '+tok.access_token,Accept:'application/json'},signal:AbortSignal.timeout(10000)});const me=await mr.json();if(!mr.ok||!me.id)throw new Error('Discord identity lookup failed');
    const member=ensureUser(me.id);
    if(member.status==='suspended')return isPopup?oauthPopupResponse(res,{ok:false,message:'Account is suspended.'}):res.redirect('/?login=failed');
    member.username=me.username;member.global_name=me.global_name||me.username;member.avatar=me.avatar||member.avatar||null;
    if(!member.authProviders.includes('discord'))member.authProviders.push('discord');
    if(referral&&referral!==me.id&&!member.referrer&&!member.pendingReferrer&&data.users[referral]){member.pendingReferrer=referral;data.inviteClaims.push({id:crypto.randomUUID(),referrerId:referral,inviteeId:me.id,inviteeUsername:me.username,status:'pending',createdAt:new Date().toISOString()});}
    await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
    if(member.twoFactorEnabled){
      req.session.pending2fa={userId:me.id,method:'totp',issuedAt:Date.now(),provider:'discord'};
      writeData();
      return req.session.save(e=>{
        if(e)return res.status(500).send('Could not initialize 2FA challenge.');
        return isPopup?oauthPopupResponse(res,{ok:true,type:'OAUTH_2FA_REQUIRED',message:'2FA verification required.'}):res.redirect('/?login=2fa');
      });
    }
    req.session.user=buildSessionUser(member,me.id);
    recordSecurityEvent(member,req,'oauth_discord_login','Signed in via Discord OAuth2','success');
    writeData();
    req.session.save(e=>{
      if(e)return res.status(500).send('Could not create a secure session. Please try again.');
      return isPopup?oauthPopupResponse(res,{ok:true}):res.redirect('/?login=success');
    });
  }catch(e){
    console.error('[discord OAuth]',e.message);
    return isPopup?oauthPopupResponse(res,{ok:false,message:'Discord authentication failed.'}):res.redirect('/?login=failed');
  }
});

function buildGoogleAuthUrl(req,{referral='',popup=true}){
  const cfg=resolveGoogleOAuthConfig(req);
  if(!cfg.configured)return null;
  const state=crypto.randomBytes(32).toString('hex');
  const pkce=buildPkceChallenge();
  pendingOAuth.set(state,{provider:'google',createdAt:Date.now(),referral,popup:Boolean(popup),verifier:pkce.verifier,redirectUri:cfg.redirectUri});
  for(const [k,v] of pendingOAuth)if(Date.now()-v.createdAt>600000)pendingOAuth.delete(k);
  const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id',cfg.clientId);
  u.searchParams.set('redirect_uri',cfg.redirectUri);
  u.searchParams.set('response_type','code');
  u.searchParams.set('scope','openid email profile');
  u.searchParams.set('state',state);
  u.searchParams.set('code_challenge',pkce.challenge);
  u.searchParams.set('code_challenge_method','S256');
  u.searchParams.set('prompt','select_account');
  return u.toString();
}
app.get('/api/auth/google/url',(req,res)=>{
  const cfg=resolveGoogleOAuthConfig(req);
  res.set('Cache-Control','no-store');
  if(!cfg.configured)return res.json({configured:false,redirectUri:cfg.redirectUri});
  const url=buildGoogleAuthUrl(req,{referral:typeof req.query.ref==='string'?req.query.ref:'',popup:true});
  res.json({configured:true,url,redirectUri:cfg.redirectUri});
});
app.get('/api/auth/google',(req,res)=>{
  const url=buildGoogleAuthUrl(req,{referral:typeof req.query.ref==='string'?req.query.ref:'',popup:false});
  if(!url)return res.status(503).send('Google OAuth is not configured yet.');
  res.redirect(url);
});
app.get(['/api/auth/google/callback','/api/auth/google/callback/'],async(req,res)=>{
  const {code,state,error}=req.query;
  const issued=pendingOAuth.get(String(state||''));pendingOAuth.delete(String(state||''));
  const isPopup=issued?Boolean(issued.popup):true;
  if(error)return oauthPopupResponse(res,{ok:false,message:'Google sign-in was cancelled.'});
  if(!issued||issued.provider!=='google'||Date.now()-issued.createdAt>600000||typeof code!=='string'){
    return oauthPopupResponse(res,{ok:false,message:'Invalid or expired Google login state. Please retry.'});
  }
  const cfg=resolveGoogleOAuthConfig(req);
  if(!cfg.configured)return oauthPopupResponse(res,{ok:false,message:'Google OAuth is not configured on the server.'});
  try{
    const form=new URLSearchParams({
      client_id:cfg.clientId,
      client_secret:cfg.clientSecret,
      code,
      code_verifier:issued.verifier,
      grant_type:'authorization_code',
      redirect_uri:issued.redirectUri||cfg.redirectUri
    });
    const tr=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:form,signal:AbortSignal.timeout(10000)});
    const tok=await tr.json();
    if(!tr.ok||!tok.access_token)throw new Error('Google token exchange failed');
    const ur=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tok.access_token,Accept:'application/json'},signal:AbortSignal.timeout(10000)});
    const profile=await ur.json();
    if(!ur.ok||!profile.sub||!profile.email||profile.email_verified!==true){
      return oauthPopupResponse(res,{ok:false,message:'Google account must have a verified Gmail/email address.'});
    }
    const parsed=normalizeEmail(profile.email);
    if(!parsed.valid)return oauthPopupResponse(res,{ok:false,message:parsed.error});
    let match=findUserByGoogleSub(profile.sub)||findUserByEmail(parsed.email,parsed.canonicalEmail);
    let userId=match?.id;
    let member=match?.user;
    if(!member){
      userId='usr_'+crypto.randomBytes(8).toString('hex');
      const displayName=String(profile.name||parsed.email.split('@')[0]).trim().slice(0,64);
      member={
        id:userId,
        email:parsed.email,
        canonicalEmail:parsed.canonicalEmail,
        emailVerified:true,
        googleSub:profile.sub,
        username:displayName,
        global_name:displayName,
        avatar:profile.picture||null,
        authProviders:['google'],
        balance:0,
        verifiedInvites:0,
        activeBoosts:0,
        referrer:null,
        pendingReferrer:null,
        creditedMilestones:[],
        sessionVersion:1,
        twoFactorEnabled:false,
        securityEvents:[],
        createdAt:Date.now()
      };
      data.users[userId]=member;
      if(issued.referral&&issued.referral!==userId&&data.users[issued.referral]){
        member.pendingReferrer=issued.referral;
        data.inviteClaims.push({id:crypto.randomUUID(),referrerId:issued.referral,inviteeId:userId,inviteeUsername:displayName,status:'pending',createdAt:new Date().toISOString()});
      }
      recordSecurityEvent(member,req,'account_created','Account created via Google (Gmail) OAuth','success');
    }else{
      ensureUser(userId);
      if(member.status==='suspended')return oauthPopupResponse(res,{ok:false,message:'Account is suspended.'});
      member.googleSub=profile.sub;
      member.emailVerified=true;
      if(!member.email)member.email=parsed.email;
      if(!member.canonicalEmail)member.canonicalEmail=parsed.canonicalEmail;
      if(profile.picture&&!member.avatar)member.avatar=profile.picture;
      if(!member.authProviders.includes('google'))member.authProviders.push('google');
    }
    await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
    if(member.twoFactorEnabled){
      req.session.pending2fa={userId,method:'totp',issuedAt:Date.now(),provider:'google'};
      writeData();
      return req.session.save(e=>{
        if(e)return oauthPopupResponse(res,{ok:false,message:'Could not initialize 2FA verification.'});
        return oauthPopupResponse(res,{ok:true,type:'OAUTH_2FA_REQUIRED',message:'Enter your 2FA code to complete Google sign-in.'});
      });
    }
    req.session.user=buildSessionUser(member,userId);
    recordSecurityEvent(member,req,'oauth_google_login',`Signed in via Google (${parsed.email})`,'success');
    writeData();
    req.session.save(e=>{
      if(e)return oauthPopupResponse(res,{ok:false,message:'Could not create secure session.'});
      return isPopup?oauthPopupResponse(res,{ok:true}):res.redirect('/?login=success');
    });
  }catch(e){
    console.error('[google OAuth]',e.message);
    return oauthPopupResponse(res,{ok:false,message:'Google sign-in failed. Please try again.'});
  }
});

app.post('/api/auth/register',sameOriginAuthGuard,requireJsonAuth,async(req,res)=>{
  const ip=clientIp(req);
  const ipCheck=registerIpLimiter.check(ip);
  if(!ipCheck.allowed){
    res.set('Retry-After',String(ipCheck.retryAfterSeconds));
    return res.status(429).json({error:'Too many accounts created from this network. Please try again later.'});
  }
  const firstName=String(req.body?.firstName||'').trim();
  const lastName=String(req.body?.lastName||'').trim();
  const rawEmail=String(req.body?.email||'');
  const password=String(req.body?.password||'');
  const referral=String(req.body?.referralCode||'').trim();

  if(!firstName||firstName.length<2||firstName.length>40){
    return res.status(400).json({error:'First name must be 2–40 characters.'});
  }
  if(lastName.length>40){
    return res.status(400).json({error:'Last name must be at most 40 characters.'});
  }

  const parsedEmail=normalizeEmail(rawEmail);
  if(!parsedEmail.valid){
    return res.status(400).json({error:parsedEmail.error});
  }

  const fullName=(firstName+(lastName?' '+lastName:'')).trim();
  const pwdCheck=validatePasswordStrength(password,{email:parsedEmail.email,name:fullName});
  if(!pwdCheck.valid){
    return res.status(400).json({error:'Password is too weak: '+pwdCheck.errors[0]+'.',requirements:pwdCheck.errors});
  }

  const existing=findUserByEmail(parsedEmail.email,parsedEmail.canonicalEmail);
  if(existing){
    registerIpLimiter.recordFailure(ip);
    return res.status(409).json({error:'An account with this email address already exists. Please log in.'});
  }

  const {salt,hash:passwordHash}=hashPassword(password);
  const id='usr_'+crypto.randomBytes(8).toString('hex');
  const username=fullName||parsedEmail.email.split('@')[0];

  const userRecord={
    id,
    email:parsedEmail.email,
    canonicalEmail:parsedEmail.canonicalEmail,
    emailVerified:true,
    salt,
    passwordHash,
    username,
    global_name:username,
    authProviders:['email'],
    balance:0,
    verifiedInvites:0,
    activeBoosts:0,
    referrer:null,
    pendingReferrer:null,
    creditedMilestones:[],
    sessionVersion:1,
    twoFactorEnabled:false,
    securityEvents:[],
    createdAt:Date.now()
  };

  data.users[id]=userRecord;

  if(referral&&referral!==id&&data.users[referral]){
    userRecord.pendingReferrer=referral;
    data.inviteClaims.push({
      id:crypto.randomUUID(),
      referrerId:referral,
      inviteeId:id,
      inviteeUsername:username,
      status:'pending',
      createdAt:new Date().toISOString()
    });
  }

  registerIpLimiter.recordFailure(ip);
  recordSecurityEvent(userRecord,req,'account_created',`Account registered with ${parsedEmail.isGmail?'Gmail':'Email'} (${parsedEmail.email})`,'success');
  writeData();

  try{
    await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
    req.session.user=buildSessionUser(userRecord,id);
    req.session.save(e=>{
      if(e)return res.status(500).json({error:'Failed to initialize secure session'});
      res.status(201).json({ok:true,user:publicUser(req.session.user)});
    });
  }catch{
    res.status(500).json({error:'Failed to initialize secure session'});
  }
});

app.post('/api/auth/login',sameOriginAuthGuard,requireJsonAuth,async(req,res)=>{
  const ip=clientIp(req);
  const rawEmail=String(req.body?.email||'').trim().toLowerCase();
  const password=String(req.body?.password||'');

  if(!rawEmail||!password){
    return res.status(400).json({error:'Please enter your email and password.'});
  }

  const ipGate=loginIpLimiter.check(ip);
  if(!ipGate.allowed){
    res.set('Retry-After',String(ipGate.retryAfterSeconds));
    return res.status(429).json({error:'Too many failed sign-in attempts. Please wait 15 minutes before retrying.'});
  }
  const emailGate=loginEmailLimiter.check(rawEmail);
  if(!emailGate.allowed){
    res.set('Retry-After',String(emailGate.retryAfterSeconds));
    return res.status(429).json({error:'This account is temporarily locked due to repeated failed sign-in attempts. Try again in 15 minutes.'});
  }

  const parsed=normalizeEmail(rawEmail);
  const match=findUserByEmail(rawEmail,parsed.valid?parsed.canonicalEmail:null);
  const foundId=match?.id;
  const foundUser=match?.user;

  if(!foundUser||!foundUser.passwordHash||!foundUser.salt){
    loginIpLimiter.recordFailure(ip);
    loginEmailLimiter.recordFailure(rawEmail);
    if(foundUser&&foundUser.authProviders?.includes('google')&&!foundUser.passwordHash){
      return res.status(401).json({error:'This account uses Google Sign-In. Continue with Google or set a password in Security Settings.'});
    }
    return res.status(401).json({error:'Invalid email or password.'});
  }

  if(foundUser.status==='suspended'){
    return res.status(403).json({error:'This account has been suspended. Contact support.'});
  }

  const valid=verifyPassword(password,foundUser.passwordHash,foundUser.salt);
  if(!valid){
    loginIpLimiter.recordFailure(ip);
    const failInfo=loginEmailLimiter.recordFailure(rawEmail);
    recordSecurityEvent(foundUser,req,'login_failed','Failed password attempt','warning');
    writeData();
    if(failInfo.blockedUntil>Date.now()){
      return res.status(429).json({error:'Account temporarily locked for 15 minutes after repeated failed sign-ins.'});
    }
    return res.status(401).json({error:'Invalid email or password.'});
  }

  loginIpLimiter.reset(ip);
  loginEmailLimiter.reset(rawEmail);
  ensureUser(foundId);

  try{
    await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
    if(foundUser.twoFactorEnabled){
      req.session.pending2fa={userId:foundId,method:'totp',issuedAt:Date.now(),provider:'email'};
      return req.session.save(e=>{
        if(e)return res.status(500).json({error:'Could not initialize 2FA challenge.'});
        res.json({ok:true,requires2fa:true,method:'totp',emailHint:foundUser.email});
      });
    }
    req.session.user=buildSessionUser(foundUser,foundId);
    recordSecurityEvent(foundUser,req,'login_success','Signed in with Email & Password','success');
    writeData();
    req.session.save(e=>{
      if(e)return res.status(500).json({error:'Failed to initialize secure session'});
      res.json({ok:true,user:publicUser(req.session.user)});
    });
  }catch{
    res.status(500).json({error:'Failed to initialize secure session'});
  }
});

app.post('/api/auth/2fa/login-verify',sameOriginAuthGuard,requireJsonAuth,async(req,res)=>{
  const pending=req.session?.pending2fa;
  if(!pending||!pending.userId||Date.now()-Number(pending.issuedAt||0)>10*60*1000){
    return res.status(401).json({error:'2FA verification session expired. Please sign in again.'});
  }
  const limiterKey=`2fa:${pending.userId}:${clientIp(req)}`;
  const gate=twoFaLimiter.check(limiterKey);
  if(!gate.allowed){
    req.session.pending2fa=null;
    return res.status(429).json({error:'Too many invalid 2FA codes. Sign in again to restart verification.'});
  }
  const user=data.users[pending.userId];
  if(!user||!user.twoFactorEnabled||!user.totpSecret){
    return res.status(401).json({error:'Account 2FA configuration unavailable.'});
  }
  const code=String(req.body?.code||'').trim();
  let verifiedMethod=null;
  const totpResult=verifyTotpToken(user.totpSecret,code,user.lastTotpStep??null,1);
  if(totpResult.valid){
    user.lastTotpStep=totpResult.step;
    verifiedMethod='totp';
  }else{
    const backupRes=consumeBackupCode(user.backupCodeHashes,code);
    if(backupRes.valid)verifiedMethod='backup_code';
  }
  if(!verifiedMethod){
    twoFaLimiter.recordFailure(limiterKey);
    recordSecurityEvent(user,req,'2fa_failed','Invalid 2FA verification code entered','warning');
    writeData();
    return res.status(401).json({error:'Invalid 6-digit authenticator code or backup recovery code.'});
  }
  twoFaLimiter.reset(limiterKey);
  const userId=pending.userId;
  try{
    await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
    req.session.user=buildSessionUser(user,userId);
    recordSecurityEvent(user,req,verifiedMethod==='backup_code'?'2fa_backup_used':'login_success',verifiedMethod==='backup_code'?'Signed in using a one-time 2FA recovery code':'Signed in with 2FA Authenticator verification','success');
    writeData();
    req.session.save(e=>{
      if(e)return res.status(500).json({error:'Failed to initialize secure session'});
      res.json({ok:true,user:publicUser(req.session.user),usedBackupCode:verifiedMethod==='backup_code'});
    });
  }catch{
    res.status(500).json({error:'Failed to initialize secure session'});
  }
});

app.get('/api/auth/2fa/pending',(req,res)=>{
  const pending=req.session?.pending2fa;
  res.set('Cache-Control','no-store');
  if(!pending||Date.now()-Number(pending.issuedAt||0)>10*60*1000){
    return res.json({pending:false});
  }
  const user=data.users[pending.userId];
  res.json({pending:true,emailHint:user?.email||user?.username||'Account'});
});

app.get('/api/auth/security',auth,(req,res)=>{
  const u=ensureUser(req.session.user.id);
  const backupRemaining=Array.isArray(u.backupCodeHashes)?u.backupCodeHashes.filter(c=>c&&!c.usedAt).length:0;
  res.set('Cache-Control','no-store');
  res.json({
    id:req.session.user.id,
    email:u.email||null,
    emailVerified:Boolean(u.emailVerified),
    authProviders:u.authProviders,
    passwordSet:Boolean(u.passwordHash&&u.salt),
    twoFactorEnabled:Boolean(u.twoFactorEnabled),
    backupCodesRemaining:backupRemaining,
    sessionVersion:u.sessionVersion,
    securityEvents:u.securityEvents.slice(0,20)
  });
});

app.post('/api/auth/2fa/setup',auth,sameOriginAuthGuard,requireJsonAuth,async(req,res)=>{
  const u=ensureUser(req.session.user.id);
  if(u.twoFactorEnabled)return res.status(409).json({error:'Two-factor authentication is already enabled.'});
  const secret=generateTotpSecret();
  const payload=await buildTotpSetupPayload({secret,accountLabel:u.email||u.username||req.session.user.id});
  req.session.pending2faSetup={secret,createdAt:Date.now()};
  req.session.save(e=>{
    if(e)return res.status(500).json({error:'Could not store 2FA setup state.'});
    res.json({ok:true,secret,qrDataUrl:payload.qrDataUrl,otpauthUrl:payload.otpauthUrl});
  });
});

app.post('/api/auth/2fa/enable',auth,sameOriginAuthGuard,requireJsonAuth,(req,res)=>{
  const u=ensureUser(req.session.user.id);
  const setup=req.session.pending2faSetup;
  if(!setup||!setup.secret||Date.now()-Number(setup.createdAt||0)>15*60*1000){
    return res.status(400).json({error:'2FA setup expired. Click Generate Secret again.'});
  }
  const code=String(req.body?.code||'').trim();
  const check=verifyTotpToken(setup.secret,code,null,1);
  if(!check.valid){
    return res.status(400).json({error:'Invalid 6-digit code. Check your authenticator app clock and try again.'});
  }
  const {plainCodes,hashedCodes}=generateBackupCodes(8);
  u.totpSecret=setup.secret;
  u.twoFactorEnabled=true;
  u.lastTotpStep=check.step;
  u.backupCodeHashes=hashedCodes;
  req.session.pending2faSetup=null;
  recordSecurityEvent(u,req,'2fa_enabled','Enabled TOTP Two-Factor Authentication','success');
  writeData();
  res.json({ok:true,backupCodes:plainCodes});
});

app.post('/api/auth/2fa/disable',auth,sameOriginAuthGuard,requireJsonAuth,(req,res)=>{
  const u=ensureUser(req.session.user.id);
  if(!u.twoFactorEnabled)return res.status(400).json({error:'Two-factor authentication is not enabled.'});
  const password=String(req.body?.password||'');
  const code=String(req.body?.code||'').trim();
  if(u.passwordHash&&u.salt){
    if(!verifyPassword(password,u.passwordHash,u.salt)){
      return res.status(401).json({error:'Current password is incorrect.'});
    }
  }
  const totpRes=verifyTotpToken(u.totpSecret,code,u.lastTotpStep??null,1);
  if(!totpRes.valid){
    return res.status(401).json({error:'Enter a valid current 6-digit 2FA code to disable 2FA.'});
  }
  u.twoFactorEnabled=false;
  u.totpSecret=null;
  u.lastTotpStep=null;
  u.backupCodeHashes=[];
  recordSecurityEvent(u,req,'2fa_disabled','Disabled TOTP Two-Factor Authentication','warning');
  writeData();
  res.json({ok:true});
});

app.post('/api/auth/2fa/backup-codes',auth,sameOriginAuthGuard,requireJsonAuth,(req,res)=>{
  const u=ensureUser(req.session.user.id);
  if(!u.twoFactorEnabled)return res.status(400).json({error:'Enable 2FA first before generating backup codes.'});
  const code=String(req.body?.code||'').trim();
  const check=verifyTotpToken(u.totpSecret,code,u.lastTotpStep??null,1);
  if(!check.valid)return res.status(401).json({error:'Enter a valid 6-digit 2FA code to regenerate backup codes.'});
  u.lastTotpStep=check.step;
  const {plainCodes,hashedCodes}=generateBackupCodes(8);
  u.backupCodeHashes=hashedCodes;
  recordSecurityEvent(u,req,'2fa_backup_regenerated','Regenerated 8 backup recovery codes','info');
  writeData();
  res.json({ok:true,backupCodes:plainCodes});
});

app.post('/api/auth/password/change',auth,sameOriginAuthGuard,requireJsonAuth,(req,res)=>{
  const u=ensureUser(req.session.user.id);
  const currentPassword=String(req.body?.currentPassword||'');
  const newPassword=String(req.body?.newPassword||'');
  if(u.passwordHash&&u.salt){
    if(!currentPassword||!verifyPassword(currentPassword,u.passwordHash,u.salt)){
      return res.status(401).json({error:'Current password is incorrect.'});
    }
  }
  const check=validatePasswordStrength(newPassword,{email:u.email,name:u.username});
  if(!check.valid){
    return res.status(400).json({error:'New password is too weak: '+check.errors[0]+'.',requirements:check.errors});
  }
  const {salt,hash}=hashPassword(newPassword);
  u.salt=salt;
  u.passwordHash=hash;
  if(!u.authProviders.includes('email'))u.authProviders.push('email');
  u.sessionVersion=(Number(u.sessionVersion)||1)+1;
  req.session.user.sessionVersion=u.sessionVersion;
  recordSecurityEvent(u,req,'password_changed','Password updated & older device sessions rotated','success');
  writeData();
  req.session.save(e=>{
    if(e)return res.status(500).json({error:'Password updated but session refresh failed.'});
    res.json({ok:true,message:'Password updated securely. All other sessions have been signed out.'});
  });
});

app.post('/api/auth/sessions/revoke-all',auth,sameOriginAuthGuard,requireJsonAuth,(req,res)=>{
  const u=ensureUser(req.session.user.id);
  u.sessionVersion=(Number(u.sessionVersion)||1)+1;
  recordSecurityEvent(u,req,'sessions_revoked','Signed out all active browser sessions','warning');
  writeData();
  req.session.destroy(e=>{
    res.clearCookie('hx_freehost_sid',{httpOnly:true,secure:'auto',sameSite:'lax'});
    if(e)return res.status(500).json({error:'Failed to revoke current session.'});
    res.json({ok:true,message:'All active sessions signed out.'});
  });
});

app.post('/api/auth/logout',sameOriginAuthGuard,(req,res)=>req.session.destroy(e=>{
  res.clearCookie('hx_freehost_sid',{httpOnly:true,secure:'auto',sameSite:'lax'});
  if(e)return res.status(500).json({error:'Logout failed'});
  res.json({ok:true});
}));
app.get('/api/me',auth,async(req,res)=>{res.set('Cache-Control','no-store');res.json({user:publicUser(req.session.user),rewards:await rewardsFor(req.session.user)});});
app.get('/api/rewards',auth,async(req,res)=>{res.set('Cache-Control','no-store');res.json(await rewardsFor(req.session.user));});
app.get('/api/invites',auth,(req,res)=>{const u=ensureUser(req.session.user.id);res.set('Cache-Control','no-store');res.json({referralCode:req.session.user.id,referralUrl:(process.env.APP_URL||'https://perks.helzerx.cyou')+'/?ref='+encodeURIComponent(req.session.user.id),verifiedInvites:u.verifiedInvites,pendingInvites:data.inviteClaims.filter(c=>c.referrerId===req.session.user.id&&c.status==='pending').length,creditedMilestones:u.creditedMilestones});});
function configuredVpsNodes(){
 let list=[];try{list=JSON.parse(process.env.PROXMOX_NODES||'[]')}catch{}
 if(!Array.isArray(list)||!list.length)list=[{id:String(process.env.PROXMOX_NODE||'hlx-infra-02'),label:String(process.env.PROXMOX_NODE||'hlx-infra-02'),surcharge:0}];
 return list.filter(x=>x&&typeof x.id==='string'&&/^[A-Za-z0-9_.-]{1,64}$/.test(x.id)).map(x=>({id:x.id,label:String(x.label||x.id).slice(0,80),surcharge:Number.isSafeInteger(Number(x.surcharge))&&Number(x.surcharge)>=0?Number(x.surcharge):0}));
}
function configuredVpsOs(){
 let list=[];try{list=JSON.parse(process.env.PROXMOX_OS_OPTIONS||'[]')}catch{}
 if(!Array.isArray(list)||!list.length){const template=String(process.env.PROXMOX_TEMPLATE||'').trim();if(template)list=[{id:'default',label:'Default Linux template',template,surcharge:0}];}
 return list.filter(x=>x&&typeof x.id==='string'&&/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(x.id)&&typeof x.template==='string'&&x.template.trim()).map(x=>({id:x.id,label:String(x.label||x.id).slice(0,80),template:x.template.trim(),surcharge:Number.isSafeInteger(Number(x.surcharge))&&Number(x.surcharge)>=0?Number(x.surcharge):0}));
}
app.get('/api/hosting-templates',auth,async(req,res)=>{
 res.set('Cache-Control','private, no-store');
 const nodeId=String(req.query?.nodeId||process.env.PROXMOX_NODE||'');
 if(!configuredVpsNodes().some(x=>x.id===nodeId))return res.status(400).json({error:'Selected Proxmox node is not in the server allowlist.'});
 try{
  const templates=await listLxcTemplates({node:nodeId});
  return res.json({templates:templates.map(({id,label,template,storage,size,surcharge})=>({id,label,template,storage,size,surcharge}))});
 }catch(error){
  console.error('[hosting templates] Could not load templates for node '+nodeId+':',String(error?.message||error).slice(0,300));
  return res.status(503).json({error:'Could not load operating systems from Proxmox. Check API permissions and template storage, then retry.'});
 }
});

app.get('/api/hosting-options',auth,async(_req,res)=>{
 const options=data.plans.filter(x=>x.enabled!==false);
 const readiness=proxmoxReadiness();
 const pteroReadiness=pterodactylReadiness();
 const mcEggs=await listMinecraftEggs();
 const mcNodes=await listMinecraftNodes();
 res.set('Cache-Control','no-store');
 res.json({
  options:options.map(({id,service,name,cost,description,proxmox,pterodactyl})=>({
   id,service,name,cost,description,
   ...(proxmox&&typeof proxmox==='object'?{resources:{cores:Number(proxmox.cores)||0,memory:Number(proxmox.memory)||0,disk:Number(proxmox.disk)||0}}:{}),
   ...(pterodactyl&&typeof pterodactyl==='object'?{pterodactyl:{memory:Number(pterodactyl.memory)||2048,cores:Number(pterodactyl.cores)||1,disk:Number(pterodactyl.disk)||10}}:{})
  })),
  nodes:configuredVpsNodes(),
  osOptions:configuredVpsOs().map(({id,label,surcharge})=>({id,label,surcharge})),
  provisioning:{enabled:readiness.enabled,ready:readiness.ready},
  pterodactyl:{enabled:pteroReadiness.enabled,ready:pteroReadiness.ready,panelUrl:pteroReadiness.panelUrl,mode:pteroReadiness.mode},
  mcEggs,
  mcNodes
 })});

// User-owned LXC control APIs. Every lookup is scoped to the signed-in account.
function ownedLxcRequest(req,res,allowedStatuses){
 const item=data.hostingRequests.find(x=>x.id===req.params.id&&x.userId===req.session.user.id);
 if(!item){res.status(404).json({error:'Hosting instance not found.'});return null;}
 if(item.service!=='lxc'||!Number.isInteger(Number(item.vmid))){res.status(409).json({error:'This instance does not support LXC controls.'});return null;}
 if(allowedStatuses&&!allowedStatuses.includes(item.status)){res.status(409).json({error:'This action is not available for the instance current status.'});return null;}
 return item;
}
function recordUserVpsAction(req,item,action,details={}){
 data.auditLogs.unshift({id:crypto.randomUUID(),actorId:req.session.user.id,actorName:req.session.user.username||'user',actorRole:'user',action,targetType:'hosting_request',targetId:item.id,details,createdAt:new Date().toISOString()});
 if(data.auditLogs.length>5000)data.auditLogs.length=5000;
}
app.get('/api/control/instances/:id/inspect',auth,async(req,res)=>{
 const item=ownedLxcRequest(req,res,['provisioned','suspended','provisioning-error']);if(!item)return;
 try{const live=await inspectLxc({vmid:item.vmid,node:item.nodeId});res.set('Cache-Control','no-store');res.json({ok:true,request:{id:item.id,vmid:item.vmid,hostname:item.hostname,planName:item.planName,status:item.status,createdAt:item.createdAt,updatedAt:item.updatedAt},live});}
 catch(error){res.status(502).json({error:String(error.message||'Could not inspect instance').slice(0,400)});}
});
app.post('/api/control/instances/:id/action',auth,adminMutationOrigin,async(req,res)=>{
 const action=String(req.body?.action||'');
 if(!['start','stop','reboot','suspend','resume'].includes(action))return res.status(400).json({error:'Unsupported instance action.'});
 const allowed=action==='start'||action==='resume'?['suspended','provisioned']:['provisioned','suspended'];
 const item=ownedLxcRequest(req,res,allowed);if(!item)return;
 if(['start','resume'].includes(action)&&item.status==='provisioned'&&action==='start')return res.status(409).json({error:'Instance is already marked as running.'});
 try{
  const result=await manageLxc({vmid:item.vmid,action,node:item.nodeId});
  item.updatedAt=new Date().toISOString();
  if(['suspend','stop'].includes(action)){item.status='suspended';item.provisioningStatus='container-stopped';}
  else {item.status='provisioned';item.provisioningStatus='container-running';}
  recordUserVpsAction(req,item,'user_vps_'+action,{vmid:item.vmid});writeData();
  res.json({ok:true,request:{id:item.id,status:item.status,vmid:item.vmid,hostname:item.hostname},proxmox:result});
 }catch(error){res.status(502).json({error:String(error.message||'Instance action failed').slice(0,400)});}
});
app.post('/api/control/instances/:id/terminal',auth,adminMutationOrigin,async(req,res)=>{
 const item=ownedLxcRequest(req,res,['provisioned']);if(!item)return;
 const command=String(req.body?.command||'');
 if(!command.trim()||command.length>4000)return res.status(400).json({error:'Command must be 1–4000 characters.'});
 try{
  const live=await inspectLxc({vmid:item.vmid,node:item.nodeId});
  if(live.status?.status!=='running')return res.status(409).json({error:'Instance is not running. Start it before using the terminal.'});
  const result=await runLxcTerminal({vmid:item.vmid,command,node:item.nodeId});
  recordUserVpsAction(req,item,'user_vps_terminal_command',{vmid:item.vmid,commandLength:command.length});writeData();
  res.json({ok:true,...result});
 }catch(error){res.status(502).json({error:String(error.message||'Terminal command failed').slice(0,400)});}
});
app.post('/api/control/instances/:id/snapshots',auth,adminMutationOrigin,async(req,res)=>{
 const item=ownedLxcRequest(req,res,['provisioned','suspended']);if(!item)return;
 const action=String(req.body?.action||''),name=String(req.body?.name||'').trim();
 if(!['create','delete'].includes(action))return res.status(400).json({error:'Snapshot action must be create or delete.'});
 if(action==='delete'&&!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(name))return res.status(400).json({error:'Invalid snapshot name.'});
 try{
  if(action==='delete'){const live=await inspectLxc({vmid:item.vmid,node:item.nodeId});if(!(live.snapshots||[]).some(x=>x.name===name))return res.status(404).json({error:'Snapshot not found.'});}
  const result=await manageLxcSnapshot({vmid:item.vmid,action,name,node:item.nodeId});
  recordUserVpsAction(req,item,'user_vps_snapshot_'+action,{vmid:item.vmid,name});writeData();
  res.json({ok:true,...result});
 }catch(error){res.status(502).json({error:String(error.message||'Snapshot operation failed').slice(0,400)});}
});
app.post('/api/hosting-requests/:id/remove-failed',auth,adminMutationOrigin,(req,res)=>{
 const index=data.hostingRequests.findIndex(x=>x.id===req.params.id&&x.userId===req.session.user.id);
 if(index<0)return res.status(404).json({error:'Hosting request not found.'});
 const item=data.hostingRequests[index];
 const removableStatuses=new Set(['provisioning-error','failed','rejected','cancelled']);
 if(!removableStatuses.has(String(item.status||'').toLowerCase()))return res.status(409).json({error:'Only failed, rejected or cancelled requests can be removed.'});
 if(item.vmid!==undefined&&item.vmid!==null&&String(item.vmid).trim()!=='')return res.status(409).json({error:'This failed request has a VMID assigned. Contact support to verify and clean up the Proxmox container before removing its record.'});
 data.hostingRequests.splice(index,1);
 if(!Array.isArray(data.auditLogs))data.auditLogs=[];
 data.auditLogs.unshift({id:crypto.randomUUID(),actorId:req.session.user.id,actorName:req.session.user.username||'user',actorRole:'user',action:'user_removed_failed_hosting_request',targetType:'hosting_request',targetId:item.id,details:{status:item.status,service:item.service},createdAt:new Date().toISOString()});
 if(data.auditLogs.length>5000)data.auditLogs.length=5000;
 writeData();
 res.json({ok:true,message:'Failed hosting request removed.',id:item.id});
});
// User-owned Minecraft control helpers
function ownedMcRequest(req,res){
 const item=data.hostingRequests.find(x=>x.id===req.params.id&&x.userId===req.session.user.id);
 if(!item){res.status(404).json({error:'Minecraft server not found.'});return null;}
 if(item.service!=='minecraft'||!item.identifier){res.status(409).json({error:'This instance does not support Minecraft controls.'});return null;}
 return item;
}

app.get('/api/control/mc/:id/inspect',auth,async(req,res)=>{
 const item=ownedMcRequest(req,res);if(!item)return;
 try{
  const live=await inspectMinecraftServer({identifier:item.identifier,serverId:item.pterodactylId});
  res.set('Cache-Control','no-store');
  res.json({ok:true,request:{id:item.id,identifier:item.identifier,hostname:item.hostname,status:item.status,serverIp:item.serverIp,serverPort:item.serverPort,panelUrl:item.panelUrl,planName:item.planName},live});
 }catch(error){
  res.status(502).json({error:String(error.message||'Could not inspect Minecraft server').slice(0,400)});
 }
});

app.post('/api/control/mc/:id/action',auth,adminMutationOrigin,async(req,res)=>{
 const item=ownedMcRequest(req,res);if(!item)return;
 const action=String(req.body?.action||'');
 if(!['start','stop','restart','kill'].includes(action))return res.status(400).json({error:'Action must be start, stop, restart, or kill.'});
 try{
  const result=await manageMinecraftServer({identifier:item.identifier,action});
  item.updatedAt=new Date().toISOString();
  if(action==='stop'||action==='kill'){item.status='suspended';item.provisioningStatus='server-stopped';}
  else {item.status='provisioned';item.provisioningStatus='server-running';}
  data.auditLogs.unshift({id:crypto.randomUUID(),actorId:req.session.user.id,actorName:req.session.user.username||'user',actorRole:'user',action:'user_mc_'+action,targetType:'hosting_request',targetId:item.id,details:{identifier:item.identifier,action},createdAt:new Date().toISOString()});
  if(data.auditLogs.length>5000)data.auditLogs.length=5000;
  writeData();
  res.json({ok:true,request:{id:item.id,status:item.status,identifier:item.identifier},result});
 }catch(error){
  res.status(502).json({error:String(error.message||'Minecraft server action failed').slice(0,400)});
 }
});

app.post('/api/control/mc/:id/command',auth,adminMutationOrigin,async(req,res)=>{
 const item=ownedMcRequest(req,res);if(!item)return;
 const command=String(req.body?.command||'').trim();
 if(!command||command.length>500)return res.status(400).json({error:'Command must be 1–500 characters.'});
 try{
  const result=await sendMinecraftCommand({identifier:item.identifier,command});
  res.json({ok:true,...result});
 }catch(error){
  res.status(502).json({error:String(error.message||'Command failed').slice(0,400)});
 }
});

app.get('/api/hosting-requests',auth,(req,res)=>{
 res.set('Cache-Control','no-store');
 res.json({
  requests:data.hostingRequests.filter(x=>x.userId===req.session.user.id).map(({
   id,service,planName,cost,status,createdAt,updatedAt,vmid,hostname,
   nodeId,osId,osLabel,displayName,provisioningStatus,error,
   identifier,pterodactylId,serverIp,serverPort,nodeName,eggName,panelUrl
  })=>({
   id,service,planName,cost,status,createdAt,updatedAt,vmid,hostname,
   nodeId,osId,osLabel,displayName,provisioningStatus,error,
   identifier,pterodactylId,serverIp,serverPort,nodeName,eggName,panelUrl
  }))
 });
});

app.post('/api/hosting-requests',auth,adminMutationOrigin,async(req,res)=>{
 const service=String(req.body?.service||'');
 const planId=String(req.body?.planId||'');
 const option=data.plans.find(x=>x.enabled!==false&&x.id===planId&&x.service===service&&Number.isSafeInteger(x.cost)&&x.cost>0&&typeof x.name==='string');
 if(!option)return res.status(400).json({error:'This hosting plan is not currently configured for HZL redemption.'});
 const u=ensureUser(req.session.user.id);
 const displayName=String(req.body?.displayName||'').trim().toLowerCase();
 const nodeId=String(req.body?.nodeId||process.env.PROXMOX_NODE||'');
 const osId=String(req.body?.osId||'default');
 const rootPassword=String(req.body?.password||'');
 const nodes=configuredVpsNodes(),osOptions=configuredVpsOs();
 const selectedNode=nodes.find(x=>x.id===nodeId);
 let selectedOs=osOptions.find(x=>x.id===osId);

 if(service==='lxc'){
  if(!/^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/.test(displayName)||displayName.length<2)return res.status(400).json({error:'VPS name must be 2–30 lowercase letters, numbers or hyphens.'});
  if(!selectedNode)return res.status(400).json({error:'Selected Proxmox node is not in the server allowlist.'});
  let liveTemplates=[];
  try{liveTemplates=await listLxcTemplates({node:nodeId});}catch(error){return res.status(503).json({error:'Unable to read OS templates from Proxmox. Check node and storage permissions.'});}
  selectedOs=liveTemplates.find(x=>x.id===osId||x.template===osId);
  if(!selectedOs)return res.status(400).json({error:'That OS template is no longer available on the selected Proxmox node. Refresh the OS list.'});
  if(rootPassword.length<10||rootPassword.length>128||/[\x00-\x1f\x7f]/.test(rootPassword))return res.status(400).json({error:'Root password must be 10–128 characters without control characters.'});
 }

 const effectiveCost=option.cost+(service==='lxc'?(selectedNode?.surcharge||0)+(selectedOs?.surcharge||0):0);
 if(!Number.isSafeInteger(effectiveCost)||effectiveCost<=0)return res.status(400).json({error:'Invalid service price configuration.'});
 if(u.balance<effectiveCost)return res.status(400).json({error:'Not enough HZL for this configuration. Earn more HZL by inviting friends!'});

 if(data.hostingRequests.some(x=>x.userId===req.session.user.id&&(['pending','provisioning'].includes(x.status)||(service==='lxc'&&x.status==='provisioning-error'&&Number.isInteger(Number(x.vmid)))))){
  return res.status(409).json({error:service==='lxc'?'You already have a pending deployment or a VPS that needs reconciliation. Contact support before trying again.':'You already have a pending hosting request.'});
 }

 const now=new Date().toISOString();
 const request={
  id:crypto.randomUUID(),userId:req.session.user.id,username:req.session.user.username,service,
  planId:option.id,planName:option.name,displayName:displayName||undefined,cost:effectiveCost,
  ...(service==='lxc'?{nodeId,osId,osLabel:selectedOs.label}:{}),
  planSnapshot:{id:option.id,service:option.service,name:option.name,cost:effectiveCost,...(option.proxmox?{proxmox:{...option.proxmox}}:{}),...(option.pterodactyl?{pterodactyl:{...option.pterodactyl}}:{})},
  status:'provisioning',provisioningAttempts:1,createdAt:now,updatedAt:now
 };

 // Handle Minecraft Pterodactyl Creation
 if(service==='minecraft'){
  if(!displayName||displayName.length<2||displayName.length>30||!/^[a-z0-9](?:[a-z0-9_-]{0,28}[a-z0-9])?$/i.test(displayName)){
   return res.status(400).json({error:'Minecraft server name must be 2–30 letters, numbers, hyphens or underscores.'});
  }
  const eggId=String(req.body?.eggId||'paper-1.20');
  const mcNodeId=String(req.body?.nodeId||'hlx-mc-asia-01');

  // Reserve HZL
  u.balance-=effectiveCost;
  data.hostingRequests.push(request);
  data.auditLogs.unshift({id:crypto.randomUUID(),actorId:req.session.user.id,actorName:req.session.user.username||'user',actorRole:'user',action:'user_hzl_reserved_for_mc',targetType:'hosting_request',targetId:request.id,details:{planId:option.id,cost:effectiveCost,eggId,nodeId:mcNodeId},createdAt:now});
  if(data.auditLogs.length>5000)data.auditLogs.length=5000;
  writeData();

  try{
   const created=await provisionMinecraftServer({requestId:request.id,plan:option,user:req.session.user,serverName:displayName,eggId,nodeId:mcNodeId});
   request.status='provisioned';
   request.provisioningStatus='server-running';
   request.identifier=created.identifier;
   request.pterodactylId=created.id;
   request.serverIp=created.ip;
   request.serverPort=created.port;
   request.nodeName=created.node;
   request.eggName=created.egg;
   request.panelUrl=created.panelUrl;
   request.hostname=created.name;
   request.updatedAt=new Date().toISOString();

   data.auditLogs.unshift({id:crypto.randomUUID(),actorId:req.session.user.id,actorName:req.session.user.username||'user',actorRole:'user',action:'user_mc_created',targetType:'hosting_request',targetId:request.id,details:{identifier:created.identifier,ip:created.ip,port:created.port,cost:effectiveCost},createdAt:request.updatedAt});
   if(data.auditLogs.length>5000)data.auditLogs.length=5000;
   writeData();

   return res.status(201).json({
    ok:true,
    request:{
     id:request.id,service:'minecraft',planName:request.planName,cost:request.cost,status:request.status,
     identifier:created.identifier,hostname:created.name,serverIp:created.ip,serverPort:created.port,panelUrl:created.panelUrl
    },
    message:`Your Minecraft server "${created.name}" is online at ${created.ip}:${created.port}! ${effectiveCost} HZL has been deducted from your balance.`
   });
  }catch(error){
   request.updatedAt=new Date().toISOString();
   request.status='failed';
   request.provisioningStatus='failed-before-resource-allocation';
   request.error=String(error?.message||'Minecraft server provisioning failed').slice(0,500);
   u.balance+=effectiveCost;
   request.refundAmount=effectiveCost;
   request.refundedAt=request.updatedAt;

   data.auditLogs.unshift({id:crypto.randomUUID(),actorId:req.session.user.id,actorName:req.session.user.username||'user',actorRole:'user',action:'user_mc_provision_failed',targetType:'hosting_request',targetId:request.id,details:{planId:option.id,refunded:true,error:request.error},createdAt:request.updatedAt});
   if(data.auditLogs.length>5000)data.auditLogs.length=5000;
   writeData();
   return res.status(502).json({error:'Minecraft server creation failed. Your HZL has been refunded.',request:{id:request.id,status:request.status}});
  }
 }

 if(service!=='lxc'){
  request.status='pending';
  data.hostingRequests.push(request);writeData();
  return res.status(201).json({ok:true,request:{id:request.id,service,planName:request.planName,cost:request.cost,status:request.status},message:'Hosting request submitted for review. HZL is not deducted until an administrator approves it.'});
 }
 if(!option.proxmox||!Number.isInteger(Number(option.proxmox.cores))||Number(option.proxmox.cores)<1||!Number.isInteger(Number(option.proxmox.memory))||Number(option.proxmox.memory)<256||!Number.isInteger(Number(option.proxmox.disk))||Number(option.proxmox.disk)<2)return res.status(400).json({error:'This LXC plan is missing valid Proxmox resource settings. Please contact support.'});
 const readiness=proxmoxReadiness();
 if(!readiness.ready)return res.status(503).json({error:'Automatic LXC provisioning is not ready yet. Please try again later or contact support.',missing:readiness.missing});
 // Reserve HZL before starting the external Proxmox operation to prevent double-spending.
 u.balance-=effectiveCost;
 data.hostingRequests.push(request);
 data.auditLogs.unshift({id:crypto.randomUUID(),actorId:req.session.user.id,actorName:req.session.user.username||'user',actorRole:'user',action:'user_hzl_reserved_for_vps',targetType:'hosting_request',targetId:request.id,details:{planId:option.id,cost:effectiveCost,nodeId:service==='lxc'?nodeId:null,osId:service==='lxc'?osId:null},createdAt:now});
 if(data.auditLogs.length>5000)data.auditLogs.length=5000;
 writeData();
 try{
  const created=await provisionLxc({requestId:request.id,plan:request.planSnapshot,username:request.username,node:nodeId,template:selectedOs.template,hostname:displayName,rootPassword});
  request.status='provisioned';request.provisioningStatus='container-started';request.vmid=created.vmid;request.hostname=created.hostname;request.proxmoxTask=created.upid;request.proxmoxStartTask=created.startTask;request.nodeId=nodeId;request.osId=osId;request.updatedAt=new Date().toISOString();
  data.auditLogs.unshift({id:crypto.randomUUID(),actorId:req.session.user.id,actorName:req.session.user.username||'user',actorRole:'user',action:'user_vps_created',targetType:'hosting_request',targetId:request.id,details:{vmid:created.vmid,planId:option.id,cost:effectiveCost,nodeId,osId},createdAt:request.updatedAt});
  if(data.auditLogs.length>5000)data.auditLogs.length=5000;
  writeData();
  return res.status(201).json({ok:true,request:{id:request.id,service,planName:request.planName,cost:request.cost,status:request.status,vmid:request.vmid,hostname:request.hostname,nodeId,osId},rootPassword,...(created.generatedSshPrivateKey?{generatedSshPrivateKey:created.generatedSshPrivateKey}:{}),message:'Your LXC VPS has been created successfully. '+effectiveCost+' HZL has been deducted from your balance.'});
 }catch(error){
  request.updatedAt=new Date().toISOString();
  request.error=String(error?.message||'Proxmox provisioning failed').slice(0,500);
  if(Number.isInteger(Number(error?.vmid))&&Number(error.vmid)>0){
   request.status='provisioning-error';request.provisioningStatus='needs-admin-reconciliation';request.vmid=Number(error.vmid);
   request.error+=' HZL remains charged while this Proxmox VMID is checked to avoid duplicate resources.';
  }else{
   request.status='failed';request.provisioningStatus='failed-before-resource-allocation';u.balance+=effectiveCost;
   request.refundAmount=effectiveCost;request.refundedAt=request.updatedAt;
  }
  data.auditLogs.unshift({id:crypto.randomUUID(),actorId:req.session.user.id,actorName:req.session.user.username||'user',actorRole:'user',action:'user_vps_provision_failed',targetType:'hosting_request',targetId:request.id,details:{planId:option.id,vmid:request.vmid??null,refunded:!request.vmid,error:request.error},createdAt:request.updatedAt});
  if(data.auditLogs.length>5000)data.auditLogs.length=5000;
  try{writeData();}catch(persistError){console.error('[self-service LXC] Failed to persist error state for '+request.id+':',persistError);}
  console.error('[self-service LXC] Request '+request.id+' failed:',error?.stack||request.error);
  return res.status(502).json({error:request.vmid?'VPS provisioning needs a safety check. Your HZL is reserved and support must reconcile the Proxmox resource before retrying.':'VPS provisioning failed before a VMID was allocated; your HZL has been refunded.',request:{id:request.id,status:request.status,vmid:request.vmid??null}});
 }
});
app.get('/api/boost-rewards',auth,(_req,res)=>res.json({tiers:boostTiers,verification:'Boost rewards are submitted as claims and must be reviewed. Discord OAuth alone cannot verify active server boosts without a privileged integration.'}));
app.post('/api/boost-claims',auth,(req,res)=>{const count=Number(req.body?.boosts);if(![1,2,3,4,7,10].includes(count))return res.status(400).json({error:'Choose an eligible boost tier.'});const duplicate=data.claims.some(c=>c.userId===req.session.user.id&&c.status==='pending');if(duplicate)return res.status(409).json({error:'You already have a pending boost claim.'});const tier=boostTiers.find(x=>x[0]===count);data.claims.push({id:crypto.randomUUID(),userId:req.session.user.id,username:req.session.user.username,boosts:count,amount:tier[1],status:'pending',createdAt:new Date().toISOString()});writeData();res.status(201).json({ok:true,message:'Claim submitted for manual verification. HZL will only be credited after approval.'});});
app.get('/api/boost-claims',auth,(req,res)=>res.json({claims:data.claims.filter(c=>c.userId===req.session.user.id).map(({id,boosts,amount,status,createdAt})=>({id,boosts,amount,status,createdAt}))}));
function adminOnly(req,res,next){
 if(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD||!/^[0-9]{6}$/.test(String(process.env.STAFF_SECRET||'')))return res.status(503).json({error:'Secure staff sign-in is not configured.'});
 if(!req.session?.admin?.authenticated||req.session.admin.staffSecretVerified!==true||!req.session.admin.email||req.session.admin.email!==String(process.env.ADMIN_EMAIL||'').trim().toLowerCase())return res.status(401).json({error:'Sign-in required.'});
 if(Date.now()-Number(req.session.admin.loggedAt||0)>2*60*60*1000){req.session.destroy(()=>{});res.clearCookie('hx_freehost_sid',{httpOnly:true,secure:prod,sameSite:'lax',path:'/'});return res.status(401).json({error:'Admin session expired. Sign in again.'});}
 res.set('Cache-Control','no-store');next();
}
app.post('/api/admin/login',adminLoginLimiter,adminMutationOrigin,async(req,res)=>{
 const ip=req.ip||req.socket.remoteAddress||'unknown';
 const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||''),staffSecret=String(req.body?.staffSecret||'');
 const configuredEmail=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase(),configuredPassword=String(process.env.ADMIN_PASSWORD||''),configuredStaffSecret=String(process.env.STAFF_SECRET||'');
 if(!configuredEmail||!configuredPassword||!/^[0-9]{6}$/.test(configuredStaffSecret))return res.status(503).json({error:'Secure staff sign-in is not configured on the server.'});
 const validEmail=safeEqual(email,configuredEmail),validPassword=safeEqual(password,configuredPassword),validStaffSecret=safeEqual(staffSecret,configuredStaffSecret);
 const valid=Boolean(validEmail & validPassword & validStaffSecret);
 if(!valid){
  const now=Date.now();let state=adminLoginAttempts.get(ip);
  if(!state||now-state.startedAt>ADMIN_LOCK_WINDOW_MS)state={startedAt:now,count:0,blockedUntil:0};
  state.count++;if(state.count>=ADMIN_MAX_ATTEMPTS)state.blockedUntil=now+ADMIN_LOCK_WINDOW_MS;
  adminLoginAttempts.set(ip,state);
  return res.status(state.blockedUntil?429:401).json({error:state.blockedUntil?'Too many sign-in attempts. Try again in 15 minutes.':'Invalid email or password.'});
 }
 adminLoginAttempts.delete(ip);
 await new Promise((resolve,reject)=>req.session.regenerate(err=>err?reject(err):resolve()));
 req.session.admin={authenticated:true,staffSecretVerified:true,email:configuredEmail,loggedAt:Date.now()};
 req.session.save(err=>{if(err)return res.status(500).json({error:'Could not create secure admin session.'});res.set('Cache-Control','no-store');res.json({ok:true});});
});
app.get('/api/admin/session',adminOnly,(_req,res)=>res.json({ok:true}));
app.post('/api/admin/logout',adminMutationOrigin,(req,res)=>req.session.destroy(err=>{
 res.clearCookie('hx_freehost_sid',{httpOnly:true,secure:prod,sameSite:'lax',path:'/'});
 if(err)return res.status(500).json({error:'Sign-out failed.'});
 res.set('Cache-Control','no-store');res.json({ok:true});
}));
app.get('/api/admin/boost-claims',adminOnly,(_req,res)=>res.json({claims:data.claims}));
app.get('/api/admin/invite-claims',adminOnly,(_req,res)=>res.json({claims:data.inviteClaims.filter(c=>c.status==='pending')}));
app.post('/api/admin/invite-claims/:id/review',adminOnly,adminMutationOrigin,(req,res)=>{const claim=data.inviteClaims.find(c=>c.id===req.params.id);if(!claim)return res.status(404).json({error:'Invite claim not found'});if(claim.status!=='pending')return res.status(409).json({error:'Invite claim has already been reviewed'});const action=req.body?.action;if(!['approve','reject'].includes(action))return res.status(400).json({error:'Action must be approve or reject'});claim.status=action==='approve'?'approved':'rejected';claim.reviewedAt=new Date().toISOString();const invitee=ensureUser(claim.inviteeId);invitee.pendingReferrer=null;if(action==='approve'){invitee.referrer=claim.referrerId;const owner=ensureUser(claim.referrerId);owner.verifiedInvites+=1;creditInviteMilestones(claim.referrerId);}writeData();res.json({ok:true,claim});});
app.get('/api/admin/hosting-requests',adminOnly,(_req,res)=>res.json({requests:data.hostingRequests.map(({sshPublicKey,...x})=>x)}));
app.post('/api/admin/hosting-requests/:id/review',adminOnly,adminMutationOrigin,async(req,res)=>{const item=data.hostingRequests.find(x=>x.id===req.params.id);if(!item)return res.status(404).json({error:'Hosting request not found'});if(item.status!=='pending')return res.status(409).json({error:'Hosting request has already been reviewed'});const action=req.body?.action;if(!['approve','reject'].includes(action))return res.status(400).json({error:'Action must be approve or reject'});const u=ensureUser(item.userId);if(action==='reject'){item.status='rejected';item.reviewedAt=new Date().toISOString();item.updatedAt=item.reviewedAt;writeData();return res.json({ok:true,request:item})}if(u.balance<item.cost)return res.status(409).json({error:'User balance is no longer sufficient'});const plan=item.planSnapshot||data.plans.find(x=>x.id===item.planId&&x.service===item.service&&x.proxmox);if(!plan||!plan.proxmox||plan.service!=='lxc')return res.status(409).json({error:'Only explicitly configured LXC plans can be provisioned. No HZL was deducted.'});const readiness=proxmoxReadiness();if(!readiness.ready)return res.status(503).json({error:'Proxmox provisioning is not ready. No HZL was deducted.',missing:readiness.missing});u.balance-=item.cost;item.status='provisioning';item.provisioningStatus='creating-container';item.reviewedAt=new Date().toISOString();item.updatedAt=item.reviewedAt;item.provisioningAttempts=(item.provisioningAttempts||0)+1;writeData();try{const created=await provisionLxc({requestId:item.id,plan,username:item.username,sshPublicKey:item.sshPublicKey});item.status='provisioned';item.provisioningStatus='container-start-requested';item.vmid=created.vmid;item.hostname=created.hostname;item.proxmoxTask=created.upid;item.updatedAt=new Date().toISOString();writeData();return res.json({ok:true,request:item})}catch(e){item.status='provisioning-error';item.provisioningStatus='needs-admin-reconciliation';item.error=String(e.message||'Provisioning failed').slice(0,500);item.updatedAt=new Date().toISOString();writeData();console.error('[proxmox provisioning]',item.id,item.error);return res.status(502).json({error:'Provisioning did not complete cleanly. The request is locked against duplicate provisioning and requires admin reconciliation; HZL was not automatically refunded to avoid double provisioning.',request:{id:item.id,status:item.status,provisioningStatus:item.provisioningStatus}})}});
app.post('/api/admin/boost-claims/:id/review',adminOnly,adminMutationOrigin,(req,res)=>{const claim=data.claims.find(c=>c.id===req.params.id);if(!claim)return res.status(404).json({error:'Claim not found'});if(claim.status!=='pending')return res.status(409).json({error:'Claim has already been reviewed'});const action=req.body?.action;if(!['approve','reject'].includes(action))return res.status(400).json({error:'Action must be approve or reject'});claim.status=action==='approve'?'approved':'rejected';claim.reviewedAt=new Date().toISOString();if(action==='approve'){const u=ensureUser(claim.userId);u.balance+=claim.amount;u.activeBoosts=Math.max(u.activeBoosts,claim.boosts);}writeData();res.json({ok:true,claim});});

function auditAdmin(req,action,targetType,targetId,details={}) {
  data.auditLogs.unshift({id:crypto.randomUUID(),adminEmail:req.session.admin.email,action,targetType,targetId:String(targetId||''),details,createdAt:new Date().toISOString()});
  if(data.auditLogs.length>5000)data.auditLogs.length=5000;
}
function safeAdminUser(id,u) {
  return {id,username:u.username||u.global_name||'Unknown',email:u.email||null,balance:Number(u.balance)||0,verifiedInvites:Number(u.verifiedInvites)||0,activeBoosts:Number(u.activeBoosts)||0,createdAt:u.createdAt||null,status:u.status==='suspended'?'suspended':'active',avatar:u.avatar||null,referrer:u.referrer||null};
}
app.get('/api/tickets',auth,(req,res)=>{res.set('Cache-Control','no-store');res.json({tickets:data.tickets.filter(t=>t.userId===req.session.user.id).map(({messages=[],...t})=>({...t,messageCount:messages.length,lastMessageAt:messages.at(-1)?.createdAt||t.createdAt}))})});
app.post('/api/tickets',auth,adminMutationOrigin,(req,res)=>{
 const subject=String(req.body?.subject||'').trim(),message=String(req.body?.message||'').trim(),category=String(req.body?.category||'general');
 if(subject.length<4||subject.length>120)return res.status(400).json({error:'Ticket subject must be 4–120 characters.'});
 if(message.length<5||message.length>5000)return res.status(400).json({error:'Message must be 5–5000 characters.'});
 if(!['general','billing','technical','vps','account'].includes(category))return res.status(400).json({error:'Invalid ticket category.'});
 const openCount=data.tickets.filter(t=>t.userId===req.session.user.id&&t.status!=='closed').length;
 if(openCount>=10)return res.status(429).json({error:'You have reached the limit of 10 open tickets.'});
 const now=new Date().toISOString(),ticket={id:crypto.randomUUID(),userId:req.session.user.id,username:req.session.user.username||'Member',subject,category,status:'open',priority:'normal',createdAt:now,updatedAt:now,messages:[{id:crypto.randomUUID(),authorId:req.session.user.id,authorName:req.session.user.username||'Member',authorRole:'user',message,createdAt:now}]};
 data.tickets.push(ticket);writeData();res.status(201).json({ok:true,ticket:{...ticket}});
});
app.post('/api/tickets/:id/messages',auth,adminMutationOrigin,(req,res)=>{
 const ticket=data.tickets.find(t=>t.id===req.params.id&&t.userId===req.session.user.id);
 if(!ticket)return res.status(404).json({error:'Ticket not found.'});
 if(ticket.status==='closed')return res.status(409).json({error:'This ticket is closed.'});
 const message=String(req.body?.message||'').trim();if(message.length<1||message.length>5000)return res.status(400).json({error:'Message must be 1–5000 characters.'});
 const now=new Date().toISOString();ticket.messages.push({id:crypto.randomUUID(),authorId:req.session.user.id,authorName:req.session.user.username||'Member',authorRole:'user',message,createdAt:now});ticket.updatedAt=now;ticket.status='open';writeData();res.json({ok:true,ticket});
});
app.get('/api/tickets/:id',auth,(req,res)=>{const ticket=data.tickets.find(t=>t.id===req.params.id&&t.userId===req.session.user.id);if(!ticket)return res.status(404).json({error:'Ticket not found.'});res.set('Cache-Control','no-store');res.json({ticket})});

app.get('/api/admin/overview',adminOnly,(_req,res)=>{
 const users=Object.values(data.users),requests=data.hostingRequests;
 res.json({stats:{users:users.length,activeUsers:users.filter(u=>u.status!=='suspended').length,suspendedUsers:users.filter(u=>u.status==='suspended').length,openTickets:data.tickets.filter(t=>t.status!=='closed').length,pendingHosting:requests.filter(x=>x.status==='pending').length,activeVps:requests.filter(x=>['provisioned','suspended'].includes(x.status)).length,totalHzl:users.reduce((n,u)=>n+(Number(u.balance)||0),0)},proxmox:proxmoxReadiness()});
});
app.get('/api/admin/users',adminOnly,(req,res)=>{
 const q=String(req.query.q||'').trim().toLowerCase(),status=String(req.query.status||'all');
 const users=Object.entries(data.users).map(([id,u])=>safeAdminUser(id,u)).filter(u=>(!q||[u.id,u.username,u.email||''].some(v=>String(v).toLowerCase().includes(q)))&&(status==='all'||u.status===status)).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
 res.json({users,total:users.length});
});
app.get('/api/admin/users/:id',adminOnly,(req,res)=>{
 const u=data.users[req.params.id];if(!u)return res.status(404).json({error:'User not found.'});
 const id=req.params.id,hosting=data.hostingRequests.filter(x=>x.userId===id).map(({sshPublicKey,...x})=>x),tickets=data.tickets.filter(x=>x.userId===id).map(({messages,...x})=>({...x,messageCount:(messages||[]).length})),invites=data.inviteClaims.filter(x=>x.referrerId===id||x.inviteeId===id),boosts=data.claims.filter(x=>x.userId===id);
 res.set('Cache-Control','no-store');res.json({user:{...safeAdminUser(id,u),globalName:u.global_name||u.username,avatar:u.avatar||null,referrer:u.referrer||null,pendingReferrer:u.pendingReferrer||null,creditedMilestones:u.creditedMilestones||[],statusReason:u.statusReason||null,statusUpdatedAt:u.statusUpdatedAt||null},hosting,tickets,inviteClaims:invites,boostClaims:boosts});
});
app.post('/api/admin/users/:id/balance',adminOnly,adminMutationOrigin,(req,res)=>{
 const user=data.users[req.params.id];if(!user)return res.status(404).json({error:'User not found.'});
 const action=String(req.body?.action||''),amount=Number(req.body?.amount),reason=String(req.body?.reason||'').trim();
 if(!['add','remove'].includes(action)||!Number.isSafeInteger(amount)||amount<1||amount>100000000)return res.status(400).json({error:'Choose add/remove and an integer HZL amount between 1 and 100,000,000.'});
 if(reason.length<3||reason.length>300)return res.status(400).json({error:'Provide an audit reason (3–300 characters).'});
 const before=Number(user.balance)||0;if(action==='remove'&&before<amount)return res.status(409).json({error:'User does not have enough HZL to remove.'});
 user.balance=action==='add'?before+amount:before-amount;
 auditAdmin(req,'balance_'+action,'user',req.params.id,{amount,before,after:user.balance,reason});writeData();
 res.json({ok:true,user:safeAdminUser(req.params.id,user)});
});
app.post('/api/admin/users/:id/status',adminOnly,adminMutationOrigin,(req,res)=>{
 const user=data.users[req.params.id];if(!user)return res.status(404).json({error:'User not found.'});
 const status=String(req.body?.status||''),reason=String(req.body?.reason||'').trim();
 if(!['active','suspended'].includes(status))return res.status(400).json({error:'Status must be active or suspended.'});
 if(reason.length<3||reason.length>300)return res.status(400).json({error:'Provide a reason (3–300 characters).'});
 user.status=status;user.statusReason=reason;user.statusUpdatedAt=new Date().toISOString();
 auditAdmin(req,'user_'+status,'user',req.params.id,{reason});writeData();res.json({ok:true,user:safeAdminUser(req.params.id,user)});
});
app.get('/api/admin/plans',adminOnly,(_req,res)=>res.json({plans:data.plans}));
app.post('/api/admin/plans',adminOnly,adminMutationOrigin,(req,res)=>{
 const {id,service,name,cost,description,enabled=true,proxmox:resources}=req.body||{};
 if(typeof id!=='string'||!/^[a-z0-9][a-z0-9-]{1,30}$/i.test(id)||data.plans.some(p=>p.id===id))return res.status(400).json({error:'Plan ID must be unique and 2–31 letters, numbers or hyphens.'});
 if(!['lxc','minecraft','vps'].includes(service)||typeof name!=='string'||name.trim().length<2||name.trim().length>100||!Number.isSafeInteger(Number(cost))||Number(cost)<1||Number(cost)>100000000)return res.status(400).json({error:'Invalid plan service, name or HZL cost.'});
 if(description!==undefined&&(typeof description!=='string'||description.length>1000))return res.status(400).json({error:'Description must be at most 1000 characters.'});
 const plan={id,service,name:name.trim(),cost:Number(cost),description:String(description||''),enabled:Boolean(enabled)};
 if(service==='lxc'){if(!resources)return res.status(400).json({error:'LXC plans require explicit Proxmox resources (cores, memory, disk and swap).'});const cores=Number(resources.cores),memory=Number(resources.memory),disk=Number(resources.disk),swap=Number(resources.swap??512);if(!Number.isInteger(cores)||cores<1||cores>64||!Number.isInteger(memory)||memory<256||memory>1048576||!Number.isInteger(disk)||disk<2||disk>10000||!Number.isInteger(swap)||swap<0||swap>1048576)return res.status(400).json({error:'Invalid LXC resource limits.'});plan.proxmox={cores,memory,disk,swap};}
 data.plans.push(plan);auditAdmin(req,'plan_create','plan',id,{service,cost:plan.cost});writeData();res.status(201).json({ok:true,plan});
});
app.put('/api/admin/plans/:id',adminOnly,adminMutationOrigin,(req,res)=>{
 const plan=data.plans.find(p=>p.id===req.params.id);if(!plan)return res.status(404).json({error:'Plan not found.'});
 const {name,cost,description,enabled,proxmox:resources}=req.body||{};
 if(name!==undefined&&(typeof name!=='string'||name.trim().length<2||name.trim().length>100))return res.status(400).json({error:'Invalid plan name.'});
 if(cost!==undefined&&(!Number.isSafeInteger(Number(cost))||Number(cost)<1||Number(cost)>100000000))return res.status(400).json({error:'Invalid HZL cost.'});
 if(description!==undefined&&(typeof description!=='string'||description.length>1000))return res.status(400).json({error:'Description must be at most 1000 characters.'});
 if(name!==undefined)plan.name=name.trim();if(cost!==undefined)plan.cost=Number(cost);if(description!==undefined)plan.description=description;if(enabled!==undefined)plan.enabled=Boolean(enabled);
 if(resources!==undefined){if(plan.service!=='lxc'||!resources||!Number.isInteger(Number(resources.cores))||Number(resources.cores)<1||!Number.isInteger(Number(resources.memory))||Number(resources.memory)<256||!Number.isInteger(Number(resources.disk))||Number(resources.disk)<2)return res.status(400).json({error:'Invalid LXC resource mapping.'});plan.proxmox={cores:Number(resources.cores),memory:Number(resources.memory),disk:Number(resources.disk),swap:Number(resources.swap??512)};}
 auditAdmin(req,'plan_update','plan',plan.id,{name:plan.name,cost:plan.cost,enabled:plan.enabled});writeData();res.json({ok:true,plan});
});
app.delete('/api/admin/plans/:id',adminOnly,adminMutationOrigin,(req,res)=>{
 const idx=data.plans.findIndex(p=>p.id===req.params.id);if(idx<0)return res.status(404).json({error:'Plan not found.'});
 if(data.hostingRequests.some(x=>x.planId===req.params.id&&['pending','provisioning','provisioned','suspended'].includes(x.status)))return res.status(409).json({error:'Plan is referenced by pending or active hosting requests. Disable it instead.'});
 const [plan]=data.plans.splice(idx,1);auditAdmin(req,'plan_delete','plan',plan.id,{name:plan.name});writeData();res.json({ok:true});
});
app.get('/api/admin/tickets',adminOnly,(req,res)=>{
 const status=String(req.query.status||'open'),q=String(req.query.q||'').toLowerCase();
 const tickets=data.tickets.filter(t=>(status==='all'||t.status===status)&&( !q||[t.id,t.subject,t.username,t.userId].some(v=>String(v||'').toLowerCase().includes(q)))).map(t=>({...t,messages:t.messages||[]})).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
 res.json({tickets,total:tickets.length});
});
app.post('/api/admin/tickets/:id/messages',adminOnly,adminMutationOrigin,(req,res)=>{
 const ticket=data.tickets.find(t=>t.id===req.params.id);if(!ticket)return res.status(404).json({error:'Ticket not found.'});
 const message=String(req.body?.message||'').trim();if(message.length<1||message.length>5000)return res.status(400).json({error:'Message must be 1–5000 characters.'});
 const now=new Date().toISOString();ticket.messages=ticket.messages||[];ticket.messages.push({id:crypto.randomUUID(),authorId:req.session.admin.email,authorName:'HelzerX Support',authorRole:'admin',message,createdAt:now});ticket.updatedAt=now;if(ticket.status==='closed')ticket.status='open';auditAdmin(req,'ticket_reply','ticket',ticket.id,{});writeData();res.json({ok:true,ticket});
});
app.post('/api/admin/tickets/:id/status',adminOnly,adminMutationOrigin,(req,res)=>{
 const ticket=data.tickets.find(t=>t.id===req.params.id);if(!ticket)return res.status(404).json({error:'Ticket not found.'});
 const status=String(req.body?.status||''),priority=String(req.body?.priority||ticket.priority||'normal');
 if(!['open','in_progress','waiting_user','closed'].includes(status)||!['low','normal','high','urgent'].includes(priority))return res.status(400).json({error:'Invalid ticket status or priority.'});
 ticket.status=status;ticket.priority=priority;ticket.updatedAt=new Date().toISOString();auditAdmin(req,'ticket_status','ticket',ticket.id,{status,priority});writeData();res.json({ok:true,ticket});
});

app.post('/api/admin/hosting-requests/manual',adminOnly,adminMutationOrigin,async(req,res)=>{
 const userId=String(req.body?.userId||''),planId=String(req.body?.planId||''),charge=req.body?.charge===true;
 const user=data.users[userId];if(!user)return res.status(404).json({error:'User not found.'});
 const plan=data.plans.find(p=>p.id===planId&&p.enabled!==false);
 if(!plan||plan.service!=='lxc'||!plan.proxmox)return res.status(400).json({error:'Choose an enabled LXC plan with an explicit Proxmox resource mapping.'});
 if(charge&&(Number(user.balance)||0)<plan.cost)return res.status(409).json({error:'User does not have enough HZL.'});
 const readiness=proxmoxReadiness();if(!readiness.ready)return res.status(503).json({error:'Proxmox provisioning is not ready.',missing:readiness.missing});
 const now=new Date().toISOString(),request={id:crypto.randomUUID(),userId,username:user.username||user.global_name||userId,service:'lxc',planId:plan.id,planName:plan.name,cost:charge?plan.cost:0,status:'provisioning',manualCreated:true,createdAt:now,updatedAt:now,createdBy:req.session.admin.email};
 data.hostingRequests.push(request);if(charge){user.balance-=plan.cost;auditAdmin(req,'balance_remove','user',userId,{amount:plan.cost,reason:'Manual LXC provisioning: '+request.id});}
 request.provisioningAttempts=1;writeData();
 try{const created=await provisionLxc({requestId:request.id,plan,username:request.username});request.status='provisioned';request.provisioningStatus='container-started';request.vmid=created.vmid;request.hostname=created.hostname;request.proxmoxTask=created.upid;request.updatedAt=new Date().toISOString();auditAdmin(req,'vps_manual_create','hosting_request',request.id,{userId,vmid:created.vmid,charged:charge?plan.cost:0});writeData();res.status(201).json({ok:true,request:{...request,sshPublicKey:undefined},...(created.generatedSshPrivateKey?{generatedSshPrivateKey:created.generatedSshPrivateKey}:{} )});
 }catch(error){request.status='provisioning-error';request.provisioningStatus='needs-admin-reconciliation';request.error=String(error?.message||'Provisioning failed').slice(0,500);request.updatedAt=new Date().toISOString();try{auditAdmin(req,'vps_manual_create_failed','hosting_request',request.id,{userId,error:request.error});writeData();}catch(persistError){console.error('[manual LXC provisioning] Failed to persist error state for request '+request.id+':',persistError);}console.error('[manual LXC provisioning] Request '+request.id+' failed:',error?.stack||request.error);return res.status(502).json({error:'Manual LXC provisioning failed: '+request.error+'. Do not retry until the existing request and Proxmox VMID have been reconciled.',request:{id:request.id,status:request.status,provisioningStatus:request.provisioningStatus}});}
});
app.get('/api/admin/hosting-requests/:id/inspect',adminOnly,async(req,res)=>{
 const item=data.hostingRequests.find(x=>x.id===req.params.id);
 if(!item)return res.status(404).json({error:'Hosting request not found.'});
 if(item.service!=='lxc'||!Number.isInteger(Number(item.vmid))||!['provisioned','suspended','provisioning-error'].includes(item.status))return res.status(409).json({error:'This record is not an inspectable managed LXC container.'});
 try{const live=await inspectLxc({vmid:item.vmid,node:item.nodeId});res.set('Cache-Control','no-store');res.json({ok:true,request:{id:item.id,vmid:item.vmid,hostname:item.hostname,planName:item.planName,username:item.username,status:item.status,createdAt:item.createdAt,updatedAt:item.updatedAt},live});}
 catch(error){res.status(502).json({error:String(error.message||'Could not inspect container').slice(0,500)});}
});
app.post('/api/admin/hosting-requests/:id/terminal',adminOnly,adminMutationOrigin,async(req,res)=>{
 const item=data.hostingRequests.find(x=>x.id===req.params.id);
 if(!item)return res.status(404).json({error:'Hosting request not found.'});
 if(item.service!=='lxc'||!Number.isInteger(Number(item.vmid))||item.status!=='provisioned')return res.status(409).json({error:'Terminal access is available only for active managed LXC containers.'});
 const command=String(req.body?.command||''),reason=String(req.body?.reason||'').trim();
 if(!command.trim()||command.length>4000)return res.status(400).json({error:'Command must be 1–4000 characters.'});
 if(reason.length<3||reason.length>300)return res.status(400).json({error:'Provide an audit reason (3–300 characters).'});
 try{
  const live=await inspectLxc({vmid:item.vmid,node:item.nodeId});
  if(live.status?.status!=='running')return res.status(409).json({error:'Container is not running. Start it before using the terminal.'});
  const result=await runLxcTerminal({vmid:item.vmid,command,node:item.nodeId});
  auditAdmin(req,'vps_terminal_command','hosting_request',item.id,{vmid:item.vmid,commandLength:command.length,reason});
  writeData();res.json({ok:true,...result});
 }catch(error){res.status(502).json({error:String(error.message||'Terminal command failed').slice(0,500)});}
});
app.post('/api/admin/hosting-requests/:id/snapshots',adminOnly,adminMutationOrigin,async(req,res)=>{
 const item=data.hostingRequests.find(x=>x.id===req.params.id);
 if(!item)return res.status(404).json({error:'Hosting request not found.'});
 if(item.service!=='lxc'||!Number.isInteger(Number(item.vmid))||!['provisioned','suspended'].includes(item.status))return res.status(409).json({error:'Snapshots are available only for active managed LXC containers.'});
 const action=String(req.body?.action||''),name=String(req.body?.name||'').trim(),reason=String(req.body?.reason||'').trim();
 if(!['create','delete'].includes(action))return res.status(400).json({error:'Snapshot action must be create or delete.'});
 if(reason.length<3||reason.length>300)return res.status(400).json({error:'Provide an audit reason (3–300 characters).'});
 if(action==='delete'&&!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(name))return res.status(400).json({error:'Invalid snapshot name.'});
 try{
  if(action==='delete'){
   const live=await inspectLxc({vmid:item.vmid,node:item.nodeId});
   if(!(live.snapshots||[]).some(x=>x.name===name))return res.status(404).json({error:'Snapshot not found.'});
  }
  const result=await manageLxcSnapshot({vmid:item.vmid,action,name,node:item.nodeId});
  auditAdmin(req,'vps_snapshot_'+action,'hosting_request',item.id,{vmid:item.vmid,name,reason});writeData();
  res.json({ok:true,...result});
 }catch(error){res.status(502).json({error:String(error.message||'Snapshot operation failed').slice(0,500)});}
});
app.post('/api/admin/hosting-requests/:id/remove-failed',adminOnly,adminMutationOrigin,async(req,res)=>{
 const index=data.hostingRequests.findIndex(x=>x.id===req.params.id);
 if(index<0)return res.status(404).json({error:'Hosting request not found.'});
 const item=data.hostingRequests[index];
 const status=String(item.status||'').toLowerCase();
 const removableStatuses=new Set(['provisioning-error','failed','rejected','cancelled','error']);
 if(!removableStatuses.has(status)&&item.provisioningStatus!=='needs-admin-reconciliation')return res.status(409).json({error:'Only failed, rejected, cancelled, or provisioning-error requests can be removed.'});
 const reason=String(req.body?.reason||'').trim();
 if(reason.length<3||reason.length>300)return res.status(400).json({error:'Provide an audit reason (3–300 characters).'});
 const hasVmid=item.vmid!==undefined&&item.vmid!==null&&String(item.vmid).trim()!=='';
 if(hasVmid){
  const vmid=Number(item.vmid);
  if(item.service!=='lxc'||!Number.isInteger(vmid)||vmid<2000||vmid>2999)return res.status(409).json({error:'This failed request has a resource ID that cannot be safely cleaned up automatically. Keep the record and reconcile the resource manually.'});
  try{await manageLxc({vmid,action:'delete'});}
  catch(error){item.lastActionError=String(error.message||'Proxmox cleanup failed').slice(0,500);item.updatedAt=new Date().toISOString();writeData();return res.status(502).json({error:'Proxmox cleanup failed. The request record was kept so you can retry safely. '+item.lastActionError});}
 }
 data.hostingRequests.splice(index,1);
 auditAdmin(req,'failed_hosting_request_removed','hosting_request',item.id,{userId:item.userId,service:item.service,status:item.status,vmid:item.vmid??null,reason,proxmoxCleanup:hasVmid});
 writeData();
 res.json({ok:true,message:'Failed hosting request removed.',id:item.id});
});
app.post('/api/admin/hosting-requests/:id/action',adminOnly,adminMutationOrigin,async(req,res)=>{
 const item=data.hostingRequests.find(x=>x.id===req.params.id);if(!item)return res.status(404).json({error:'Hosting request not found.'});
 if(item.service!=='lxc'||!Number.isInteger(Number(item.vmid)))return res.status(409).json({error:'This record is not a managed LXC container.'});
 const action=String(req.body?.action||''),reason=String(req.body?.reason||'').trim();
 if(reason.length<3||reason.length>300)return res.status(400).json({error:'Provide an audit reason (3–300 characters).'});
 if(action==='delete'&&req.body?.confirm!==true)return res.status(400).json({error:'Explicit delete confirmation is required.'});
 if(['stop','suspend','reboot'].includes(action)&&!['provisioned','suspended'].includes(item.status))return res.status(409).json({error:'Only provisioned containers can be suspended.'});
 if(['start','resume'].includes(action)&&!['suspended','provisioned'].includes(item.status))return res.status(409).json({error:'Only suspended containers can be resumed.'});
 if(action==='delete'&&!['provisioned','suspended','provisioning-error'].includes(item.status))return res.status(409).json({error:'This container cannot be deleted from its current state.'});
 try{
  const result=await manageLxc({vmid:item.vmid,action,node:item.nodeId});
  item.updatedAt=new Date().toISOString();
  if(['suspend','stop'].includes(action)){item.status='suspended';item.provisioningStatus='container-stopped';}
  else if(['resume','start','reboot'].includes(action)){item.status='provisioned';item.provisioningStatus='container-running';}
  else if(action==='delete'){item.status='deleted';item.provisioningStatus='container-deleted';item.deletedAt=item.updatedAt;item.deletedBy=req.session.admin.email;}
  auditAdmin(req,'vps_'+action,'hosting_request',item.id,{vmid:item.vmid,userId:item.userId,reason});writeData();res.json({ok:true,request:{id:item.id,status:item.status,vmid:item.vmid,hostname:item.hostname},proxmox:result});
 }catch(error){item.updatedAt=new Date().toISOString();item.lastActionError=String(error.message||'Proxmox action failed').slice(0,500);writeData();res.status(502).json({error:item.lastActionError});}
});
app.get('/api/admin/audit-logs',adminOnly,(req,res)=>{const limit=Math.max(1,Math.min(500,Number(req.query.limit)||100));res.json({logs:data.auditLogs.slice(0,limit)});});
app.get('/api/plans',(_q,r)=>r.json({plans:[{id:'minecraft',title:'Minecraft Hosting',description:'Explore eligible Minecraft hosting rewards.',features:['Multiple RAM options','High-performance CPU resources','NVMe storage','Available locations'],command:'.mc-plans'},{id:'vps',title:'KVM VPS',description:'Explore eligible KVM VPS rewards.',features:['Multiple RAM options','Dedicated vCPU resources','NVMe storage','Available locations'],command:'.vps-plans'}]}));
app.use(express.static(path.join(root, 'public'), { index: false, maxAge: '1h' }));
if (prod) {
  app.use(express.static(path.join(root, 'dist'), { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true, host: '0.0.0.0' },
    appType: 'spa',
    root,
  });
  app.use(vite.middlewares);
}
app.listen(PORT, '0.0.0.0', () => console.log('HelzerX Free Hosting server listening on ' + PORT));
