import { next } from '@vercel/functions';

const enc = new TextEncoder();
const keyName = 'shortwrite_session';
const noStore = {'Cache-Control':'no-store'};

async function validate(token) {
  if (!process.env.APP_PIN || !token) return false;
  const [value, mac, extra] = token.split('.');
  if (!value || !mac || extra || !/^\d+$/.test(value)) return false;
  const expires=Number(value);
  if (!Number.isSafeInteger(expires) || expires < Date.now() || expires > Date.now()+8*24*60*60*1000) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(process.env.APP_PIN), {name:'HMAC',hash:'SHA-256'},false,['verify']);
  const raw = mac.replace(/-/g,'+').replace(/_/g,'/');
  try {
    const bits=Uint8Array.from(atob(raw), c=>c.charCodeAt(0));
    return await crypto.subtle.verify('HMAC',key,bits,enc.encode(value));
  } catch { return false; }
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const path=url.pathname;
  if (path === '/login.html' || path === '/api/login' || path === '/favicon.ico') return next();
  const cookies=request.headers.get('cookie')||'';
  const cookie=cookies.split(';').map(c=>c.trim()).find(c=>c.startsWith(keyName+'='));
  const token=cookie?.slice(keyName.length+1);
  if(await validate(token)) return next();
  if(path.startsWith('/api/')) return new Response(JSON.stringify({error:'접속 암호 인증이 필요합니다.'}),{status:401,headers:{'Content-Type':'application/json; charset=utf-8',...noStore}});
  return Response.redirect(new URL('/login.html',url),302);
}
