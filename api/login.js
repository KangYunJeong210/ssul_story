import { createHmac, timingSafeEqual } from 'node:crypto';
const fail=(res,status,error)=>res.status(status).setHeader('Cache-Control','no-store').json({error});
function matches(input, secret){const a=Buffer.from(String(input||'')),b=Buffer.from(String(secret||''));return a.length===b.length && timingSafeEqual(a,b);}
export default function handler(req,res){
 if(req.method!=='POST')return fail(res,405,'POST 요청만 가능합니다.');
 const secret=process.env.APP_PIN;
 if(!secret || secret.length<12)return fail(res,503,'Vercel에서 APP_PIN을 12자 이상으로 설정해 주세요.');
 if(typeof req.body?.pin!=='string'||req.body.pin.length>256||!matches(req.body.pin,secret))return fail(res,401,'비밀번호가 올바르지 않습니다.');
 const expires=Date.now()+7*24*60*60*1000;
 const value=String(expires);
 const signature=createHmac('sha256',secret).update(value).digest('base64url');
 res.setHeader('Set-Cookie',`shortwrite_session=${value}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`);
 res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true});
}
