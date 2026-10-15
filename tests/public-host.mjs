import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const origin='https://coastal-quest.onrender.com';
const env=Object.fromEntries(readFileSync('.env.local','utf8').trim().split(/\r?\n/).map(l=>{const p=l.indexOf('=');return[l.slice(0,p),l.slice(p+1)];}));
const endpoint=env.VITE_SUPABASE_URL+'/functions/v1/coastal-classroom',key=env.VITE_SUPABASE_PUBLISHABLE_KEY;
const checks=[];const check=(v,label)=>{assert.ok(v,label);checks.push(label);console.log('PASS: '+label);};
let playerToken='';
async function call(action,body,params={}){const r=await fetch(endpoint+(body?'':'?'+new URLSearchParams({action,...params})),{method:body?'POST':'GET',headers:{apikey:key,Origin:origin,...(playerToken?{'x-cq-player':playerToken}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify({action,...body})}:{}),signal:AbortSignal.timeout(30000)});const data=await r.json();if(data.token)playerToken=data.token;return{r,data};}
const home=await fetch(origin);const html=await home.text();check(home.status===200&&html.includes('Coastal Quest'),'Public Render home serves the game app');
const script=html.match(/src="([^"]+\.js)"/)?.[1];assert.ok(script);const js=await (await fetch(origin+script)).text();check(js.includes('zjvzsfbtwxeazwnkxdbw.supabase.co')&&js.includes('coastal-classroom'),'Published frontend contains correct Supabase backend configuration');
check(!/sb_secret_[a-zA-Z0-9_-]{20,}/.test(js),'No Supabase secret key is present in the public bundle');
for(const path of ['/?view=teacher','/?room=123456']){const r=await fetch(origin+path);check(r.status===200&&(await r.text()).includes('Coastal Quest'),'Direct static route opens: '+path);}
const wrapper=await fetch(origin+'/game/classroom.html');check(wrapper.status===200&&(await wrapper.text()).includes('createUnityInstance'),'Actual Unity classroom wrapper is public');
const wasm=await fetch(origin+'/game/Build/game.wasm.unityweb');const bytes=Buffer.from(await wasm.arrayBuffer());check(wasm.status===200&&bytes.length===5387487&&createHash('sha256').update(bytes).digest('hex')==='46fcf56656eba1e569940cf38bba31cfa757c6c2ab0592049c45cd9cf90ba3e7','Public Unity WASM matches original tested build');
const csv=await fetch(origin+'/question-template.csv');check(csv.ok&&(await csv.text()).includes('correctAnswer'),'Teacher CSV template is public');
const p=await call('practice',{name:'QA Render Publication'});check(p.r.status===200&&/^\d{6}$/.test(p.data.pin),'Solo room opens through Supabase with Render origin');const pin=p.data.pin;
const s=await call('state',null,{pin});check(s.r.status===200&&!!s.data.question&&!('correct' in s.data.question),'Public origin receives question without answer key');
const a=await call('answer',{pin,questionId:s.data.question.id,choice:1});check(a.r.status===200&&a.data.correct&&a.data.reward.ammo===12&&a.data.reward.energy===20,'Public-origin correct answer grants resources');
const b=await call('answer',{pin,questionId:s.data.question.id,choice:1});check(b.r.status===409,'Public-origin duplicate answer is rejected');
mkdirSync('test-results',{recursive:true});writeFileSync('test-results/public-host.json',JSON.stringify({result:'PASSED',checkedAt:new Date().toISOString(),origin,checks,qaRoomPin:pin,limits:['HTTP verification does not prove interactive WebGL or real teacher login/email delivery.','No sixty-device load test.']},null,2));console.log('PUBLIC_HOST_PASSED: '+checks.length);
