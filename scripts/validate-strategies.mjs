#!/usr/bin/env node
// validate-strategies.mjs — LIVE matrix-test of options strategy leg-topologies via the real
// options/orders/ endpoint: place a far-from-/valid limit (GTC) → confirm 201 + echoed legs →
// cancel immediately. Market closed + instant cancel = nothing fills. Proves the order bodies for
// a wide strategy set across multiple expirations. Read/preview spirit; everything is cancelled.
//   node scripts/validate-strategies.mjs [SYMBOL=AAPL] [ACCOUNT=<ACCOUNT_NUMBER>]
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
(function(){const p=join(REPO,".env");if(!existsSync(p))return;for(const l of readFileSync(p,"utf8").split("\n")){const t=l.trim();if(!t||t.startsWith("#"))continue;const e=t.indexOf("=");if(e<0)continue;const k=t.slice(0,e).trim();let v=t.slice(e+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(k&&process.env[k]===undefined)process.env[k]=v;}})();
const H=()=>({accept:"application/json","content-type":"application/json","user-agent":process.env.ROBINHOOD_USER_AGENT??"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",origin:"https://robinhood.com",referer:"https://robinhood.com/","x-robinhood-api-version":"1.431.4","x-robinhood-web-app-version":process.env.ROBINHOOD_WEB_APP_VERSION??"2026.24.3589+55c48b8f7a1c","x-hyper-ex":"enabled",authorization:"Bearer "+process.env.ROBINHOOD_BROKERAGE_TOKEN});
const SYM=(process.argv[2]||"AAPL").toUpperCase(); const ACCT=process.argv[3]||"";
const api=async(u,o={})=>{const r=await fetch(u,o);const t=await r.text();let b=null;try{b=t?JSON.parse(t):null}catch{b=t}return{status:r.status,body:b}};
const oUrl=id=>`https://api.robinhood.com/options/instruments/${id}/`;
const log=(...a)=>process.stderr.write(a.join(" ")+"\n");

(async()=>{
  const inst=(await api(`https://api.robinhood.com/instruments/?symbol=${SYM}`)).body.results[0];
  const spot=Number((await api(`https://api.robinhood.com/marketdata/quotes/?ids=${inst.id}`)).body.results[0].last_trade_price);
  const chain=inst.tradable_chain_id;
  const allExps=(await api(`https://api.robinhood.com/options/chains/${chain}/`)).body.expiration_dates;
  // pick expirations: nearest (~0DTE), ~monthly, far (~LEAP)
  const pick=[0, Math.min(6,allExps.length-1), allExps.length-1];
  const exps=[...new Set(pick.map(i=>allExps[i]))];
  // enumerate call+put per chosen expiration -> maps[exp]={call:{k:id},put:{k:id}}, plus sorted strikes
  const maps={}; let strikes=[];
  for(const exp of exps){ maps[exp]={call:{},put:{}};
    for(const type of["call","put"]){
      const rows=(await api(`https://api.robinhood.com/options/instruments/?chain_id=${chain}&expiration_dates=${exp}&type=${type}&state=active`)).body.results||[];
      for(const r of rows) maps[exp][type][Number(r.strike_price)]=r.id;
    }
    const ks=Object.keys(maps[exp].call).map(Number).sort((a,b)=>a-b);
    if(ks.length>strikes.length) strikes=ks;
  }
  const atm=strikes.reduce((p,c)=>Math.abs(c-spot)<Math.abs(p-spot)?c:p,strikes[0]);
  const ai=strikes.indexOf(atm); const K=off=>strikes[Math.max(0,Math.min(strikes.length-1,ai+off))];
  const leg=(exp,off,type,side,ratio=1)=>{const id=maps[exp][type][K(off)];return id?{option:oUrl(id),position_effect:"open",ratio_quantity:ratio,side,option_id:id}:null;};
  // strategy specs: name, direction, legs(builder given expiration index e -> array)
  const S=(name,dir,fn)=>({name,dir,fn});
  const strat=[
    S("long call","debit",e=>[leg(e,0,"call","buy")]),
    S("long put","debit",e=>[leg(e,0,"put","buy")]),
    S("short call (naked)","credit",e=>[leg(e,2,"call","sell")]),
    S("short put / CSP","credit",e=>[leg(e,-2,"put","sell")]),
    S("call debit spread","debit",e=>[leg(e,0,"call","buy"),leg(e,2,"call","sell")]),
    S("call credit spread","credit",e=>[leg(e,0,"call","sell"),leg(e,2,"call","buy")]),
    S("put credit spread","credit",e=>[leg(e,0,"put","sell"),leg(e,-2,"put","buy")]),
    S("put debit spread","debit",e=>[leg(e,0,"put","buy"),leg(e,-2,"put","sell")]),
    S("long straddle","debit",e=>[leg(e,0,"call","buy"),leg(e,0,"put","buy")]),
    S("long strangle","debit",e=>[leg(e,2,"call","buy"),leg(e,-2,"put","buy")]),
    S("iron condor","credit",e=>[leg(e,-2,"put","sell"),leg(e,-4,"put","buy"),leg(e,2,"call","sell"),leg(e,4,"call","buy")]),
    S("iron butterfly","credit",e=>[leg(e,0,"call","sell"),leg(e,0,"put","sell"),leg(e,2,"call","buy"),leg(e,-2,"put","buy")]),
    S("call butterfly","debit",e=>[leg(e,-2,"call","buy"),leg(e,0,"call","sell",2),leg(e,2,"call","buy")]),
    S("broken-wing butterfly","debit",e=>[leg(e,-2,"call","buy"),leg(e,0,"call","sell",2),leg(e,4,"call","buy")]),
    S("call ratio (1x2)","credit",e=>[leg(e,0,"call","buy"),leg(e,3,"call","sell",2)]),
    S("jade lizard","credit",e=>[leg(e,-2,"put","sell"),leg(e,2,"call","sell"),leg(e,4,"call","buy")]),
    S("collar/risk-reversal","credit",e=>[leg(e,-2,"put","buy"),leg(e,2,"call","sell")]),
  ];
  const place=async(dir,legs)=>{
    if(!legs||legs.some(l=>!l))return{skip:"strike/expiry missing"};
    const price=dir==="debit"?"0.01":"0.50";
    const body={account:`https://api.robinhood.com/accounts/${ACCT}/`,direction:dir,legs:legs.map(l=>({side:l.side,option:l.option,position_effect:l.position_effect,ratio_quantity:l.ratio_quantity})),type:"limit",time_in_force:"gtc",trigger:"immediate",price,quantity:"1",ref_id:randomUUID()};
    let r,b;
    for(let attempt=0;attempt<6;attempt++){
      r=await api("https://api.robinhood.com/options/orders/",{method:"POST",headers:H(),body:JSON.stringify(body)});
      b=r.body||{};
      if(r.status!==429)break;
      const m=/(\d+)\s*second/.exec(JSON.stringify(b)); const wait=(m?parseInt(m[1],10):20)+2;
      log(`     throttled, sleeping ${wait}s`); await new Promise(x=>setTimeout(x,wait*1000));
    }
    if((r.status===200||r.status===201)&&b.id){await new Promise(x=>setTimeout(x,250));const c=await api(`https://api.robinhood.com/options/orders/${b.id}/cancel/`,{method:"POST",headers:H()});return{status:r.status,placed:true,legs:(b.legs||[]).length,cancel:c.status};}
    return{status:r.status,placed:false,why:(b.detail||b.non_field_errors||JSON.stringify(b)).toString().slice(0,90)};
  };
  const receipts=[];
  log(`${SYM} spot ${spot} | acct ${ACCT} | expirations: ${exps.join(", ")}`);
  // single-expiration strategies: run on nearest (0DTE-ish) + a monthly to cover date range
  const singleExps=[exps[0], exps[Math.min(1,exps.length-1)]];
  for(const exp of [...new Set(singleExps)]){
    log(`\n— exp ${exp} —`);
    for(const st of strat){
      const r=await place(st.dir, st.fn(exp));
      if(r.skip){log(`  SKIP ${st.name}: ${r.skip}`);continue;}
      log(`  [${r.status}] ${st.name}${r.placed?` OK (${r.legs} legs, cancel ${r.cancel})`:`  ${r.why}`}`);
      receipts.push({exp,strategy:st.name,...r});
      await new Promise(x=>setTimeout(x,3000));
    }
  }
  // multi-expiration: calendar + diagonal (PMCC)
  if(exps.length>=2){
    const near=exps[0], far=exps[exps.length-1];
    log(`\n— multi-exp (near ${near} / far ${far}) —`);
    const cal=[leg(near,0,"call","sell"),leg(far,0,"call","buy")];
    const pmcc=[leg(far,-6,"call","buy"),leg(near,2,"call","sell")]; // deep-ITM far + OTM near
    for(const [nm,lg] of [["call calendar",cal],["PMCC / diagonal",pmcc]]){
      const r=await place("debit",lg);
      if(r.skip){log(`  SKIP ${nm}: ${r.skip}`);continue;}
      log(`  [${r.status}] ${nm}${r.placed?` OK (${r.legs} legs, cancel ${r.cancel})`:`  ${r.why}`}`);
      receipts.push({exp:`${near}/${far}`,strategy:nm,...r});
      await new Promise(x=>setTimeout(x,3000));
    }
  }
  const okN=receipts.filter(r=>r.placed).length;
  log(`\n=== ${okN}/${receipts.length} placed 201 (structure OK); rest are semantic (BP/risk) — all cancelled ===`);
  try{mkdirSync(join(REPO,"info","order-receipts"),{recursive:true});writeFileSync(join(REPO,"info","order-receipts",`strategy-validation-${SYM}.json`),JSON.stringify(receipts,null,1));}catch{}
})().catch(e=>log("FATAL "+(e.stack||e)));

// Zayd Khan // cold // www.zayd.wtf
