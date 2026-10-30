import { spawn } from 'node:child_process';
// 手机布局交互自检：缩放按钮 / 当前节点可见 / 无横向溢出 / 控制台异常
// 用法：node tools/ui/mobile-check.mjs
const APP=process.env.APP||'http://127.0.0.1:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';
const r = await fetch(APP+'/api/new',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({characterIds:['gpt','claude'],seed:4242})});
const g = await r.json(); const SID=g.sessionId;
const PORT=9391;
const b=spawn('C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new',`--remote-debugging-port=${PORT}`,'--user-data-dir=C://Users//Mayn//AppData//Local//Temp//agi-mob-'+Date.now(),'--no-first-run','--disable-gpu','--hide-scrollbars','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws=null;
for(let i=0;i<120&&!ws;i++){try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();ws=l.find(t=>t.type==='page')?.webSocketDebuggerUrl;}catch{} if(!ws)await sleep(150);}
const s=new WebSocket(ws); await new Promise(r=>s.onopen=r);
let id=0; const pend=new Map(); const errs=[];
s.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}else if(m.method==='Runtime.exceptionThrown')errs.push(m.params.exceptionDetails?.exception?.description||'err');};
const send=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,res);s.send(JSON.stringify({id:i,method,params}));});
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+(r.exceptionDetails.exception?.description||'')):r.result?.value;};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
await send('Page.navigate',{url:APP}); await sleep(2200);
await ev(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(SID)}); 1`);
await send('Page.reload'); await sleep(2400);
await ev(`document.querySelector('#btn-resume')?.click(); 1`); await sleep(2200);
for(let i=0;i<3;i++){ const x=await ev(`(()=>{const b=document.querySelector('[data-act="story-continue"]'); if(b){b.click();return 1} return 0})()`); if(!x)break; await sleep(700); }
await sleep(700);
const measure = `(()=>{const n=document.querySelector('.map-node.current'); if(!n) return {found:false}; const r=n.getBoundingClientRect(); return {found:true,x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),inView: r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight};})()`;
const before=await ev(`document.querySelector('#map-canvas').style.transform`);
const startNode=await ev(measure);
await ev(`document.querySelector('[data-act="map-zoom"][data-delta="1"]')?.click(); 1`); await sleep(300);
const after=await ev(`document.querySelector('#map-canvas').style.transform`);
await ev(`document.querySelector('[data-act="map-center"]')?.click(); 1`); await sleep(300);
const centered=await ev(measure);
const vp=await ev(`({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight})`);
const zoomed=before!==after;
const ok=(name,cond,detail='')=>console.log(`${cond?'PASS':'FAIL'}  ${name}${detail?'  —  '+detail:''}`);
ok('缩放按钮改变比例', zoomed, `${before} → ${after}`);
ok('当前节点在视口内', !!startNode.inView, JSON.stringify(startNode));
ok('定位按钮把节点拉回画面', !!centered.inView, JSON.stringify(centered));
ok('页面无横向溢出', vp.sw<=vp.w, JSON.stringify(vp));
ok('控制台无异常', errs.length===0, JSON.stringify(errs));
await send('Browser.close').catch(()=>{});
spawn('taskkill',['/F','/T','/PID',String(b.pid)],{stdio:'ignore'});
