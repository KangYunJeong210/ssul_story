import { createHmac, timingSafeEqual } from 'node:crypto';

function validSession(req){
 const secret=process.env.APP_PIN; if(!secret)return false;
 const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('shortwrite_session='))?.split('=')[1];
 if(!token)return false;
 const [value,signature,extra]=token.split('.');if(!/^\d+$/.test(value||'')||!signature||extra)return false;
 const expires=Number(value);if(!Number.isSafeInteger(expires)||expires<Date.now()||expires>Date.now()+8*86400000)return false;
 const expected=createHmac('sha256',secret).update(value).digest('base64url');
 const a=Buffer.from(signature),b=Buffer.from(expected);
 return a.length===b.length&&timingSafeEqual(a,b);
}
const json=(res,status,data)=>res.status(status).setHeader('Cache-Control','no-store').json(data);

export default async function handler(req,res){
 if(req.method!=='POST') return json(res,405,{error:'POST 요청만 가능합니다.'});
 if(!process.env.GEMINI_API_KEY) return json(res,503,{error:'Vercel 환경변수 GEMINI_API_KEY가 설정되지 않았습니다.'});
 if(!process.env.APP_PIN) return json(res,503,{error:'보안을 위해 Vercel 환경변수 APP_PIN을 설정해야 합니다.'});
 if(!validSession(req)) return json(res,401,{error:'로그인이 만료됐어요. 다시 비밀번호를 입력해 주세요.'});
 const {input,history=[],instructions='',length=500,style='썰처럼 자연스럽게',continuation=false}=req.body||{};
 if(typeof input!=='string'||!input.trim()||input.length>12000) return json(res,400,{error:'소재/줄거리를 1~12,000자로 입력해 주세요.'});
 if(!Array.isArray(history)||history.length>60) return json(res,400,{error:'대화 내역이 올바르지 않습니다.'});
 const count=Math.max(150,Math.min(1200,Number(length)||500));
 const system=`너는 사용자가 보고 싶은 한 장면을 바로 써주는 한국어 썰 작성 도우미다. 문학상 출품용 작품이 아니라 즉석에서 소비하는 짧은 장면을 쓴다. 주어진 소재와 인물 관계, 분위기를 정확히 반영한다.
중요 규칙: (1) 인사, 사과, 해설, 제목, 요약, 주의문, 마무리 멘트 없이 본문만 즉시 출력한다. (2) 첫 문장부터 장면이나 대사를 시작한다. (3) 복잡한 기승전결, 반전, 교훈, 예쁜 문장보다 요청된 순간의 대사와 행동을 우선한다. (4) 지문은 간결하게, 대사는 상황에 맞게 자연스럽게 쓴다. (5) 사용자가 지정하지 않은 설정을 과도하게 추가하지 않는다. (6) 사용자 요청이 수정이면 직전 장면을 요청대로 다시 쓰고, 이어 쓰기면 흐름을 이어간다.
목표 분량: 공백 포함 약 ${count}자. ±20% 이내를 지향하되 장황하게 늘리지 않는다.
문체: ${String(style).slice(0,120)}.
사용자 저장 프롬프트(문체 및 상황 지침): ${String(instructions).slice(0,6000)||'없음'}.
가장 최근 사용자 메시지를 우선한다. ${continuation?'앞선 장면의 상황을 이어서 진행한다.':''}`;
 const context=history.slice(-8).filter(h=>h && ['user','assistant'].includes(h.role) && typeof h.text==='string').map(h=>({role:h.role==='assistant'?'model':'user',parts:[{text:h.text.slice(0,5000)}]}));
 context.push({role:'user',parts:[{text:input}]});
 const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';
 const generationConfig={maxOutputTokens:1400};
 if(model.startsWith('gemini-3')) generationConfig.thinkingConfig={thinkingLevel:'MINIMAL'};
 else if(model==='gemini-2.5-flash'||model==='gemini-2.5-flash-lite') generationConfig.thinkingConfig={thinkingBudget:0};
 const safetySettings=['HARM_CATEGORY_HARASSMENT','HARM_CATEGORY_HATE_SPEECH','HARM_CATEGORY_SEXUALLY_EXPLICIT','HARM_CATEGORY_DANGEROUS_CONTENT'].map(category=>({category,threshold:'OFF'}));
 try{
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),35000);
  let response;
  try{response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
    method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},
    body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:context,generationConfig,safetySettings})
  });}finally{clearTimeout(timeout)}
  const body=await response.json().catch(()=>({}));
  if(!response.ok) return json(res,response.status===429?429:502,{error:response.status===429?'Gemini 사용량 한도에 도달했어요. 잠시 뒤 다시 시도해 주세요.':`Gemini 호출 오류 (${response.status}): ${String(body.error?.message||'설정과 모델명을 확인해 주세요.').slice(0,300)}`});
  const text=(body.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();
  if(!text) return json(res,502,{error:body.candidates?.[0]?.finishReason==='SAFETY'?'Gemini 자체 안전 정책으로 응답이 제한됐어요. 표현을 바꿔 다시 시도해 주세요.':'Gemini가 글을 생성하지 못했어요. 다시 시도해 주세요.'});
  return json(res,200,{text});
 }catch(e){return json(res,502,{error:e.name==='AbortError'?'AI 응답 시간이 초과됐어요. 다시 시도해 주세요.':'연결 오류가 발생했어요. 다시 시도해 주세요.'});}
}
