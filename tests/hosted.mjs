import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {DEMO_QUESTIONS} from '../src/lib/demo.ts';
const env=Object.fromEntries(readFileSync('.env.local','utf8').trim().split(/\r?\n/).map(l=>{const p=l.indexOf('=');return[l.slice(0,p),l.slice(p+1)];}));
const base=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_PUBLISHABLE_KEY,endpoint=base+'/functions/v1/coastal-classroom';
const checks=[],created=[];const check=(v,label)=>{assert.ok(v,label);checks.push(label);console.log('PASS: '+label);};
function client(){const tokens=new Map();return {async call(action,body,params={}){const pin=body?.pin??params.pin,r=await fetch(endpoint+(body?'':'?'+new URLSearchParams({action,...params})),{method:body?'POST':'GET',headers:{apikey:key,Origin:'https://classroom-test.example',...(pin&&tokens.has(pin)?{'x-cq-player':tokens.get(pin)}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify({action,...body})}:{}),signal:AbortSignal.timeout(30000)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{throw new Error('Non-JSON '+r.status+' '+text.slice(0,100));}if(data.token)tokens.set(data.pin,data.token);return {status:r.status,data,headers:r.headers};}};}
const a=client(),b=client();
try {
check((await a.call('banks')).status===401,'Anonymous cannot read teacher banks');
check((await a.call('bank.demo',{})).status===401,'Anonymous cannot create teacher questions');
check((await a.call('room.control',{id:crypto.randomUUID(),status:'playing'})).status===401,'Anonymous cannot control teacher rooms');
const pre=await fetch(endpoint,{method:'OPTIONS',headers:{Origin:'https://classroom-test.example','Access-Control-Request-Headers':'content-type,apikey,x-cq-player'}});check(pre.status===204&&pre.headers.get('Access-Control-Allow-Origin')==='*','Cross-origin preflight supports Render without cookies');
const p=await a.call('practice',{name:'QA Coastal Solo'});check(p.status===200&&/^\d{6}$/.test(p.data.pin),'Anonymous solo practice creates a room');const pin=p.data.pin;created.push(pin);
let state=(await a.call('state',null,{pin})).data;check(state.room.mode==='solo'&&state.room.status==='playing','Solo starts in playing phase');check(state.question&&!('correct' in state.question)&&!('explanation' in state.question),'Student payload excludes answer keys');
check((await b.call('state',null,{pin})).status===403,'Nonmember cannot read roster or questions');
check((await b.call('join',{pin,name:'QA Coastal Solo'})).status===409,'Duplicate nickname rejected');
check((await b.call('join',{pin,name:'QA Coastal Friend'})).status===200,'Second anonymous student can join');
const realtime=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});let event;const channel=realtime.channel('coastal:'+pin).on('broadcast',{event:'changed'},m=>{event=m;});
await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Realtime subscribe timed out')),12000);channel.subscribe(s=>{if(s==='SUBSCRIBED'){clearTimeout(t);resolve();}if(s==='CHANNEL_ERROR'){clearTimeout(t);reject(new Error(s));}});});
try {
const current=state.question.id,choice=DEMO_QUESTIONS[0].correct;
const answers=await Promise.all(Array.from({length:5},()=>a.call('answer',{pin,questionId:current,choice})));
check(answers.filter(r=>r.status===200).length===1&&answers.filter(r=>r.status===409).length===4,'Five concurrent duplicate answers award once');const reward=answers.find(r=>r.status===200).data.reward;check(reward.ammo===12&&reward.energy===20,'Correct answer grants 12 ammo and 20 energy');
await new Promise(r=>setTimeout(r,3000));check(event?.payload?.changed===true&&!('name' in event.payload)&&!('correct' in event.payload),'Database broadcasts only invalidation, no private classroom data');
}finally{await realtime.removeChannel(channel);await realtime.realtime.disconnect();}
state=(await a.call('state',null,{pin})).data;check(state.player.score===100&&state.player.answered===1,'Score persists once in cloud');
for(let i=1;i<3;i++){state=(await a.call('state',null,{pin})).data;const r=await a.call('answer',{pin,questionId:state.question.id,choice:DEMO_QUESTIONS[i].correct});check(r.status===200,'Next question '+(i+1)+' accepted');if(i===2)check(r.data.reward.item==='shield','Third correct answer grants shield');}
state=(await b.call('state',null,{pin})).data;const wrong=await b.call('answer',{pin,questionId:state.question.id,choice:(DEMO_QUESTIONS[0].correct+1)%4});check(wrong.status===200&&!wrong.data.correct&&wrong.data.reward.ammo===0,'Wrong answer gives feedback without reward');
check((await b.call('export',null,{id:state.room.id})).status===401,'Student cannot export teacher reports');
for(const table of ['cq_banks','cq_questions','cq_rooms','cq_room_questions','cq_players','cq_answers']){const r=await fetch(base+'/rest/v1/'+table+'?select=*&limit=1',{headers:{apikey:key}});check(r.status===401||r.status===403,'Direct public Data API cannot read '+table);await r.arrayBuffer();}
const rpc=await fetch(base+'/rest/v1/rpc/cq_room_totals',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({_room:state.room.id})});check(rpc.status===401||rpc.status===403,'Public cannot bypass endpoint through privileged RPC');await rpc.arrayBuffer();
const auth=await fetch(base+'/auth/v1/settings',{headers:{apikey:key}});const settings=await auth.json();check(auth.ok&&settings.external?.email===true,'Existing project has email Auth enabled (delivery/login not tested)');
mkdirSync('test-results',{recursive:true});writeFileSync('test-results/hosted.json',JSON.stringify({result:'PASSED',checkedAt:new Date().toISOString(),endpoint,checks,createdRoomPins:created,limits:['Teacher real signup/login and email delivery were not exercised.','No sixty-device load test.','Render static site and interactive WebGL need separate browser verification.']},null,2));
console.log('HOSTED_CHECKS_PASSED: '+checks.length);
}catch(e){mkdirSync('test-results',{recursive:true});writeFileSync('test-results/hosted.json',JSON.stringify({result:'FAILED',checkedAt:new Date().toISOString(),checks,error:e.message,createdRoomPins:created},null,2));console.error(e.message);process.exitCode=1;}
