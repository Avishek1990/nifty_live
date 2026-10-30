/* NIFTY50 Bliss live page. Fetches data.json (written by nifty50_bliss/web/build.py) and renders, top to bottom: the
   live news flash, the price and OHLC, the 09:15 day forecast (OPEN) with its 10:15, next-hour (DVine) and
   news-calibrated updates, the day and next-hour charts, the news calibration tables and the last 30 sessions of
   forecast against actual. Re-reads the data every 5 minutes. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const f1=v=>v==null?'—':v.toLocaleString('en-IN',{minimumFractionDigits:1,maximumFractionDigits:1});
const f0=v=>v==null?'—':Math.round(v).toLocaleString('en-IN');
const pct=v=>v==null?'—':`${Math.round(v*100)}%`;
const sg=(v,d=1)=>v==null?'—':`${v>=0?'+':'−'}${Math.abs(v).toFixed(d)}`;
const mins=t=>{const[a,b]=t.split(':').map(Number);return a*60+b;};
const hhmm=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const OPEN=mins('09:15'), CLOSE=mins('15:30');
const mount=(host,W,H,s)=>host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">${s}</svg>`;
let D=null;

// ---------- shared chart frame ----------
function frame(host, lo, hi, opts={}){
  const W=host.clientWidth||900, padL=64, padR=opts.padR||12, top=12, H=opts.h||(W<520?260:340), axisH=24;
  const pv=(hi-lo)*0.04; lo-=pv; hi+=pv;
  const xm=m=>padL+(m-OPEN)/(CLOSE-OPEN)*(W-padL-padR);
  const y=v=>top+(hi-v)/(hi-lo)*H;
  const mag=Math.pow(10,Math.floor(Math.log10(hi-lo))), rr=(hi-lo)/mag, step=mag*(rr>5?1:rr>2?0.5:0.2);
  let s='';
  for(let t=Math.ceil(lo/step)*step;t<=hi;t+=step)
    s+=`<line class="g-grid" x1="${padL}" x2="${W-padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`+
       `<text class="t-ax" x="${padL-7}" y="${(y(t)+4).toFixed(1)}" text-anchor="end">${f0(t)}</text>`;
  if(!opts.noTime) for(let tm=Math.ceil(OPEN/60)*60; tm<=CLOSE; tm+=60)
    s+=`<line class="g-grid" x1="${xm(tm)}" x2="${xm(tm)}" y1="${top}" y2="${top+H}" stroke-dasharray="2 4"/>`+
       `<text class="t-ax" x="${xm(tm)}" y="${top+H+17}" text-anchor="middle">${hhmm(tm)}</text>`;
  return {W, H:top+H+axisH, padL, padR, top, ph:H, xm, x:t=>xm(mins(t)), y, s, bw:(W-padL-padR)/((CLOSE-OPEN)/5)};
}
function candles(F, path){
  let s='';
  for(const b of path){const cx=F.x(b.t)+F.bw/2, up=b.c>=b.o, col=up?'var(--up)':'var(--down)', w=Math.max(1.5,F.bw*.62);
    const yt=F.y(Math.max(b.o,b.c)), yb=F.y(Math.min(b.o,b.c));
    s+=`<g data-tip="${esc(`${b.t}<br>O ${f1(b.o)} · H ${f1(b.h)}<br>L ${f1(b.l)} · C ${f1(b.c)}`)}"><line x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${F.y(b.h).toFixed(1)}" y2="${F.y(b.l).toFixed(1)}" stroke="${col}" stroke-width="1"/>`+
       `<rect x="${(cx-w/2).toFixed(1)}" y="${yt.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1,yb-yt).toFixed(1)}" fill="${col}" rx="1"/></g>`;}
  return s;
}
const lbl=(x,y,t,col,anchor='end')=>`<text class="t-ax" x="${x}" y="${y}" text-anchor="${anchor}" paint-order="stroke" stroke="var(--surface)" stroke-width="3" style="fill:${col}">${t}</text>`;

// ---------- news flash ----------
function drawFlash(){
  const F=D.flash, host=$('flash');
  if(!F||!F.articles||!F.articles.length){host.innerHTML='';host.hidden=true;return;}
  host.hidden=false;
  const S=F.summary||{}, pill=(s,k)=>`<span class="pill ${s}">${s==='neutral'?'neutral':s==='positive'?'▲ positive':'▼ negative'}${k?` · ${k}`:''}</span>`;
  const item=a=>`<a class="fl-item" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer"><span class="fl-t">${esc(a.t)}</span>${pill(a.sentiment,a.strength)}<span class="fl-h">${esc(a.title)}</span><span class="fl-src">${esc(a.host)}</span></a>`;
  const list=F.articles.map(item).join('');
  host.innerHTML=`<div class="fl-sum"><span class="fl-lab"><span class="dot"></span>Live news</span>`+
    (S.sentiment?`<span>last hour ${pill(S.sentiment,S.strength)}</span><span class="fl-meta">tone ${sg(S.tone_last_hour,2)} · ${S.n_last_hour} articles · ${S.positive} positive · ${S.negative} negative</span>`:'<span class="fl-meta">no articles in the last hour</span>')+
    `<span class="fl-meta fl-asof">updated ${esc((F.made_at||'').slice(11,16))}</span></div>`+
    `<div class="fl-track"><div class="fl-run">${list}${list}</div></div>`;
}

// ---------- header ----------
function header(){
  const d=D.day, st=D.meta.status, fin=st==='closed';
  const ch=d.last!=null?d.last-d.prev_close:null, cls=ch==null?'':ch>=0?'up':'down';
  $('spot').innerHTML=d.last!=null?`<span class="spx-lab">NIFTY 50</span><span class="spx ${cls}">${f1(d.last)}</span><span class="spx-chg ${cls}">${sg(ch)} (${sg(ch/d.prev_close*100,2)}%)</span><span class="spx-meta">${fin?'close':'as of '+D.meta.as_of} · ${d.day}</span>`:`<span class="spx-lab">NIFTY 50</span><span class="spx-meta">before the open · ${d.day}</span>`;
  $('ohlc').innerHTML=d.open!=null?`<span class="spx-lab">${fin?'Actual':'So far'}</span>`+
    [['Open',d.open],['High',d.high],['Low',d.low],[fin?'Close':'Last',d.last]].map(([k,v])=>`<span class="o-k">${k}</span><b class="o-v">${f1(v)}</b>`).join('')+
    `<span class="o-k">Range</span><b class="o-v">${f0(d.high-d.low)} pts</b><span class="o-k">Prev close</span><b class="o-v">${f1(d.prev_close)}</b><span class="o-k">Gap</span><b class="o-v">${sg(d.gap_pct,2)}%</b>`:'';
  $('livepill').innerHTML=st==='live'?`<span class="live"><span class="dot"></span>live · updates every 15 minutes</span>`:'';
  $('h-today').textContent=new Date(d.day+'T00:00:00').toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  $('gen').textContent=`page data generated ${D.meta.generated} IST`;
}

// ---------- forecast cards ----------
const LV=[99,97,95,90,75,50,25,10];                                   // high side top-down; low side mirrored
const lvName=k=>k===50?'median':`${k}%`;
// where an actual value landed among a side's levels
function where(v, L, side){
  if(v==null||!L) return '';
  const k=[10,25,50,75,90,95,97,99].filter(q=>L[q]!=null), out=x=>side==='high'?v>=x-0.05:v<=x+0.05;   // a level equal to the extreme so far counts as reached
  let i=-1; k.forEach((q,j)=>{if(out(L[q])) i=j;});
  if(i<0) return D.meta.status==='closed'?`<span class="pos warn">${side==='high'?'below':'above'} the 10% level</span>`:`<span class="pos">not yet at the 10% level</span>`;
  if(k[i]<90) return `<span class="pos ok">inside the 80% band${k[i]>=50?' · past the median':''}</span>`;
  return `<span class="pos warn">${side==='high'?'above':'below'} the ${k[i]}% level</span>`;
}
// hi/lo: {10:..,25:..,...,99:..} in price. Per side: the median as the headline, the other levels in a row below it
// (nearest the open on the left, the far tails on the right), then where the actual stands
const RING=[10,25,75,90,95,97,99];
function levels(hi, lo, opts={}){
  const fin=D.meta.status==='closed', act=opts.actual!==false&&D.day.high!=null;
  const side=(name,cls,L,v,lab)=>`<div class="side"><p class="side-h ${cls}">${name} · median</p><b class="med ${cls}">${f1(L[50])}</b>`+
    `<div class="chips">${RING.map(k=>`<span class="chip${k>90?' tail':''}" title="${k}% level ${f1(L[k])}"><i>${k}%</i>${f0(L[k])}</span>`).join('')}</div>`+
    (act?`<div class="act"><div class="lv"><span>${lab}</span><b>${f1(v)}</b></div>${where(v,L,cls==='hi'?'high':'low')}</div>`:'')+`</div>`;
  return side('High','hi',hi,opts.actH??D.day.high,opts.actLab||(fin?'Actual high':'High so far'))+
         side('Low','lo',lo,opts.actL??D.day.low,opts.actLab2||(fin?'Actual low':'Low so far'));
}
const pick=(o,p)=>o?Object.fromEntries([10,25,50,75,90,95,97,99].map(k=>[k,o[p+k]])):null;
function card(title, sub, hi, lo, note, opts){
  return `<div class="card"><h4>${title}</h4><p class="sub">${sub}</p>`+
    (hi&&lo?`<div class="sides">${levels(hi,lo,opts)}</div>`+(note?`<p class="sub">${note}</p>`:''):`<p class="pend">${opts&&opts.pend||'not issued yet'}</p>`)+`</div>`;
}
function forecastCards(){
  const o=D.open;
  $('c-open').innerHTML=o?`<div class="card big"><h4>Day forecast · OPEN model · 09:15</h4><p class="sub">open ${f1(D.day.open)} · the day's high and low</p><div class="sides">${levels(pick(o.high,'p'),pick(o.low,'p'))}</div></div>`
                         :`<div class="card big"><h4>Day forecast · OPEN model · 09:15</h4><p class="pend">Issued a minute before 09:15, from the pre-open auction.</p></div>`;
  const e=D.elephant_1015;
  const M=D.dvine_1h||[], m=M.length?M[M.length-1]:null;
  const mh=m&&m.h50!=null?Object.fromEntries([10,25,50,75,90,95,97,99].map(k=>[k,m['h'+k]])):null;
  const ml=m&&m.l50!=null?Object.fromEntries([10,25,50,75,90,95,97,99].map(k=>[k,m['l'+k]])):null;
  const N=D.news||{}, NM=N.marks||[], nm=NM.length?NM[NM.length-1]:null, om=nm&&nm.OPEN_at_mark;
  let nh=null, nl=null, nsub='', nmodel='';
  if(om){nmodel=om.high.v2?'v2':'v1'; nh=pick(om.high[nmodel],'p'); nl=pick(om.low[nmodel],'p'); nsub=`OPEN re-issued at ${nm.mark} with the news (${nmodel==='v2'?'daily + real-time':'daily news'})`;}
  else if(N['0915']){nh=pick(N['0915'].OPEN.high.news,'p'); nl=pick(N['0915'].OPEN.low.news,'p'); nsub='OPEN at 09:15 with the daily news';}
  $('cards3').innerHTML=
    card('10:15 re-issue · Elephant v2','the day\'s high and low, with the first hour known',e&&pick(e.high,'q'),e&&pick(e.low,'q'),'95/97/99%: extrapolated from the 75–90% spread',{pend:'issued at 10:15'})+
    card(`Next hour · DVine${m?` · ${m.at}`:''}`,m?`high and low of ${m.at}–${m.until} · P(new high) ${pct(m.ph)} · P(new low) ${pct(m.pl)}`:'every 15 minutes from 10:15',mh,ml,m?`last hour's high ${f1(m.href)} · low ${f1(m.lref)} · close ${f1(m.close)}`:'',{actual:m&&m.act_h!=null, actH:m&&m.act_h, actL:m&&m.act_l, actLab:'Hour\'s actual high', actLab2:'Hour\'s actual low', pend:'first forecast at 10:15'})+
    card('News-calibrated · day forecast',nsub||'once the morning news signal is built',nh,nl,om?`high so far ${f1(om.high.so_far)} · low so far ${f1(om.low.so_far)}: no level inside them`:'',{pend:'not issued yet'});
}

// ---------- gap recovery and day type ----------
const CL=['trend','range','volatile'], CLN={trend:'Trend day',range:'Range day',volatile:'Volatile two-sided'};
const CLX={trend:'picks a direction early and keeps going; closes near one end of the day',
           range:'wanders inside a modest band and closes somewhere in the middle',
           volatile:'big swings both ways that do not hold; closes away from both ends'};
function dayCards(){
  const g=D.gap, t=D.trend||{}, fin=D.meta.status==='closed';
  const bar=(label,p,cls='')=>`<span>${label}</span><div class="bar ${cls}"><i style="width:${(p||0)*100}%"></i></div><b>${pct(p)}</b>`;
  let gc=`<div class="card"><h4>Gap recovery · does the opening gap fill?</h4>`;
  if(!g) gc+=`<p class="pend">issued at 09:15</p>`;
  else{
    const m=k=>g.models[k]&&g.models[k].p;
    gc+=`<p class="sub">gap ${g.side} ${sg(D.day.gap_pct,2)}% · it fills when price trades back to yesterday's close ${f1(g.target)}</p><div class="prob">`+
        bar('Fills by 10:15',m('A'))+bar('Fills by the close',m('B'))+(m('C')!=null?bar('Still open at 10:15 → fills by the close',m('C')):'')+`</div>`+
        `<p class="verdict">${g.filled_at?`Filled at ${g.filled_at}.`:(fin?'Not filled.':'Not filled yet.')}</p>`;
  }
  gc+=`</div>`;
  let tc=`<div class="card"><h4>Trend forecast · what kind of day?</h4>`;
  if(!t['0915']) tc+=`<p class="pend">issued at 09:15</p>`;
  else{
    const top=p=>CL.reduce((a,c)=>p[c]>p[a]?c:a,CL[0]), last=t['1015']||t['0915'], k=top(last);
    tc+=`<p class="sub">most likely now: <b>${CLN[k]}</b> (${pct(last[k])}, ${t['1015']?'10:15':'09:15'} issue)</p>`+
        `<div class="dt"><span class="h"></span><span class="h">09:15</span><span class="h">10:15</span><span class="h">usual</span>`+
        CL.map(c=>`<span title="${esc(CLX[c])}">${CLN[c]}</span><b class="${top(t['0915'])===c?'top':''}">${pct(t['0915'][c])}</b><b class="${t['1015']&&top(t['1015'])===c?'top':''}">${t['1015']?pct(t['1015'][c]):'—'}</b><b style="color:var(--muted)">${pct(t['0915'].base[c])}</b>`).join('')+`</div>`;
    const sf=t.so_far;
    if(sf) tc+=`<p class="verdict">${sf.final?'The day ended as':'If the day ended now'}: <b>${CLN[sf.type]||'—'}</b> (close ${pct(sf.E)} of the range away from the open; range ${sf.R==null?'—':sf.R.toFixed(2)}× a normal day of ≈ ${f0(sf.normal_range_pts)} pts).</p>`;
    tc+=`<p class="sub">${CL.map(c=>`<b>${CLN[c]}</b>: ${CLX[c]}.`).join(' ')}</p>`;
  }
  tc+=`</div>`;
  $('cards-day').innerHTML=gc+tc;
}

// ---------- the day chart ----------
function drawDay(){
  const host=$('c-day'), path=D.day.bars, o=D.open;
  if(!path.length){mount(host,host.clientWidth||900,110,`<text class="t-ax" x="50%" y="56" text-anchor="middle">waiting for the first bar</text>`);return;}
  let lo=Math.min(...path.map(b=>b.l), D.day.prev_close), hi=Math.max(...path.map(b=>b.h), D.day.prev_close);
  if(o){hi=Math.max(hi,o.high.p95??o.high.p90); lo=Math.min(lo,o.low.p95??o.low.p90);}
  const F=frame(host,lo,hi), xE=F.W-F.padR, x0=F.xm(OPEN);
  let s=F.s;
  if(o) for(const [side,col,L] of [['high','var(--hi)',o.high],['low','var(--lo)',o.low]]){
    const yt=F.y(Math.max(L.p10,L.p90)), yb=F.y(Math.min(L.p10,L.p90));
    s+=`<g data-tip="${esc(`Day's ${side}: 8 days in 10 between ${f1(Math.min(L.p10,L.p90))} and ${f1(Math.max(L.p10,L.p90))}<br>middle guess ${f1(L.p50)}`)}"><rect x="${x0}" y="${yt.toFixed(1)}" width="${(xE-x0).toFixed(1)}" height="${Math.max(1,yb-yt).toFixed(1)}" fill="${col}" fill-opacity=".13"/>`+
       `<line x1="${x0}" x2="${xE}" y1="${F.y(L.p50)}" y2="${F.y(L.p50)}" stroke="${col}" stroke-width="1.6"/></g>`+
       lbl(xE-4,F.y(side==='high'?Math.max(L.p10,L.p90):Math.min(L.p10,L.p90))+(side==='high'?-4:12),side==='high'?'high zone':'low zone',col);
    for(const k of [95,99]){ const v=L['p'+k]; if(v==null||v>hi*1.001||v<lo*0.999) continue;
      s+=`<g data-tip="${esc(`${side} ${k}% limit ${f1(v)}: passed about ${k===95?'1 day in 20':'1 day in 100'}`)}"><line x1="${x0}" x2="${xE}" y1="${F.y(v)}" y2="${F.y(v)}" stroke="${col}" stroke-width="1" stroke-dasharray="4 4" stroke-opacity="${k===95?.8:.55}"/></g>`+
         lbl(xE-4,F.y(v)+(side==='high'?-3:11),`${k}% limit ${f0(v)}`,col);}
  }
  const pc=D.day.prev_close;
  s+=`<line x1="${F.padL}" x2="${xE}" y1="${F.y(pc)}" y2="${F.y(pc)}" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="6 4"/>`+lbl(F.padL+4,F.y(pc)+13,`yesterday's close ${f1(pc)}`,'var(--muted)','start');
  s+=candles(F,path);
  mount(host,F.W,F.H,s);
}

// ---------- next hour (DVine 1h) ----------
function drawHour(){
  const host=$('c-hour'), path=D.day.bars, M=D.dvine_1h||[];
  if(!M.length){mount(host,host.clientWidth||900,110,`<text class="t-ax" x="50%" y="56" text-anchor="middle">${path.length?'first forecast at 10:15':'waiting for the session'}</text>`);$('t-hour').innerHTML='';return;}
  let lo=Infinity,hi=-Infinity;
  for(const b of path){lo=Math.min(lo,b.l);hi=Math.max(hi,b.h);}
  for(const m of M){lo=Math.min(lo,m.l90??lo,m.h10??lo);hi=Math.max(hi,m.h90??hi,m.l10??hi);}
  const F=frame(host,lo,hi); let s=F.s;
  for(const m of M){
    const x0=F.x(m.at)+1, x1=Math.min(F.xm(mins(m.at)+15),F.W-F.padR);
    const tip=`Forecast at ${m.at} for ${m.at}–${m.until}`+
      (m.h50!=null?`<br>high ${f1(m.h10)} – ${f1(m.h90)} (middle ${f1(m.h50)})<br>chance of beating the last hour's high: ${pct(m.ph)}`:'')+
      (m.l50!=null?`<br>low ${f1(m.l90)} – ${f1(m.l10)} (middle ${f1(m.l50)})<br>chance of breaking the last hour's low: ${pct(m.pl)}`:'')+
      (m.act_h!=null?`<br>actual high ${f1(m.act_h)} · low ${f1(m.act_l)}`:'<br>hour still running');
    s+=`<g data-tip="${esc(tip)}">`;
    if(m.h50!=null) s+=`<rect x="${x0.toFixed(1)}" y="${F.y(m.h90).toFixed(1)}" width="${Math.max(2,x1-x0-1).toFixed(1)}" height="${Math.max(1,F.y(m.h10)-F.y(m.h90)).toFixed(1)}" fill="var(--hi)" fill-opacity=".18" stroke="var(--hi)" stroke-opacity=".35" stroke-width=".8"/>`;
    if(m.l50!=null) s+=`<rect x="${x0.toFixed(1)}" y="${F.y(m.l10).toFixed(1)}" width="${Math.max(2,x1-x0-1).toFixed(1)}" height="${Math.max(1,F.y(m.l90)-F.y(m.l10)).toFixed(1)}" fill="var(--lo)" fill-opacity=".18" stroke="var(--lo)" stroke-opacity=".35" stroke-width=".8"/>`;
    s+=`</g>`;
  }
  s+=candles(F,path);
  for(const m of M){ if(m.act_h==null) continue;
    const xc=F.x(m.at)+F.bw*1.5, inH=m.act_h>=m.h10&&m.act_h<=m.h90, inL=m.act_l<=m.l10&&m.act_l>=m.l90;
    s+=`<circle cx="${xc}" cy="${F.y(m.act_h)}" r="4" fill="${inH?'var(--ok)':'var(--surface)'}" stroke="${inH?'var(--surface)':'var(--hi)'}" stroke-width="2"/>`+
       `<circle cx="${xc}" cy="${F.y(m.act_l)}" r="4" fill="${inL?'var(--ok)':'var(--surface)'}" stroke="${inL?'var(--surface)':'var(--lo)'}" stroke-width="2"/>`;
  }
  mount(host,F.W,F.H,s);
  const yn=v=>v==null?'<td class="na">—</td>':`<td class="${v?'y':'n'}">${v?'yes':'no'}</td>`;
  $('t-hour').innerHTML=`<thead><tr><th>At</th><th>Close</th><th>P new high</th><th>High 10–90%</th><th>High 95/97/99%</th><th>Actual high</th><th>New high</th><th>P new low</th><th>Low 10–90%</th><th>Low 95/97/99%</th><th>Actual low</th><th>New low</th></tr></thead><tbody>`+
    M.map(m=>`<tr><td>${m.at}</td><td>${f1(m.close)}</td><td>${pct(m.ph)}</td><td>${f1(m.h10)} – ${f1(m.h90)}</td><td>${f1(m.h95)} / ${f1(m.h97)} / ${f1(m.h99)}</td><td>${f1(m.act_h)}</td>${yn(m.new_h)}<td>${pct(m.pl)}</td><td>${f1(m.l90)} – ${f1(m.l10)}</td><td>${f1(m.l95)} / ${f1(m.l97)} / ${f1(m.l99)}</td><td>${f1(m.act_l)}</td>${yn(m.new_l)}</tr>`).join('')+'</tbody>';
}

// ---------- last 30 sessions ----------
let hsel=(()=>{try{return localStorage.getItem('bliss.hist')||'open';}catch(e){return 'open';}})();
const HN={open:['The 09:15 day forecast (OPEN)','OPEN fits no 5th percentile: it is interpolated between its 3rd and 10th.'],
          e1015:['The 10:15 re-issue (Elephant v2, with the first hour known)','Elephant fits the 10th to 90th only: the 5th and 95th are extrapolated from the 10–25% and 75–90% spreads. At 10:15 part of the day is already known, so its bands start from more information than the 09:15 ones.']};
function setHist(k){hsel=k; try{localStorage.setItem('bliss.hist',k);}catch(e){} for(const x of ['open','e1015']) $('h-'+x).setAttribute('aria-pressed',x===k); drawHistory();}
$('h-open').onclick=()=>setHist('open'); $('h-e1015').onclick=()=>setHist('e1015');
function drawHistory(){
  for(const x of ['open','e1015']) $('h-'+x).setAttribute('aria-pressed',x===hsel);
  $('h-what').textContent=HN[hsel][0]; $('h-note').textContent=HN[hsel][1];
  const H=D.history&&(D.history[hsel]||(D.history.rows?D.history:null)), R=H&&H.rows||[];
  if(!R.length){$('acc').innerHTML='';$('c-hist').innerHTML='';$('t-hist').innerHTML='';return;}
  const A=H.accuracy;
  $('acc').innerHTML=[['in50','50% band',50],['in80','80% band',80],['in90','90% band',90]].map(([k,n,t])=>
    `<div class="acc-t"><span>Within the ${n}</span><div class="acc-v"><b class="hi">${pct(A[k].h)}</b><em>high</em><b class="lo">${pct(A[k].l)}</b><em>low</em></div><p>of ${H.n} sessions · a calibrated band: ${t}%</p></div>`).join('');
  const host=$('c-hist'), W=host.clientWidth||900, padL=64, padR=12, top=12, PH=W<520?260:340;
  let lo=Infinity, hi=-Infinity;
  for(const r of R){hi=Math.max(hi,r.h.p95,r.h.act); lo=Math.min(lo,r.l.p95,r.l.act);}
  const pv=(hi-lo)*.04; lo-=pv; hi+=pv;
  const y=v=>top+(hi-v)/(hi-lo)*PH, cw=(W-padL-padR)/R.length, xc=i=>padL+cw*(i+.5), bw=Math.max(3,Math.min(14,cw*.55));
  const mag=Math.pow(10,Math.floor(Math.log10(hi-lo))), rr=(hi-lo)/mag, step=mag*(rr>5?1:rr>2?0.5:0.2);
  let s='';
  for(let t=Math.ceil(lo/step)*step;t<=hi;t+=step) s+=`<line class="g-grid" x1="${padL}" x2="${W-padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="t-ax" x="${padL-7}" y="${(y(t)+4).toFixed(1)}" text-anchor="end">${f0(t)}</text>`;
  R.forEach((r,i)=>{
    const x=xc(i), dt=new Date(r.day+'T00:00:00');
    if(i%5===0||i===R.length-1) s+=`<text class="t-ax" x="${x}" y="${top+PH+17}" text-anchor="middle">${dt.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</text>`;
    for(const [k,col] of [['h','var(--hi)'],['l','var(--lo)']]){
      const b=r[k], tip=`${r.day} · open ${f1(r.open)}<br>${k==='h'?'high':'low'}: actual ${f1(b.act)}<br>50%: ${f1(b.p25)} – ${f1(b.p75)} ${b.in50?'✓':'✗'}<br>80%: ${f1(b.p10)} – ${f1(b.p90)} ${b.in80?'✓':'✗'}<br>90%: ${f1(b.p5)} – ${f1(b.p95)} ${b.in90?'✓':'✗'}`;
      const rect=(a,c,op)=>`<rect x="${(x-bw/2).toFixed(1)}" y="${y(Math.max(a,c)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,Math.abs(y(a)-y(c))).toFixed(1)}" fill="${col}" fill-opacity="${op}"/>`;
      s+=`<g data-tip="${esc(tip)}"><line x1="${x}" x2="${x}" y1="${y(b.p5)}" y2="${y(b.p95)}" stroke="${col}" stroke-width="1.2" stroke-opacity=".6"/>`+rect(b.p10,b.p90,.22)+rect(b.p25,b.p75,.45)+
         `<rect x="${(x-cw/2).toFixed(1)}" y="${top}" width="${cw.toFixed(1)}" height="${PH}" fill="transparent"/></g>`+
         `<circle cx="${x}" cy="${y(b.act)}" r="3.6" fill="${b.in80?'var(--ok)':'var(--surface)'}" stroke="${b.in80?'var(--surface)':col}" stroke-width="2" pointer-events="none"/>`;
    }
  });
  mount(host,W,top+PH+24,s);
  const ck=v=>`<td class="${v?'y':'n'}">${v?'✓':'✗'}</td>`;
  const rng=(a,b)=>`${f0(Math.min(a,b))} – ${f0(Math.max(a,b))}`;
  $('t-hist').innerHTML=`<thead><tr><th>Session</th><th>Open</th><th class="hi">Actual high</th><th>High 50%</th><th>High 80%</th><th>High 90%</th><th>50</th><th>80</th><th>90</th><th class="lo">Actual low</th><th>Low 50%</th><th>Low 80%</th><th>Low 90%</th><th>50</th><th>80</th><th>90</th></tr></thead><tbody>`+
    R.slice().reverse().map(r=>`<tr><td>${r.day}</td><td>${f1(r.open)}</td><td class="hi">${f1(r.h.act)}</td><td>${rng(r.h.p25,r.h.p75)}</td><td>${rng(r.h.p10,r.h.p90)}</td><td>${rng(r.h.p5,r.h.p95)}</td>${ck(r.h.in50)}${ck(r.h.in80)}${ck(r.h.in90)}`+
      `<td class="lo">${f1(r.l.act)}</td><td>${rng(r.l.p25,r.l.p75)}</td><td>${rng(r.l.p10,r.l.p90)}</td><td>${rng(r.l.p5,r.l.p95)}</td>${ck(r.l.in50)}${ck(r.l.in80)}${ck(r.l.in90)}</tr>`).join('')+
    `</tbody><tfoot><tr><td colspan="6">Share within</td><td>${pct(A.in50.h)}</td><td>${pct(A.in80.h)}</td><td>${pct(A.in90.h)}</td><td colspan="4"></td><td>${pct(A.in50.l)}</td><td>${pct(A.in80.l)}</td><td>${pct(A.in90.l)}</td></tr></tfoot>`;
}

// ---------- news calibration (analysis_granular/news/news_live.py) ----------
function drawNews(){
  const N=D.news, host=$('nw-body');
  if(!N||(!N['0915']&&!N.marks)){host.innerHTML=`<p class="pend">Not issued yet: the news layer needs the morning's news signal (built after 05:30), then follows each issue of the models.</p>`;$('t-news').innerHTML='';drawNewsScores();return;}
  const a=N['0915'], M=N.marks||[], L=M.length?M[M.length-1]:null, nc=(L||a).news, rt=L&&L.realtime_news;
  const has2=!!(L&&L.OPEN_at_mark&&L.OPEN_at_mark.high.v2);
  const cell=(k,v,em)=>`<div class="tcell"><span>${k}</span><b>${v}</b>${em?`<em>${em}</em>`:''}</div>`;
  const n2=v=>v==null?'—':(+v).toFixed(2);
  let h=`<div class="nw-head">`+
    cell('Daily news',nc.news_data?'available':'no data',nc.news_data?(nc.source||''):'counted as an ordinary news day')+
    cell('Mood',n2(nc.mood))+cell('Loudness',n2(nc.loud))+
    cell('Direction',nc.direction||'—',nc.magnitude||'')+
    cell('Impact on the gap',nc.impact_pct==null?'—':`${sg(nc.impact_pct,3)}%`)+
    (rt?cell(`Real-time news · ${L.mark}`,`driver share ${n2(rt.so_share)} · tone ${n2(rt.so_tone)}`,`since the open · last hour: share ${n2(rt.h1_share)}, tone ${n2(rt.h1_tone)} · push ${n2(rt.so_push)} · vs the same mark of the last 60 sessions`):'')+
    `</div>`;
  const tops=Object.entries(nc.top_topics||{});
  if(tops.length) h+=`<p class="nw-topics">Loudest topics today: ${tops.map(([k,v])=>`${esc(k.replace(/_/g,' '))} ${sg(v,2)}`).join(' · ')}</p>`;
  // OPEN: 09:15 base vs news, and the latest mark's re-issue
  const lev=[['high',99],['high',95],['high',90],['high',50],['high',10],['low',10],['low',50],['low',90],['low',95],['low',99]];
  const om=L&&L.OPEN_at_mark;
  const td=(v,cls)=>`<td class="${cls||''}">${f1(v)}</td>`;
  h+=`<h4>The day's high and low · OPEN</h4><div class="scroll"><table><thead><tr><th>Level</th><th>09:15 base</th><th class="nw">09:15 news</th>`+
     (om?`<th>${L.mark} base</th><th class="nw">${L.mark} v1</th><th class="nw">${L.mark} v2</th>`:'')+`</tr></thead><tbody>`+
     lev.map(([sd,k])=>`<tr><td>${sd==='high'?'High':'Low'} · ${k===50?'median':k+'%'}</td>`+
       (a?td(a.OPEN[sd].base['p'+k])+td(a.OPEN[sd].news['p'+k],'nw'):'<td class="na">—</td><td class="na">—</td>')+
       (om?td(om[sd].base['p'+k])+td(om[sd].v1&&om[sd].v1['p'+k],'nw')+td(om[sd].v2&&om[sd].v2['p'+k],'nw'):'')+`</tr>`).join('')+
     (om?`<tr><td>So far at ${L.mark}</td><td class="na"></td><td class="na"></td><td colspan="3" class="dim">high ${f1(om.high.so_far)} · low ${f1(om.low.so_far)}</td></tr>`:'')+
     `</tbody></table></div>`;
  if(om&&!has2) h+=`<p class="tbl-note">v2 not issued at ${L.mark}: ${esc(L.method.split('(v2 not issued: ')[1]?.replace(')','')||'no real-time news history')}.</p>`;
  // DVine
  const dvt=(title,R,cols,refl)=>{if(!R) return `<div><h4>${title}</h4><p class="pend">not issued yet</p></div>`;
    const row=(lab,f)=>`<tr><td>${lab}</td>${cols.map(([c,cl])=>`<td class="${cl}">${R.high[c]||R.low[c]?f(c):'—'}</td>`).join('')}</tr>`;
    return `<div><h4>${title}</h4><div class="scroll"><table><thead><tr><th></th>${cols.map(([c,cl,n])=>`<th class="${cl}">${n}</th>`).join('')}</tr></thead><tbody>`+
      row(`P above ${refl} high ${f1(R.high.current)}`,c=>pct(R.high[c]&&R.high[c].p_new_extreme))+
      row('High · 90%',c=>f1(R.high[c]&&R.high[c].q90))+row('High · median',c=>f1(R.high[c]&&R.high[c].q50))+
      row(`P below ${refl} low ${f1(R.low.current)}`,c=>pct(R.low[c]&&R.low[c].p_new_extreme))+
      row('Low · median',c=>f1(R.low[c]&&R.low[c].q50))+row('Low · 90%',c=>f1(R.low[c]&&R.low[c].q90))+`</tbody></table></div></div>`;};
  h+=`<div class="nw-grid">`+dvt('Today vs yesterday · DVine 1d',a&&a.DVine_1d,[['base','','base (prev. close)'],['news','nw','news (09:15)']],"yesterday's")+
     dvt(`Next hour from ${L?L.mark:'the mark'} · DVine 1h`,L&&L.DVine_1h,[['base','','base'],['v1','nw','v1'],['v2','nw','v2']],"last hour's")+`</div>`;
  host.innerHTML=h;
  const g=(m,sd,k)=>{const o=m.OPEN_at_mark&&m.OPEN_at_mark[sd]; return o&&o[k]?f1(o[k].p90):'—';};
  const pp=(m,sd,k)=>{const o=m.DVine_1h&&m.DVine_1h[sd]; return o&&o[k]?pct(o[k].p_new_extreme):'—';};
  $('t-news').innerHTML=`<thead><tr><th>Mark</th><th>OPEN high 90% base</th><th class="nw">v1</th><th class="nw">v2</th><th>OPEN low 90% base</th><th class="nw">v1</th><th class="nw">v2</th><th>P next-hour new high base</th><th class="nw">v1</th><th class="nw">v2</th><th>P next-hour new low base</th><th class="nw">v1</th><th class="nw">v2</th></tr></thead><tbody>`+
    M.map(m=>`<tr><td>${m.mark}</td><td>${g(m,'high','base')}</td><td class="nw">${g(m,'high','v1')}</td><td class="nw">${g(m,'high','v2')}</td><td>${g(m,'low','base')}</td><td class="nw">${g(m,'low','v1')}</td><td class="nw">${g(m,'low','v2')}</td>`+
      `<td>${pp(m,'high','base')}</td><td class="nw">${pp(m,'high','v1')}</td><td class="nw">${pp(m,'high','v2')}</td><td>${pp(m,'low','base')}</td><td class="nw">${pp(m,'low','v1')}</td><td class="nw">${pp(m,'low','v2')}</td></tr>`).join('')+'</tbody>';
  drawNewsScores();
}
function drawNewsScores(){
  const S=(D.news&&D.news.scores)||[], n4=v=>v==null?'—':v.toFixed(4), cv=v=>v==null?'—':`${Math.round(v*100)}%`;
  $('t-news-sc').innerHTML=S.length?`<thead><tr><th>Forecast</th><th>Period</th><th>Sessions</th><th>Error base</th><th>Recalibrated</th><th class="nw">With news</th><th class="nw">News − recal. [95%]</th><th>80% band held base / recal. / news</th></tr></thead><tbody>`+
    S.map(r=>`<tr><td>${r.product} · ${r.what}</td><td>${r.period==='2023_2026'?'2023–26':r.period}</td><td>${r.n}</td><td>${n4(r.base)}</td><td>${n4(r.recal)}</td><td class="nw">${n4(r.news)}</td><td class="nw">${sg(r.d[0],4)} [${sg(r.d[1],4)}, ${sg(r.d[2],4)}]</td><td>${r.cover80?`${cv(r.cover80.base)} / ${cv(r.cover80.recal)} / ${cv(r.cover80.news)}`:'—'}</td></tr>`).join('')+'</tbody>':'';
}

function render(){ if(!D) return; drawFlash(); header(); forecastCards(); dayCards(); drawDay(); drawHour(); drawNews(); drawHistory(); }

// ---------- tooltip, refresh ----------
const tip=$('tip');
document.addEventListener('mousemove',e=>{
  const g=e.target.closest&&e.target.closest('[data-tip]');
  if(!g){tip.hidden=true;return;}
  tip.innerHTML=g.getAttribute('data-tip'); tip.hidden=false;
  const r=tip.getBoundingClientRect(); let x=e.clientX+14, y=e.clientY+14;
  if(x+r.width>innerWidth-8) x=e.clientX-r.width-14; if(y+r.height>innerHeight-8) y=e.clientY-r.height-14;
  tip.style.left=x+'px'; tip.style.top=y+'px';
});
let rt; addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(render,150);});
// GitHub Pages lets browsers keep index.html for 10 minutes: when publish.sh writes a new page version, reload through
// a fresh address so the new design shows without a manual refresh
const VER=((document.currentScript&&document.currentScript.src||'').match(/[?&]v=([^&]+)/)||[])[1];
async function checkVersion(){
  if(!VER) return;
  try{const r=await fetch(`version.txt?t=${Date.now()}`,{cache:'no-store'}); if(!r.ok) return;
    const v=(await r.text()).trim(); if(v&&v!==VER) location.replace(`${location.pathname}?v=${v}${location.hash}`);}catch(e){}
}
async function load(){
  checkVersion();
  try{
    const r=await fetch(`data.json?t=${Date.now()}`,{cache:'no-store'}); if(!r.ok) throw new Error(r.status);
    D=await r.json(); render();
  }catch(e){$('gen').textContent='could not load data.json';}
}
load(); setInterval(load,5*60*1000);
})();
