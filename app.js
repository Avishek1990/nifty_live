/* Standalone NIFTY live page. Fetches data.json (written by web/build.py),
   renders the price path (line or green/red candles) with the next-hour and
   next-15-minute high/low bands and a direction panel per horizon, and re-reads
   the data every 15 minutes so it tracks the feed on its own. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const f1=v=>v==null?'—':v.toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1});
const pct=v=>v==null?'—':`${Math.round(v*100)}%`;
const mins=t=>{const[a,b]=t.split(':').map(Number);return a*60+b;};
const OPEN=mins('09:15'), CLOSE=mins('15:30');
const mount=(host,W,H,s)=>host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">${s}</svg>`;

// per-viewer display choices survive refreshes
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:v;}catch(e){return d;}},
             set(k,v){try{localStorage.setItem(k,v);}catch(e){}}};
const opt={style:store.get('nlb.style','line'), vol:store.get('nlb.vol','0')==='1', hour:store.get('nlb.hour','0')==='1', upd:store.get('nlb.upd','0')==='1'};

let D=null;                                  // latest payload
const score=ms=>{const d=ms.filter(m=>m.act_high!=null);const n=d.reduce((a,m)=>a+m.hit_h+m.hit_l,0);
  return d.length?`${n}/${2*d.length}`:'—';};
const dscore=ms=>{const d=ms.filter(m=>m.dir_ok!=null);const n=d.reduce((a,m)=>a+(m.dir_ok?1:0),0);
  return d.length?`${n}/${d.length}`:'—';};

// ---------- price + bands ----------
function drawDay(host, path, marks, clipHour){
  if(!host) return;
  const W=host.clientWidth||900, padL=68, padR=12, top=14;
  const priceH=W<520?260:340, volH=opt.vol?64:0, gap=opt.vol?12:0, axisH=26;
  const H=top+priceH+gap+volH+axisH;
  if(!path.length){mount(host,W,110,`<text class="t-ax" x="${W/2}" y="56" text-anchor="middle">no data yet</text>`);return;}
  let xlo=OPEN, xhi=CLOSE;
  if(clipHour){                                            // "this hour": last 60 min of data
    xhi=Math.min(CLOSE, mins(path[path.length-1].t)+5);
    xlo=Math.max(OPEN, xhi-60);
    path=path.filter(b=>mins(b.t)+5>xlo && mins(b.t)<=xhi);
    marks=marks.filter(m=>mins(m.until)>xlo && mins(m.at)<xhi);
    if(!path.length){mount(host,W,110,`<text class="t-ax" x="${W/2}" y="56" text-anchor="middle">no data this hour</text>`);return;}
  }
  let lo=Infinity,hi=-Infinity;
  for(const b of path){lo=Math.min(lo,b.l);hi=Math.max(hi,b.h);}
  for(const m of marks){lo=Math.min(lo,m.l10,m.h10);hi=Math.max(hi,m.h90,m.l90);
    if(m.act_low!=null){lo=Math.min(lo,m.act_low);hi=Math.max(hi,m.act_high);}}
  const pv=(hi-lo)*0.05; lo-=pv; hi+=pv;
  const xm=m=>padL+(m-xlo)/(xhi-xlo)*(W-padL-padR);
  const x=t=>xm(mins(t));
  const y=v=>top+(hi-v)/(hi-lo)*priceH;
  const bw=(W-padL-padR)/Math.max(1,(xhi-xlo)/5);
  const mag=Math.pow(10,Math.floor(Math.log10(hi-lo)));
  const rr=(hi-lo)/mag, step=mag*(rr>5?1:rr>2?0.5:0.2);
  let s='';
  for(let t=Math.ceil(lo/step)*step;t<=hi;t+=step)
    s+=`<line class="g-grid" x1="${padL}" x2="${W-padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`+
       `<text class="t-ax" x="${padL-7}" y="${(y(t)+4).toFixed(1)}" text-anchor="end">${Math.round(t).toLocaleString()}</text>`;
  const bottom=top+priceH+gap+volH;
  const tstep=(xhi-xlo)<=75?15:60;                          // 15-min ticks when zoomed to an hour
  for(let tm=Math.ceil(xlo/tstep)*tstep; tm<=xhi; tm+=tstep){
    const lab=`${String(Math.floor(tm/60)).padStart(2,'0')}:${String(tm%60).padStart(2,'0')}`;
    s+=`<line class="g-grid" x1="${xm(tm)}" x2="${xm(tm)}" y1="${top}" y2="${bottom}" stroke-dasharray="2 4"/>`+
       `<text class="t-ax" x="${xm(tm)}" y="${bottom+18}" text-anchor="middle">${lab}</text>`;
  }
  if(opt.vol){
    const v0=top+priceH+gap, vmax=Math.max(...path.map(b=>b.v))||1;
    s+=`<text class="t-ax" x="${padL-7}" y="${v0+10}" text-anchor="end">vol</text>`+
       `<line class="g-grid" x1="${padL}" x2="${W-padR}" y1="${v0+volH}" y2="${v0+volH}"/>`;
    for(const b of path){const h=b.v/vmax*volH, up=b.c>=b.o;
      s+=`<rect x="${(x(b.t)+bw*.15).toFixed(1)}" y="${(v0+volH-h).toFixed(1)}" width="${Math.max(1,bw*.7).toFixed(1)}" height="${h.toFixed(1)}" fill="${up?'var(--up)':'var(--down)'}" fill-opacity=".5"><title>${b.t} volume ${b.v.toLocaleString()}</title></rect>`;}
  }
  // forecast boxes across the span they cover
  for(const m of marks){
    const x0=x(m.at), x1=Math.min(x(m.until),W-padR);
    const box=(a,b,col)=>`<rect x="${x0.toFixed(1)}" y="${y(b).toFixed(1)}" width="${Math.max(2,x1-x0-1).toFixed(1)}" height="${Math.max(1,y(a)-y(b)).toFixed(1)}" fill="${col}" fill-opacity=".2" stroke="${col}" stroke-opacity=".35" stroke-width=".8"/>`;
    s+=`<g class="mark" data-tip="${esc(`${m.at}→${m.until}<br>high ${f1(m.h10)} – ${f1(m.h90)} (median ${f1(m.h50)})<br>low ${f1(m.l10)} – ${f1(m.l90)} (median ${f1(m.l50)})`+(m.upd&&opt.upd?`<br><b>updated ${m.upd.as_of}</b> (+${m.upd.elapsed} min)<br>high ${f1(m.upd.h10)} – ${f1(m.upd.h90)} · low ${f1(m.upd.l10)} – ${f1(m.upd.l90)}`:'')+(m.act_high!=null?`<br>actual high ${f1(m.act_high)} · ${m.hit_h?'in band':'outside'}<br>actual low ${f1(m.act_low)} · ${m.hit_l?'in band':'outside'}`:'<br>still running'))}">`;
    s+=box(m.h10,m.h90,'var(--hi)')+box(m.l10,m.l90,'var(--lo)');
    s+=`<line x1="${x0}" x2="${x1-1}" y1="${y(m.h50)}" y2="${y(m.h50)}" stroke="var(--hi)" stroke-width="1.3"/>`;
    s+=`<line x1="${x0}" x2="${x1-1}" y1="${y(m.l50)}" y2="${y(m.l50)}" stroke="var(--lo)" stroke-width="1.3"/>`;
    if(m.upd && opt.upd){                                    // opt-in: in-window updated band
      const u=m.upd, ux0=Math.max(x0,x(u.as_of));
      const ubox=(a,b,col)=>`<rect x="${ux0.toFixed(1)}" y="${y(b).toFixed(1)}" width="${Math.max(2,x1-ux0-1).toFixed(1)}" height="${Math.max(1,y(a)-y(b)).toFixed(1)}" fill="${col}" fill-opacity=".28" stroke="${col}" stroke-width="1.4" stroke-dasharray="4 3"/>`;
      s+=ubox(u.h10,u.h90,'var(--hi)')+ubox(u.l10,u.l90,'var(--lo)');
    }
    s+=`</g>`;
  }
  // price: 5-minute candles (green up / red down) or the close line
  if(opt.style==='candle'){
    for(const b of path){const cx=x(b.t)+bw/2, up=b.c>=b.o, col=up?'var(--up)':'var(--down)';
      const yt=y(Math.max(b.o,b.c)), yb=y(Math.min(b.o,b.c)), w=Math.max(1.5,bw*.62);
      s+=`<g><title>${b.t}  O ${f1(b.o)}  H ${f1(b.h)}  L ${f1(b.l)}  C ${f1(b.c)}  ${up?'▲ buy':'▼ sell'}</title>`+
         `<line x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${y(b.h).toFixed(1)}" y2="${y(b.l).toFixed(1)}" stroke="${col}" stroke-width="1"/>`+
         `<rect x="${(cx-w/2).toFixed(1)}" y="${yt.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1,yb-yt).toFixed(1)}" fill="${col}" stroke="${col}" stroke-width="1"/></g>`;}
  } else {
    const pts=path.map(b=>`${(x(b.t)+bw).toFixed(1)},${y(b.c).toFixed(1)}`).join(' ');
    s+=`<polyline points="${pts}" fill="none" stroke="var(--act)" stroke-width="1.6" stroke-linejoin="round"/>`;
  }
  for(const m of marks){
    if(m.act_high==null) continue;
    const xm=(x(m.at)+Math.min(x(m.until),W-padR))/2;
    for(const [v,hit] of [[m.act_high,m.hit_h],[m.act_low,m.hit_l]])
      s+=`<circle cx="${xm.toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.3" fill="${hit?'var(--ok)':'var(--lo)'}" stroke="var(--surface)" stroke-width="1.2"/>`;
  }
  mount(host,W,H,s);
}

// ---------- direction ----------
function drawDir(host, marks){
  if(!host) return;
  const W=host.clientWidth||900, padL=68, padR=12, top=14, plotH=W<520?120:150, axisH=30;
  const H=top+plotH+axisH;
  if(!marks.length){mount(host,W,90,`<text class="t-ax" x="${W/2}" y="48" text-anchor="middle">no forecast yet</text>`);return;}
  const x=t=>padL+(mins(t)-OPEN)/(CLOSE-OPEN)*(W-padL-padR);
  const y=p=>top+(1-p)*plotH;                       // p in 0..1, 1 at top
  const yc=y(0.5);
  let s='';
  for(const [p,lab] of [[1,'up'],[0.75,''],[0.5,'50%'],[0.25,''],[0,'down']]){
    s+=`<line class="g-grid" x1="${padL}" x2="${W-padR}" y1="${y(p).toFixed(1)}" y2="${y(p).toFixed(1)}"${p===0.5?' stroke-dasharray="2 4"':''}/>`;
    if(lab) s+=`<text class="t-ax" x="${padL-7}" y="${(y(p)+4).toFixed(1)}" text-anchor="end">${lab}</text>`;
  }
  for(const t of ['10:15','11:15','12:15','13:15','14:15','15:15'])
    s+=`<text class="t-ax" x="${x(t)}" y="${top+plotH+18}" text-anchor="middle">${t}</text>`;
  for(const m of marks){
    if(m.dir==null) continue;
    const x0=x(m.at), x1=Math.min(x(m.until),W-padR), up=m.dir>=0.5, col=up?'var(--up)':'var(--down)';
    const yb=y(m.dir), yTop=Math.min(yb,yc), hgt=Math.max(1,Math.abs(yb-yc));
    const tip=`${m.at}→${m.until}<br>P(up) ${pct(m.dir)} · leans ${up?'up':'down'}`+
      (m.dir_up!=null?`<br>closed ${m.dir_up?'up':'down'} ${m.dir_move>0?'+':''}${f1(m.dir_move)} pts · call ${m.dir_ok?'right':'wrong'}`:'<br>still running');
    s+=`<g class="mark" data-tip="${esc(tip)}">`+
       `<rect x="${(x0+1).toFixed(1)}" y="${yTop.toFixed(1)}" width="${Math.max(2,x1-x0-2).toFixed(1)}" height="${hgt.toFixed(1)}" fill="${col}" fill-opacity=".55" stroke="${col}" stroke-opacity=".8" stroke-width=".8"/>`;
    if(m.dir_up!=null){                              // realised move as a triangle under the axis
      const xm=(x0+x1)/2, ay=top+plotH+7, oc=m.dir_ok?'var(--ok)':'var(--lo)';
      s+=m.dir_up
        ?`<path d="M${xm-4} ${ay+6} L${xm+4} ${ay+6} L${xm} ${ay} Z" fill="${oc}"/>`
        :`<path d="M${xm-4} ${ay} L${xm+4} ${ay} L${xm} ${ay+6} Z" fill="${oc}"/>`;
    }
    s+=`</g>`;
  }
  mount(host,W,H,s);
}

function table(host, marks){
  if(!host) return;
  if(!marks.length){host.innerHTML=`<tbody><tr><td>Nothing forecast yet.</td></tr></tbody>`;return;}
  const ib=v=>v==null?'':(v?'<span class="hit">in</span>':'<span class="miss">out</span>');
  const dc=m=>m.dir==null?'':(m.dir>=0.5?`<span class="up">${pct(m.dir)}↑</span>`:`<span class="down">${pct(m.dir)}↓</span>`);
  const rows=marks.map(m=>`<tr><td>${m.at}–${m.until}</td><td>${f1(m.close)}</td>`+
    `<td>${f1(m.h10)}</td><td>${f1(m.h50)}</td><td>${f1(m.h90)}</td>`+
    `<td>${f1(m.l10)}</td><td>${f1(m.l50)}</td><td>${f1(m.l90)}</td>`+
    `<td>${dc(m)}</td>`+
    `<td>${f1(m.act_high)}</td><td>${ib(m.hit_h)}</td><td>${f1(m.act_low)}</td><td>${ib(m.hit_l)}</td></tr>`).join('');
  host.innerHTML=`<thead><tr><th>window</th><th>price at mark</th><th>high p10</th><th>high p50</th><th>high p90</th>`+
    `<th>low p10</th><th>low p50</th><th>low p90</th><th>P(up)</th><th>actual high</th><th>in</th><th>actual low</th><th>in</th></tr></thead><tbody>${rows}</tbody>`;
}

// ---------- render everything from D ----------
function render(){
  const M=D.meta;
  $('s-day').textContent=D.day;
  $('s-status').textContent=M.day_status||'';
  $('s-asof').textContent=(M.as_of||'').slice(11,16)||'—';
  $('s-h60').textContent=score(D.marks60);
  $('s-h15').textContent=score(D.marks15);
  $('f-gen').textContent=M.generated;
  $('h-today').textContent=D.day;
  $('h-ref').textContent=D.ref||'No earlier session';
  $('r-60').textContent=D.ref?`${score(D.refmarks60)} bands held · direction ${dscore(D.refmarks60)}`:'';
  $('r-15').textContent=D.ref?`${score(D.refmarks15)} bands held · direction ${dscore(D.refmarks15)}`:'';
  $('livepill').innerHTML=(M.day_status||'').indexOf('progress')>=0
    ?`<span class="live"><span class="dot"></span>market open · data through ${esc((M.as_of||'').slice(11,16))}</span>`:'';
  (function(){
    const next=(done,grid)=>grid.find(t=>done.indexOf(t)<0)||null;
    const n60=next(D.marks60.map(m=>m.at),D.grid60), n15=next(D.marks15.map(m=>m.at),D.grid15);
    const p=$('p-today');
    if(!D.marks15.length&&!D.marks60.length){
      p.innerHTML=`<span class="wait">No forecast yet. The first sixty-minute window closes at <b>10:15</b>; both models forecast from then.</span>`;return;}
    p.innerHTML=`${D.marks60.length} hourly and ${D.marks15.length} fifteen-minute forecast${D.marks15.length===1?'':'s'} so far. `+
      `Next: ${n15?`15-minute at <b>${n15}</b>`:'no more 15-minute marks'}, ${n60?`hourly at <b>${n60}</b>`:'no more hourly marks'}.`;
  })();
  renderSpot();
  renderDesk();
  renderTiger();
  flowHead($('fh-today'),D.flowpath); flowHead($('fh-ref'),D.refflowpath);
  table($('t-60'),D.marks60); table($('t-15'),D.marks15);
  redraw();
}

// ---------- Tiger: next-session day forecast from the 09:15 open ----------
function renderTiger(){
  const host=$('tiger'); if(!host) return;
  const t=D.tiger;
  if(!t){ host.innerHTML=''; host.style.display='none'; return; }
  host.style.display='';
  const sg=v=>(v>0?'+':'')+v;
  const cell=(lab,val,sub,cls)=>`<div class="tcell ${cls||''}"><span>${lab}</span><b>${val}</b>${sub?`<em>${sub}</em>`:''}</div>`;
  host.innerHTML=`<div class="thead">Day forecast · <b>Tiger</b> <span class="rng">· from 09:15 open, model to ${esc(t.train_end||'')}</span></div>`+
    `<div class="trow">`+
      cell('Open', f1(t.open), '', '')+
      cell('High', f1(t.high), sg(t.high_pct)+'%', 'hi')+
      cell('Low', f1(t.low), sg(t.low_pct)+'%', 'lo')+
      cell('Range', f1(t.range_pts)+' pts', t.range_pct+'%', '')+
      `<div class="tcell"><span>Volatility</span><b class="vol vol-${esc(t.volclass)}">${esc(t.volclass)}</b></div>`+
    `</div>`+
    `<div class="tband">80% band · High ${f1(t.band_high_lo)}–${f1(t.band_high_hi)} · Low ${f1(t.band_low_lo)}–${f1(t.band_low_hi)}</div>`;
}

// ---------- current market price ----------
function renderSpot(){
  const s=D.spot;
  let html='';
  if(s){
    const up=s.change>=0, sg=up?'+':'';
    html=`<span class="spx-lab">NIFTY-I</span>`+
      `<b class="spx ${up?'up':'down'}">${f1(s.price)}</b>`+
      `<span class="spx-chg ${up?'up':'down'}">${sg}${f1(s.change)} (${sg}${s.change_pct}%)</span>`+
      `<span class="spx-meta">${esc(s.at)} IST${s.vix!=null?' \u00b7 VIX '+s.vix:''}</span>`;
  }
  for(const id of ['spot','spot2']){
    const el=$(id); if(!el) continue;
    el.style.display = s ? '' : 'none';
    el.innerHTML = html;
  }
}

// ---------- trade levels + order flow (above the charts) ----------
function levelCard(host, title, lv){
  if(!host) return;
  if(!lv){ host.innerHTML=`<h4>${title}</h4><div class="rng">awaiting first forecast</div>`; return; }
  const span=title.indexOf('hour')>=0?60:15;
  const upd=lv.upd?`<div class="rng upd">updated ${esc(lv.upd.as_of)} · ${lv.upd.elapsed}/${span} min in · frozen fences ${f1(lv.frozen_high)} / ${f1(lv.frozen_low)}</div>`:'';
  host.innerHTML=`<h4>${title}</h4><div class="rng">${lv.at}→${lv.until} · at ${f1(lv.close)}</div>`+upd+
    `<div class="lv fence"><span>Fence ↑ (P90)</span><b>${f1(lv.fence_high)}</b></div>`+
    `<div class="lv hi"><span>High (P50)</span><b>${f1(lv.high)}</b></div>`+
    `<div class="lv lo"><span>Low (P50)</span><b>${f1(lv.low)}</b></div>`+
    `<div class="lv fence"><span>Fence ↓ (P10)</span><b>${f1(lv.fence_low)}</b></div>`+
    `<div class="lv sl"><span>SL · long</span><b>${f1(lv.sl_long)}</b></div>`+
    `<div class="lv sl"><span>SL · short</span><b>${f1(lv.sl_short)}</b></div>`;
}
function flowRow(tag, fl){
  if(!fl) return `<div class="flowrow"><span class="flab">${tag}</span><span class="fmeta">no data yet</span></div>`;
  const bull = fl.regime==='long_buildup' || fl.regime==='short_covering';
  const oi = fl.oi_dir==='building' ? `<span class="badge build">New OI building</span>`
           : fl.oi_dir==='clearing' ? `<span class="badge clear">OI clearing</span>`
           : `<span class="badge">OI flat</span>`;
  const reg = fl.regime==='flat' ? `<span class="badge">Flat</span>`
            : `<span class="badge ${bull?'bull':'bear'}">${fl.label}</span>`;
  const sg = v => (v>0?'+':'')+v;
  return `<div class="flowrow"><span class="flab">${tag}</span>${oi}${reg}`+
    `<span class="fmeta">OI ${sg(fl.oi_change_pct)}% · px ${sg(fl.price_change_pct)}%</span></div>`;
}
function renderDesk(){
  const L=D.levels||{}, F=D.flow||{};
  levelCard($('lv-60'),'Next hour', L['60']);
  levelCard($('lv-15'),'Next 15 min', L['15']);
  const box=$('flowbox'); if(!box) return;
  const cov=(F['60']&&F['60'].short_covering)||(F['15']&&F['15'].short_covering);
  const unw=(F['60']&&F['60'].long_unwinding)||(F['15']&&F['15'].long_unwinding);
  const asof=(F['60']&&F['60'].as_of)||(F['15']&&F['15'].as_of)||'—';
  box.innerHTML=`<h4>Order flow <span class="rng">· OI vs price, through ${esc(asof)}</span></h4>`+
    flowRow('60m',F['60'])+flowRow('15m',F['15'])+
    `<div class="sigs"><span class="sig ${cov?'on-cov':''}">Short covering${cov?' · live':''}</span>`+
    `<span class="sig ${unw?'on-unw':''}">Long unwinding${unw?' · live':''}</span></div>`;
}

// ---------- order flow regime through the day ----------
const RNAME={LB:'Long buildup',SC:'Short covering',SB:'Short buildup',LU:'Long unwinding',F:'Flat'};
const RCOL={LB:'var(--lb)',SC:'var(--sc)',SB:'var(--sb)',LU:'var(--lu)',F:'transparent'};
function flowHead(host, F){
  if(!host) return;
  if(!F){ host.innerHTML='<span class="meta">no open-interest data yet</span>'; return; }
  const sg=v=>(v>0?'+':'')+v.toLocaleString();
  const tot=Object.values(F.mins).reduce((a,b)=>a+b,0)||1;
  host.innerHTML=['LB','SC','SB','LU'].map(k=>
    `<span class="chip${F.now===k?' now':''}" style="${F.now===k?`color:${RCOL[k]}`:''}"><i style="background:${RCOL[k]}"></i>${RNAME[k]} <b>${F.mins[k]}m</b> <span class="meta">${Math.round(F.mins[k]/tot*100)}%</span></span>`).join('')+
    `<span class="meta">now: <b>${RNAME[F.now]}</b> · through ${esc(F.as_of)} · OI ${sg(F.oi_chg)} since open · price ${sg(F.px_chg)}</span>`;
}
function drawFlow(host, F, clipHour){
  if(!host) return;
  const W=host.clientWidth||900, padL=68, padR=12, top=22;
  const priceH=W<520?200:250, gap=14, oiH=W<520?70:90, axisH=26, H=top+priceH+gap+oiH+axisH;
  if(!F||!F.bars.length){mount(host,W,90,`<text class="t-ax" x="${W/2}" y="48" text-anchor="middle">no data yet</text>`);return;}
  let bars=F.bars, pts=(F.px&&F.px.length)?F.px:F.bars.map(b=>({t:b.t,c:b.c,oi:b.oi})), xlo=OPEN, xhi=CLOSE;
  if(clipHour){ xhi=Math.min(CLOSE, mins(pts[pts.length-1].t)+5); xlo=Math.max(OPEN, xhi-60); }
  bars=bars.filter(b=>mins(b.until)>xlo && mins(b.t)<xhi); pts=pts.filter(p=>mins(p.t)+5>xlo && mins(p.t)<xhi);
  if(!pts.length){mount(host,W,90,`<text class="t-ax" x="${W/2}" y="48" text-anchor="middle">no data this hour</text>`);return;}
  const xm=m=>padL+(Math.max(xlo,Math.min(xhi,m))-xlo)/(xhi-xlo)*(W-padL-padR);
  let lo=Math.min(...pts.map(p=>p.c)), hi=Math.max(...pts.map(p=>p.c)); const pv=(hi-lo)*0.08||5; lo-=pv; hi+=pv;
  const y=v=>top+(hi-v)/(hi-lo)*priceH;
  let olo=Math.min(...pts.map(p=>p.oi)), ohi=Math.max(...pts.map(p=>p.oi)); const ov=(ohi-olo)*0.1||1; olo-=ov; ohi+=ov;
  const o0=top+priceH+gap, yo=v=>o0+(ohi-v)/(ohi-olo)*oiH, bottom=o0+oiH;
  let s='';
  const mag=Math.pow(10,Math.floor(Math.log10(hi-lo))), rr=(hi-lo)/mag, gs=mag*(rr>5?1:rr>2?0.5:0.2);
  for(let t=Math.ceil(lo/gs)*gs;t<=hi;t+=gs)
    s+=`<line class="g-grid" x1="${padL}" x2="${W-padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`+
       `<text class="t-ax" x="${padL-7}" y="${(y(t)+4).toFixed(1)}" text-anchor="end">${Math.round(t).toLocaleString()}</text>`;
  s+=`<text class="t-ax" x="${padL-7}" y="${o0+10}" text-anchor="end">OI</text>`+
     `<line class="g-grid" x1="${padL}" x2="${W-padR}" y1="${bottom}" y2="${bottom}"/>`;
  const sg=v=>(v>0?'+':'')+v.toLocaleString();
  const SHORT={LB:'Long buildup',SC:'Short covering',SB:'Short buildup',LU:'Long unwinding',F:'Flat'};
  for(const b of bars){                                    // one shaded block per trading hour
    const x0=xm(mins(b.t)), xEnd=xm(mins(b.until)), xDone=xm(mins(b.t)+b.done);
    const col=b.r==='F'?'var(--line)':RCOL[b.r], op=b.r==='F'?0.15:(0.14+0.36*b.w);
    const tip=`${b.t}–${b.until}${b.live?' · <i>running</i>':''} · <b>${RNAME[b.r]}</b><br>price ${f1(b.c)} (${sg(b.dp)}, ${sg(b.dp_pct)}%)<br>OI ${b.oi.toLocaleString()} (${sg(b.doi)}, ${sg(b.doi_pct)}%)`;
    s+=`<g class="mark" data-tip="${esc(tip)}">`+
       `<rect x="${x0.toFixed(1)}" y="${top}" width="${Math.max(1,xDone-x0).toFixed(1)}" height="${(bottom-top).toFixed(1)}" fill="${col}" fill-opacity="${op.toFixed(2)}"/>`+
       (b.live&&xEnd>xDone?`<rect x="${xDone.toFixed(1)}" y="${top}" width="${(xEnd-xDone).toFixed(1)}" height="${(bottom-top).toFixed(1)}" fill="${col}" fill-opacity="0.05" stroke="${col}" stroke-opacity=".35" stroke-dasharray="3 3"/>`:'')+
       `<line x1="${x0.toFixed(1)}" x2="${x0.toFixed(1)}" y1="${top}" y2="${bottom}" stroke="var(--surface)" stroke-width="2"/>`;
    if(xEnd-x0>58) s+=`<text class="t-ax" x="${((x0+xEnd)/2).toFixed(1)}" y="${top-7}" text-anchor="middle" style="fill:${b.r==='F'?'var(--muted)':col};font-weight:600">${SHORT[b.r]}${b.live?' ·':''}</text>`;
    s+=`</g>`;
  }
  const tstep=(xhi-xlo)<=75?15:60;
  for(let tm=Math.ceil((xlo-15)/tstep)*tstep+15; tm<=xhi; tm+=tstep){ if(tm<xlo) continue;
    s+=`<text class="t-ax" x="${xm(tm)}" y="${bottom+18}" text-anchor="middle">${hhmmOf(tm)}</text>`; }
  const px=pts.map(p=>`${xm(mins(p.t)+5).toFixed(1)},${y(p.c).toFixed(1)}`).join(' ');
  s+=`<polyline points="${px}" fill="none" stroke="var(--act)" stroke-width="1.7" stroke-linejoin="round" pointer-events="none"/>`;
  const op2=pts.map(p=>`${xm(mins(p.t)+5).toFixed(1)},${yo(p.oi).toFixed(1)}`).join(' ');
  s+=`<polyline points="${op2}" fill="none" stroke="var(--ink-2)" stroke-width="1.4" stroke-linejoin="round" pointer-events="none"/>`;
  const L=pts[pts.length-1], LB=bars[bars.length-1];
  s+=`<circle cx="${xm(mins(L.t)+5).toFixed(1)}" cy="${y(L.c).toFixed(1)}" r="3.5" fill="${!LB||LB.r==='F'?'var(--act)':RCOL[LB.r]}" stroke="var(--surface)" stroke-width="1.2"/>`;
  mount(host,W,H,s);
}
function hhmmOf(n){return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}

const charts={
  'c-60':()=>drawDay($('c-60'),D.path,D.marks60,opt.hour),  'd-60':()=>drawDir($('d-60'),D.marks60),
  'c-15':()=>drawDay($('c-15'),D.path,D.marks15,opt.hour),  'd-15':()=>drawDir($('d-15'),D.marks15),
  'f-today':()=>drawFlow($('f-today'),D.flowpath,opt.hour), 'f-ref':()=>drawFlow($('f-ref'),D.refflowpath),
  'c-r60':()=>drawDay($('c-r60'),D.refpath,D.refmarks60), 'd-r60':()=>drawDir($('d-r60'),D.refmarks60),
  'c-r15':()=>drawDay($('c-r15'),D.refpath,D.refmarks15), 'd-r15':()=>drawDir($('d-r15'),D.refmarks15)};
const redraw=()=>{ if(D) Object.values(charts).forEach(f=>f()); };

// ---------- controls ----------
const bl=$('opt-line'), bc=$('opt-candle'), cv=$('opt-vol'), ch=$('opt-hour');
const sync=()=>{bl.setAttribute('aria-pressed',opt.style==='line');bc.setAttribute('aria-pressed',opt.style==='candle');cv.checked=opt.vol;ch.checked=opt.hour;};
bl.addEventListener('click',()=>{opt.style='line';store.set('nlb.style','line');sync();redraw();});
bc.addEventListener('click',()=>{opt.style='candle';store.set('nlb.style','candle');sync();redraw();});
cv.addEventListener('change',()=>{opt.vol=cv.checked;store.set('nlb.vol',cv.checked?'1':'0');redraw();});
ch.addEventListener('change',()=>{opt.hour=ch.checked;store.set('nlb.hour',ch.checked?'1':'0');redraw();});
const cu=$('opt-upd'); if(cu){cu.checked=opt.upd; cu.addEventListener('change',()=>{opt.upd=cu.checked;store.set('nlb.upd',cu.checked?'1':'0');redraw();});}
sync();

const lw={};
Object.keys(charts).forEach(id=>{const el=$(id);
 new ResizeObserver(()=>{const w=el.clientWidth;if(w&&lw[id]!==w){lw[id]=w;charts[id]();}}).observe(el);});

const tip=$('tip');let cur=null;
document.addEventListener('pointermove',e=>{const m=e.target.closest&&e.target.closest('.mark[data-tip]');
 if(m!==cur){cur=m;if(m){tip.innerHTML=m.dataset.tip;tip.hidden=false;}else tip.hidden=true;}
 if(cur){const r=tip.getBoundingClientRect();let lx=e.clientX+14,ly=e.clientY+14;
  if(lx+r.width>innerWidth-8)lx=e.clientX-r.width-14;if(ly+r.height>innerHeight-8)ly=e.clientY-r.height-14;
  tip.style.left=Math.max(8,lx)+'px';tip.style.top=Math.max(8,ly)+'px';}});

// ---------- data load + live refresh ----------
async function load(){
  try{
    const res=await fetch('data.json?_='+Date.now(),{cache:'no-store'});
    if(!res.ok) throw new Error(res.status);
    D=await res.json();
    render();
    $('refreshed').textContent='updated '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  }catch(e){
    $('refreshed').textContent='data unavailable — retrying';
  }
}
// re-read every 60s so the live price path tracks the market minute-by-minute
function schedule(){ setTimeout(()=>{load();schedule();}, 60*1000); }
load(); schedule();
})();
