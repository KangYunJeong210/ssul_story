export default function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'POST 전용'});
 res.setHeader('Set-Cookie','shortwrite_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
 res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true});
}
