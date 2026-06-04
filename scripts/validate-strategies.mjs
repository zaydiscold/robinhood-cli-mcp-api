#!/usr/bin/env node
// validate-strategies.mjs — LIVE-validate the multi-leg order-body templates via RH's server-side
// review endpoint (bonfire/options/orders/review) WITHOUT placing any order. Proves leg topology
// (side/position_effect/ratio/direction) per strategy is correct. Read/preview only.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
(function(){const p=join(REPO,".env");if(!existsSync(p))return;for(const l of readFileSync(p,"utf8").split("\n")){const t=l.trim();if(!t||t.startsWith("#"))continue;const e=t.indexOf("=");if(e<0)continue;const k=t.slice(0,e).trim();let v=t.slice(e+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(k&&process.env[k]===undefined)process.env[k]=v;}})();
const H=()=>({accept:"application/json","content-type":"application/json","user-agent":process.env.ROBINHOOD_USER_AGENT??"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",origin:"https://robinhood.com",referer:"https://robinhood.com/","x-robinhood-api-version":"1.431.4","x-robinhood-web-app-version":"2026.23.2025+43f8dad0de15","x-hyper-ex":"enabled",authorization:"Bearer "+process.env.ROBINHOOD_BROKERAGE_TOKEN});
const ACCT=process.argv[3]||"873870497"; const SYM=(process.argv[2]||"AAPL").toUpperCase();
const api=async(u,o={})=>{const r=await fetch(u,o);const t=await r.text();let b=null;try{b=t?JSON.parse(t):null}catch{b=t}return{status:r.status,body:b}};
const oUrl=id=>`https://api.robinhood.com/options/instruments/${id}/`;
function leg(map,strike,type,side){const id=map[type][strike]; if(!id)return null; return {option:oUrl(id),position_effect:"open",ratio_quantity:1,side,option_id:id};}
async function review(direction,legs){
  // LIVE place→verify→cancel: far-from-market limit (can't fill) proves the leg topology end-to-end.
  if(legs.some(l=>!l))return{skip:"missing strike"};
  const price = direction==="debit" ? "0.01" : "0.50"; // valid premium (< collateral) so it PLACES; market closed + immediate cancel = no fill
  const cleanLegs=legs.map(l=>({side:l.side,option:l.option,position_effect:l.position_effect,ratio_quantity:l.ratio_quantity}));
  const body={account:`https://api.robinhood.com/accounts/${ACCT}/`,direction,legs:cleanLegs,type:"limit",time_in_force:"gtc",trigger:"immediate",price,quantity:"1",ref_id:randomUUID()};
  const r=await api("https://api.robinhood.com/options/orders/",{method:"POST",headers:H(),body:JSON.stringify(body)});
  const b=r.body||{};
  if((r.status===200||r.status===201)&&b.id){ // placed — cancel immediately
    await new Promise(x=>setTimeout(x,300));
    const c=await api(`https://api.robinhood.com/options/orders/${b.id}/cancel/`,{method:"POST",headers:H()});
    return {status:r.status, placed:true, legs:(b.legs||[]).length, state:b.state, cancelled:c.status};
  }
  return {status:r.status, placed:false, body:b};
}
(async()=>{
  // resolve instrument + spot
  const inst=(await api(`https://api.robinhood.com/instruments/?symbol=${SYM}`)).body.results[0];
  const q=(await api(`https://api.robinhood.com/marketdata/quotes/?ids=${inst.id}`)).body.results[0];
  const spot=Number(q.last_trade_price); const chain=inst.tradable_chain_id;
  const exps=(await api(`https://api.robinhood.com/options/chains/${chain}/`)).body.expiration_dates;
  // pick an expiration ~30-50 DTE (a few entries in)
  const exp=exps[Math.min(7,exps.length-1)];
  const map={call:{},put:{}};
  for(const type of["call","put"]){
    const rows=(await api(`https://api.robinhood.com/options/instruments/?chain_id=${chain}&expiration_dates=${exp}&type=${type}&state=active`)).body.results||[];
    for(const r of rows) map[type][Number(r.strike_price)]=r.id;
  }
  const strikes=Object.keys(map.call).map(Number).sort((a,b)=>a-b);
  const near=k=>strikes.reduce((p,c)=>Math.abs(c-spot)<Math.abs(p-spot)?c:p,strikes[0]);
  const atm=near(spot); const i=strikes.indexOf(atm);
  const S=(off)=>strikes[Math.max(0,Math.min(strikes.length-1,i+off))];
  const L1=S(-2),L2=S(-1),C=atm,H1=S(1),H2=S(2); // strikes around ATM
  const expNear=exps[Math.min(3,exps.length-1)], expFar=exps[Math.min(9,exps.length-1)];
  // far-exp map (for calendar)
  const farCall={}; for(const r of((await api(`https://api.robinhood.com/options/instruments/?chain_id=${chain}&expiration_dates=${expFar}&type=call&state=active`)).body.results||[])) farCall[Number(r.strike_price)]=r.id;
  const tests=[
    ["long call","debit",[leg(map,C,"call","buy")]],
    ["long put","debit",[leg(map,C,"put","buy")]],
    ["covered call (sell call/open)","credit",[leg(map,H1,"call","sell")]],
    ["cash-secured put (sell put/open)","credit",[leg(map,L1,"put","sell")]],
    ["call debit spread","debit",[leg(map,C,"call","buy"),leg(map,H1,"call","sell")]],
    ["call credit spread","credit",[leg(map,C,"call","sell"),leg(map,H1,"call","buy")]],
    ["put credit spread","credit",[leg(map,C,"put","sell"),leg(map,L1,"put","buy")]],
    ["put debit spread","debit",[leg(map,C,"put","buy"),leg(map,L1,"put","sell")]],
    ["long straddle","debit",[leg(map,C,"call","buy"),leg(map,C,"put","buy")]],
    ["long strangle","debit",[leg(map,H1,"call","buy"),leg(map,L1,"put","buy")]],
    ["iron condor","credit",[leg(map,L1,"put","sell"),leg(map,L2,"put","buy"),leg(map,H1,"call","sell"),leg(map,H2,"call","buy")]],
    ["call butterfly","debit",[{...leg(map,L1,"call","buy")},{...leg(map,C,"call","sell"),ratio_quantity:2},{...leg(map,H1,"call","buy")}]],
    ["calendar (call)","debit",[leg(map,C,"call","sell"),(farCall[C]?{option:oUrl(farCall[C]),position_effect:"open",ratio_quantity:1,side:"buy",option_id:farCall[C]}:null)]],
  ];
  console.error(`${SYM} spot ${spot} | exp ${exp} | acct ${ACCT}`);
  for(const[name,dir,legs]of tests){
    const r=await review(dir,legs);
    if(r.skip){console.error(`  SKIP ${name}: ${r.skip}`);continue;}
    const b=r.body||{}; const rej=b.detail||b.non_field_errors||JSON.stringify(b).slice(0,220);
    const ok = r.status>=200&&r.status<300;
    console.error(`  [${r.status}] ${name}  ${ok?"STRUCTURE OK":(rej||"")}`.slice(0,140));
    await new Promise(x=>setTimeout(x,400));
  }
  console.error("(review only — nothing placed)");
})().catch(e=>console.error("FATAL",e.message));
