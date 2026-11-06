// NIFTY50 model monitor: renders data.json (nifty50_bliss/web/monitor/build.py). Every forecast is a move from its
// anchor in % (row arrays: [q10, q25, q50, q75, q90, actual]); points = the move at the row's anchor.
(()=>{
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const f0=v=>v==null?'—':Math.round(v).toLocaleString('en-IN');
const f1=v=>v==null?'—':v.toLocaleString('en-IN',{minimumFractionDigits:1,maximumFractionDigits:1});
const p2=v=>v==null?'—':`${v.toFixed(2)}%`;
const sg2=v=>v==null?'—':`${v>=0?'+':'−'}${Math.abs(v).toFixed(2)}%`;
const pct=v=>v==null?'—':`${Math.round(v*100)}%`;
const mount=(host,W,H,s)=>host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">${s}</svg>`;
const KN={hi:'high',lo:'low',rg:'range'}, KC={hi:'var(--hi)',lo:'var(--lo)',rg:'var(--news)'};
const dmy=t=>new Date(t.slice(0,10)+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'});
let D=null;
const store=(k,v)=>{try{localStorage.setItem('monitor.'+k,v);}catch(e){}};
const load_=(k,d)=>{try{return localStorage.getItem('monitor.'+k)||d;}catch(e){return d;}};
let K=load_('k','hi'), HZ=load_('h','day'), SEL={day:load_('sel.day','stack_qra_q+dtaci'), hour:load_('sel.hour','dvine_1h')};
// date range (sessions, inclusive): every section reads only the forecasts in it; '' = not set yet (since frozen)
let FROM=load_('from',''), TO=load_('to',''), RNG=load_('rng','frozen'), DSEL=null;
const inR=t=>{const d=t.slice(0,10); return d>=FROM&&d<=TO;};
function allDays(){
  const s=new Set((D.direction&&D.direction.days||[]).map(x=>x.t));
  for(const m of D.models) for(const r of m.rows) s.add(r.t.slice(0,10));
  return [...s].filter(d=>d<=D.last_session).sort();             // no session past the last one with an outcome
}
const frozenFirst=()=>{const m=D.models.find(x=>x.kind==='day'); return m&&m.rows.length?m.rows[0].t.slice(0,10):allDays()[0];};
function setRange(r){
  const A=allDays(), last=A[A.length-1]; RNG=r; store('rng',r);
  if(r==='all') FROM=A[0]; else if(r==='frozen') FROM=frozenFirst(); else FROM=A[Math.max(0,A.length-(+r))];
  TO=last; store('from',FROM); store('to',TO);
}
function syncDates(){
  const A=allDays(); if(!A.length) return;
  if(!FROM||!TO||RNG!=='custom') setRange(RNG==='custom'?'frozen':RNG);
  for(const [id,v] of [['d-from',FROM],['d-to',TO]]){const e=$(id); e.min=A[0]; e.max=A[A.length-1]; e.value=v;}
  for(const b of document.querySelectorAll('button[data-r]')) b.setAttribute('aria-pressed',b.dataset.r===RNG);
}
const rangeLab=()=>`${dmy(FROM)} – ${dmy(TO)}`;
// the scoreboard numbers of build.py scores(), on the rows in the range
function scoreRows(rows,k){
  const x=rows.filter(r=>r[k][5]!=null&&r[k][2]!=null); if(!x.length) return null;
  const mean=a=>a.reduce((p,v)=>p+v,0)/a.length, e=x.map(r=>r[k][5]-r[k][2]);
  const s={n:x.length, mae:mean(e.map(Math.abs)), mae_pts:mean(x.map((r,i)=>Math.abs(e[i])*r.a/100)), bias:mean(e)};
  if(x.every(r=>r[k].slice(0,5).every(v=>v!=null))){
    const y=x.map(r=>r[k][5]), Q=j=>x.map(r=>r[k][j]), T=[.1,.25,.5,.75,.9];
    s.in80=mean(x.map(r=>r[k][5]>=r[k][0]&&r[k][5]<=r[k][4]?1:0)); s.in50=mean(x.map(r=>r[k][5]>=r[k][1]&&r[k][5]<=r[k][3]?1:0));
    s.above90=mean(x.map(r=>r[k][5]>r[k][4]?1:0)); s.below10=mean(x.map(r=>r[k][5]<r[k][0]?1:0));
    s.pinball=mean(T.map((t,j)=>mean(Q(j).map((q,i)=>Math.max(t*(y[i]-q),(t-1)*(y[i]-q))))));
  }
  return s;
}

// level in points of a move x (%) at anchor a
const lvl=(k,a,x)=>x==null||a==null?null:k==='hi'?a*(1+x/100):k==='lo'?a*(1-x/100):a*x/100;
const hasBand=r=>r[0]!=null&&r[4]!=null;
const inside=(r,lo,hi)=>r[5]!=null&&r[lo]!=null&&r[hi]!=null?(r[5]>=r[lo]&&r[5]<=r[hi]):null;

function facts(){
  const m=D.manifest, day=D.models.find(x=>x.kind==='day'), n=day?day.rows.filter(r=>r.hi[5]!=null).length:0;
  const first=day&&day.rows.length?day.rows[0].t:null;
  $('facts').innerHTML=[
    ['Trained on',`sessions to ${dmy(D.train_end)}`,'then frozen: no refits'],
    ['Out of sample since',first?dmy(first):'—',`${n} sessions with an outcome`],
    ['Latest session',dmy(D.last_session),'added after the close'],
    ['Updated',D.generated.slice(11),D.generated.slice(0,10)]]
    .map(([t,b,s])=>`<div><dt>${t}</dt><dd><b>${b}</b>${s}</dd></div>`).join('');
  $('gen').textContent=`data ${D.generated} IST`+(m?` · models saved ${m.made_at}`:'');
}

function board(){
  const M=D.models.filter(m=>m.kind===HZ);
  $('h-board').textContent=`${HZ==='day'?'Day':'Hour'} forecasts · the ${KN[K]} · ${rangeLab()}`;
  let h=`<thead><tr><th>Model</th><th>Sessions</th><th>Within 80%</th><th class="ref">Jan–cut-off</th><th>Within 50%</th><th>Above 90%</th><th>Below 10%</th><th>Median error</th><th class="ref">Jan–cut-off</th><th>in points</th><th>Bias</th><th>Pinball</th><th class="ref">Jan–cut-off</th></tr></thead><tbody>`;
  let g=null;
  for(const m of M){
    if(m.group!==g){g=m.group; h+=`<tr class="grp"><td colspan="13">${esc(g)}</td></tr>`;}
    const s=scoreRows(m.rows.filter(x=>inR(x.t)),K), r=m.ref&&m.ref[K];
    if(!s){h+=`<tr data-id="${esc(m.id)}" tabindex="0"><td>${esc(m.name)}</td><td colspan="12" class="na">no ${KN[K]} forecast in these dates</td></tr>`;continue;}
    const b=s.in80!=null;
    h+=`<tr data-id="${esc(m.id)}" tabindex="0" aria-selected="${m.id===SEL[HZ]}"><td>${esc(m.name)}</td><td>${s.n}</td>`+
      (b?`<td>${pct(s.in80)}</td><td class="ref">${r&&r.in80!=null?pct(r.in80):'—'}</td><td>${pct(s.in50)}</td><td>${pct(s.above90)}</td><td>${pct(s.below10)}</td>`
        :`<td class="na" colspan="5">median only (median high + median low)</td>`)+
      `<td>${p2(s.mae)}</td><td class="ref">${r?p2(r.mae):'—'}</td><td>${f0(s.mae_pts)}</td><td>${sg2(s.bias)}</td>`+
      (b?`<td>${s.pinball.toFixed(3)}</td><td class="ref">${r&&r.pinball!=null?r.pinball.toFixed(3):'—'}</td>`:`<td class="na">—</td><td class="na">—</td>`)+`</tr>`;
  }
  $('t-board').innerHTML=h+'</tbody>';
  $('n-board').textContent=`Bias: the average of actual minus median (positive: the ${KN[K]} came out ${K==='lo'?'further below the anchor':'bigger'} than the median forecast). Pinball: the average quantile loss over the five levels, in %; lower means closer. `+
    `Reference: walk-forward forecasts ${dmy(D.ref_from)} to ${dmy(D.train_end)}; the news-adjusted versions have no reference (they were issued live only from November).`;
  for(const tr of $('t-board').querySelectorAll('tr[data-id]')){
    const go=()=>{SEL[HZ]=tr.dataset.id; store('sel.'+HZ,tr.dataset.id); render(); $('series').scrollIntoView({behavior:'smooth',block:'start'});};
    tr.addEventListener('click',go); tr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});
  }
}

function latest(){
  const M=D.models.filter(m=>m.kind===HZ), inDays=allDays().filter(d=>d>=FROM&&d<=TO), day=inDays.length?inDays[inDays.length-1]:D.last_session;
  $('h-latest').textContent=`${dmy(day)} · the ${KN[K]}${HZ==='hour'?', hour by hour':''}`;
  let h=`<thead><tr><th>Model</th>${HZ==='hour'?'<th>Issued</th>':''}<th>Anchor</th><th>10%</th><th>Median</th><th>90%</th><th>Actual</th><th class="c">80%</th><th class="c">50%</th><th>Miss</th></tr></thead><tbody>`;
  const ck=v=>v==null?'<td class="c na">—</td>':`<td class="c ${v?'y':'n'}">${v?'✓':'✗'}</td>`;
  for(const m of M){
    for(const row of m.rows.filter(r=>r.t.startsWith(day))){
      const r=row[K], a=row.a, P=x=>f0(lvl(K,a,x));
      h+=`<tr><td>${esc(m.name)}</td>${HZ==='hour'?`<td>${row.t.slice(11)}</td>`:''}<td>${f1(a)}</td><td>${P(r[0])}</td><td>${P(r[2])}</td><td>${P(r[4])}</td><td>${P(r[5])}</td>${ck(inside(r,0,4))}${ck(inside(r,1,3))}`+
        `<td>${r[5]!=null&&r[2]!=null?`${(r[5]-r[2])>=0?'+':'−'}${f0(Math.abs((r[5]-r[2])*a/100))} pts`:'—'}</td></tr>`;
    }
  }
  $('t-latest').innerHTML=h+'</tbody>';
}

function series(){
  const M=D.models.filter(m=>m.kind===HZ);
  if(!M.find(m=>m.id===SEL[HZ])) SEL[HZ]=M[0]&&M[0].id;
  const m=M.find(x=>x.id===SEL[HZ]); if(!m) return;
  $('sel').innerHTML=M.map(x=>`<option value="${esc(x.id)}"${x.id===m.id?' selected':''}>${esc(x.group)} — ${esc(x.name)}</option>`).join('');
  $('h-series').textContent=`${m.name} · the ${KN[K]}`;
  $('p-series').textContent=`${m.group}. Each column is one ${HZ==='day'?'session':'hourly issue'} from ${rangeLab()}: the band forecast for the ${KN[K]}, in % from the anchor, and the dot is what happened.`;
  const R=m.rows.filter(r=>inR(r.t)).map(r=>({t:r.t,a:r.a,v:r[K]})).filter(r=>r.v[2]!=null), s=scoreRows(m.rows.filter(r=>inR(r.t)),K), ref=m.ref&&m.ref[K];
  $('acc').innerHTML=s?[
    s.in80!=null?['Within the 80% band',pct(s.in80),`of ${s.n} · Jan–cut-off ${ref&&ref.in80!=null?pct(ref.in80):'—'} · calibrated: 80%`]:['Within the 80% band','—','median only for this model'],
    s.in50!=null?['Within the 50% band',pct(s.in50),`Jan–cut-off ${ref&&ref.in50!=null?pct(ref.in50):'—'} · calibrated: 50%`]:['Within the 50% band','—',''],
    ['Median error',p2(s.mae),`≈ ${f0(s.mae_pts)} pts · bias ${sg2(s.bias)} · Jan–cut-off ${ref?p2(ref.mae):'—'}`]]
    .map(([t,b,p])=>`<div class="acc-t"><span>${t}</span><div class="acc-v"><b style="color:${KC[K]}">${b}</b></div><p>${p}</p></div>`).join(''):'';
  if(!R.length){$('c-series').innerHTML='<p class="tbl-note">No forecast of this model in these dates (models are scored from the freeze on).</p>';$('c-run').innerHTML='';$('t-series').innerHTML='';return;}
  // band chart
  const host=$('c-series'), W=host.clientWidth||900, padL=52, padR=12, top=12, PH=W<520?220:300;
  let lo=Infinity, hi=-Infinity;
  for(const r of R) for(const x of r.v) if(x!=null){lo=Math.min(lo,x);hi=Math.max(hi,x);}
  const pv=(hi-lo)*.06||.1; lo-=pv; hi+=pv;
  const y=v=>top+(hi-v)/(hi-lo)*PH, cw=(W-padL-padR)/R.length, xc=i=>padL+cw*(i+.5), bw=Math.max(2,Math.min(14,cw*.6));
  const mag=Math.pow(10,Math.floor(Math.log10(hi-lo))), rr=(hi-lo)/mag, step=mag*(rr>5?1:rr>2?.5:.2);
  let g='', col=KC[K];
  for(let t=Math.ceil(lo/step)*step;t<=hi;t+=step) g+=`<line class="g-grid" x1="${padL}" x2="${W-padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="t-ax" x="${padL-7}" y="${(y(t)+4).toFixed(1)}" text-anchor="end">${(+t.toFixed(2))}%</text>`;
  if(lo<0&&hi>0) g+=`<line x1="${padL}" x2="${W-padR}" y1="${y(0)}" y2="${y(0)}" stroke="var(--axis)"/>`;
  const nDays=new Set(R.map(r=>r.t.slice(0,10))).size, every=Math.max(1,Math.ceil(nDays/(W<520?5:10)));
  let lastDay='', di=-1;
  R.forEach((r,i)=>{
    const x=xc(i), v=r.v, d=r.t.slice(0,10);
    if(d!==lastDay){
      di++;
      if(HZ==='hour'&&i>0) g+=`<line x1="${(x-cw/2).toFixed(1)}" x2="${(x-cw/2).toFixed(1)}" y1="${top}" y2="${top+PH}" stroke="var(--line)"/>`;
      if(di%every===0) g+=`<text class="t-ax" x="${HZ==='hour'?x-cw/2+2:x}" y="${top+PH+16}" text-anchor="${HZ==='hour'?'start':'middle'}">${dmy(r.t)}</text>`;
    }
    lastDay=d;
    const rect=(a,c,op)=>a==null||c==null?'':`<rect x="${(x-bw/2).toFixed(1)}" y="${y(Math.max(a,c)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,Math.abs(y(a)-y(c))).toFixed(1)}" fill="${col}" fill-opacity="${op}"/>`;
    const P=q=>q==null?'—':`${q.toFixed(2)}% (${f0(lvl(K,r.a,q))})`;
    const tip=`${r.t}${HZ==='hour'?' issue':''} · anchor ${f1(r.a)}<br>${KN[K]}: actual ${P(v[5])}<br>median ${P(v[2])}`+(hasBand(v)?`<br>50%: ${P(v[1])} – ${P(v[3])}<br>80%: ${P(v[0])} – ${P(v[4])}`:'');
    const in8=inside(v,0,4);
    g+=`<g data-tip="${esc(tip)}">`+rect(v[0],v[4],.2)+rect(v[1],v[3],.42)+
      `<line x1="${(x-bw/2-1).toFixed(1)}" x2="${(x+bw/2+1).toFixed(1)}" y1="${y(v[2]).toFixed(1)}" y2="${y(v[2]).toFixed(1)}" stroke="${col}" stroke-width="2"/>`+
      `<rect x="${(x-cw/2).toFixed(1)}" y="${top}" width="${cw.toFixed(1)}" height="${PH}" fill="transparent"/></g>`;
    if(v[5]!=null) g+=`<circle cx="${x.toFixed(1)}" cy="${y(v[5]).toFixed(1)}" r="${cw<6?2.4:3.4}" fill="${in8?'var(--ok)':in8===false?'var(--surface)':'var(--act)'}" stroke="${in8?'var(--surface)':col}" stroke-width="${in8===false?2:1}" pointer-events="none"/>`;
  });
  mount(host,W,top+PH+24,g);
  // running share inside the 80% band (or the running median error, for a median-only forecast)
  const run=$('c-run'), done=R.filter(r=>r.v[5]!=null), band=hasBand(R[0].v);
  if(done.length<2){run.innerHTML='';}
  else{
    const RH=W<520?120:150, t2=22; let n=0, k=0, e=0; const pts=[];
    done.forEach((r,i)=>{n++; if(band) k+=inside(r.v,0,4)?1:0; else e+=Math.abs(r.v[5]-r.v[2]); pts.push(band?k/n:e/n);});
    const vmax=band?1:Math.max(...pts, ref?ref.mae:0)*1.15, yy=v=>t2+(1-v/vmax)*RH, xx=i=>padL+(W-padL-padR)*(done.length===1?.5:i/(done.length-1));
    let s=`<text class="t-ax" x="${padL}" y="12">${band?'Running share within the 80% band':'Running median error'}</text>`;
    for(const t of band?[0,.5,.8,1]:[0,vmax/2]) s+=`<line class="g-grid" x1="${padL}" x2="${W-padR}" y1="${yy(t)}" y2="${yy(t)}"/><text class="t-ax" x="${padL-7}" y="${yy(t)+4}" text-anchor="end">${band?Math.round(t*100)+'%':t.toFixed(2)+'%'}</text>`;
    const rv=band?(ref&&ref.in80):(ref&&ref.mae);
    if(rv!=null) s+=`<line x1="${padL}" x2="${W-padR}" y1="${yy(rv)}" y2="${yy(rv)}" stroke="var(--muted)" stroke-dasharray="4 4"/><text class="t-ax" x="${W-padR}" y="${yy(rv)-5}" text-anchor="end">Jan–cut-off ${band?pct(rv):p2(rv)}</text>`;
    s+=`<path d="${pts.map((v,i)=>`${i?'L':'M'}${xx(i).toFixed(1)},${yy(v).toFixed(1)}`).join('')}" fill="none" stroke="${col}" stroke-width="2"/>`;
    s+=pts.map((v,i)=>`<circle cx="${xx(i).toFixed(1)}" cy="${yy(v).toFixed(1)}" r="6" fill="transparent" data-tip="${esc(`${done[i].t} · after ${i+1}: ${band?pct(v):p2(v)}`)}"/>`).join('');
    mount(run,W,t2+RH+8,s);
  }
  price(R, W, padL, padR, col);
  $('cap-series').textContent=hasBand(R[0].v)?`The light bar is the 80% band (10% to 90% level), the darker part the 50% band, the tick the median. A green dot landed inside the 80% band; a ring landed outside it. Below: the share of ${HZ==='day'?'sessions':'hours'} so far inside the 80% band, against the reference period (dashed).`
    :`This model forecasts the high and the low separately, so its range is the median high plus the median low, with no band. Below: the running median error against the reference period (dashed).`;
  const ck=v=>v==null?'<td class="c na">—</td>':`<td class="c ${v?'y':'n'}">${v?'✓':'✗'}</td>`;
  $('t-series').innerHTML=`<thead><tr><th>${HZ==='day'?'Session':'Issued'}</th><th>Anchor</th><th>10%</th><th>25%</th><th>Median</th><th>75%</th><th>90%</th><th>Actual</th><th class="c">80%</th><th class="c">50%</th><th>Actual − median</th></tr></thead><tbody>`+
    R.slice().reverse().map(r=>{const v=r.v,P=q=>q==null?'<td class="na">—</td>':`<td>${f0(lvl(K,r.a,q))}</td>`;
      return `<tr><td>${r.t}</td><td>${f1(r.a)}</td>${P(v[0])}${P(v[1])}${P(v[2])}${P(v[3])}${P(v[4])}${P(v[5])}${ck(inside(v,0,4))}${ck(inside(v,1,3))}<td>${v[5]==null?'—':`${sg2(v[5]-v[2])} · ${f0((v[5]-v[2])*r.a/100)} pts`}</td></tr>`;}).join('')+'</tbody>';
}

// actual price vs the predicted median price, in index points (range: high minus low in points), with the 80% band;
// below it the miss (actual - median) per session
function price(R, W, padL, padR, col){
  const host=$('c-price'), P=R.map(r=>({t:r.t, a:lvl(K,r.a,r.v[5]), m:lvl(K,r.a,r.v[2]), lo:lvl(K,r.a,r.v[0]), hi:lvl(K,r.a,r.v[4])}));
  $('h-price').textContent=`Actual ${KN[K]} against the predicted median ${KN[K]}, in index points`;
  const done=P.filter(p=>p.a!=null&&p.m!=null);
  if(!done.length){host.innerHTML='';$('acc-price').innerHTML='';return;}
  const mean=a=>a.reduce((s,v)=>s+v,0)/a.length, e=done.map(p=>p.a-p.m);
  const ca=done.map(p=>p.a), cm=done.map(p=>p.m), ma=mean(ca), mm=mean(cm);
  const cov=mean(ca.map((v,i)=>(v-ma)*(cm[i]-mm))), sd=a=>Math.sqrt(mean(a.map(v=>(v-mean(a))**2)));
  const corr=done.length>2&&sd(ca)>0&&sd(cm)>0?cov/(sd(ca)*sd(cm)):null;
  $('acc-price').innerHTML=[['Average miss',`${f0(mean(e.map(Math.abs)))} pts`,`actual vs median, ${done.length} ${HZ==='day'?'sessions':'hours'}`],
    ['Bias',`${mean(e)>=0?'+':'−'}${f0(Math.abs(mean(e)))} pts`,`average actual minus median`],
    ['RMSE',`${f0(Math.sqrt(mean(e.map(v=>v*v))))} pts`,K==='rg'?`correlation ${corr==null?'—':corr.toFixed(2)}`:'in points of the index']]
    .map(([t,b,p])=>`<div class="acc-t"><span>${t}</span><div class="acc-v"><b style="color:${col}">${b}</b></div><p>${p}</p></div>`).join('');
  const top=12, PH=W<520?200:260, EH=70, gap=26;
  let lo=Infinity, hi=-Infinity;
  for(const p of P) for(const v of [p.a,p.m,p.lo,p.hi]) if(v!=null){lo=Math.min(lo,v);hi=Math.max(hi,v);}
  const pv=(hi-lo)*.05||5; lo-=pv; hi+=pv;
  const y=v=>top+(hi-v)/(hi-lo)*PH, n=P.length, xx=i=>padL+(W-padL-padR)*(n===1?.5:i/(n-1));
  const mag=Math.pow(10,Math.floor(Math.log10(hi-lo))), rr=(hi-lo)/mag, step=mag*(rr>5?1:rr>2?.5:.2);
  let g='';
  for(let t=Math.ceil(lo/step)*step;t<=hi;t+=step) g+=`<line class="g-grid" x1="${padL}" x2="${W-padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="t-ax" x="${padL-7}" y="${(y(t)+4).toFixed(1)}" text-anchor="end">${f0(t)}</text>`;
  const B=P.map((p,i)=>[i,p]).filter(([,p])=>p.lo!=null&&p.hi!=null);
  if(B.length>1) g+=`<path d="M${B.map(([i,p])=>`${xx(i).toFixed(1)},${y(p.hi).toFixed(1)}`).join('L')}L${B.slice().reverse().map(([i,p])=>`${xx(i).toFixed(1)},${y(p.lo).toFixed(1)}`).join('L')}Z" fill="${col}" fill-opacity=".16"/>`;
  const line=(key,stroke,w,dash='')=>{let d='',pen=false; P.forEach((p,i)=>{if(p[key]==null){pen=false;return;} d+=`${pen?'L':'M'}${xx(i).toFixed(1)},${y(p[key]).toFixed(1)}`; pen=true;}); return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" ${dash}/>`;};
  g+=line('m',col,2)+line('a','var(--ink-2)',1.6);
  const every=Math.max(1,Math.ceil(n/(W<520?5:10))); let lastD='', k=-1;
  P.forEach((p,i)=>{const d=p.t.slice(0,10); if(d!==lastD){k++; if(k%every===0) g+=`<text class="t-ax" x="${xx(i).toFixed(1)}" y="${top+PH+15}" text-anchor="middle">${dmy(p.t)}</text>`;} lastD=d;
    if(p.a!=null) g+=`<circle cx="${xx(i).toFixed(1)}" cy="${y(p.a).toFixed(1)}" r="${n>120?1.6:2.6}" fill="var(--ink-2)"/>`;
    const tip=`${p.t} · ${KN[K]}<br>actual ${f1(p.a)}<br>predicted median ${f1(p.m)}`+(p.lo!=null?`<br>80% band ${f1(Math.min(p.lo,p.hi))} – ${f1(Math.max(p.lo,p.hi))}`:'')+(p.a!=null&&p.m!=null?`<br>miss ${p.a-p.m>=0?'+':'−'}${f0(Math.abs(p.a-p.m))} pts`:'');
    const w=(W-padL-padR)/Math.max(1,n-1); g+=`<rect x="${(xx(i)-w/2).toFixed(1)}" y="${top}" width="${w.toFixed(1)}" height="${PH+gap+EH}" fill="transparent" data-tip="${esc(tip)}"/>`;});
  // miss strip
  const t2=top+PH+gap, em=Math.max(...e.map(Math.abs))||1, ye=v=>t2+EH/2-v/em*(EH/2-2);
  g+=`<line x1="${padL}" x2="${W-padR}" y1="${ye(0)}" y2="${ye(0)}" stroke="var(--axis)"/><text class="t-ax" x="${padL-7}" y="${ye(0)+4}" text-anchor="end">miss</text>`+
     `<text class="t-ax" x="${padL-7}" y="${t2+8}" text-anchor="end">+${f0(em)}</text><text class="t-ax" x="${padL-7}" y="${t2+EH}" text-anchor="end">−${f0(em)}</text>`;
  const bw=Math.max(1.5,Math.min(10,(W-padL-padR)/n*.6));
  P.forEach((p,i)=>{if(p.a==null||p.m==null) return; const v=p.a-p.m;
    g+=`<rect x="${(xx(i)-bw/2).toFixed(1)}" y="${Math.min(ye(v),ye(0)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,Math.abs(ye(v)-ye(0))).toFixed(1)}" fill="${v>=0?'var(--up)':'var(--down)'}" fill-opacity=".8" pointer-events="none"/>`;});
  mount(host,W,t2+EH+6,g);
}

// ---------- direction: the hourly d reading ----------
const DM=['10:15','11:15','12:15','13:15','14:15','15:15'];
// the flag is the calibrated call; its shade darkens with the confidence (0-100, m[7])
const shadePct=c=>Math.round(22+0.78*(c??50));
const shade=(up,c)=>`color-mix(in srgb,var(${up?'--up':'--down'}) ${shadePct(c)}%,var(--surface))`;
const ink=c=>shadePct(c)>=58?'#fff':'var(--ink)';
const right=x=>x[5]==null||x[5]===0?null:(x[5]>0)===(x[1]>0);
function direction(){
  const all=D.direction&&D.direction.days||[], days=all.filter(x=>inR(x.t));
  $('h-dir').textContent=`The d reading every hour · ${rangeLab()}`;
  const M=days.flatMap(x=>x.m.map(m=>({t:x.t,m}))), S=M.filter(x=>right(x.m)!=null);
  const share=a=>a.length?a.filter(x=>right(x.m)).length/a.length:null;
  const up=S.filter(x=>x.m[1]>0), dn=S.filter(x=>x.m[1]<0), upHours=S.filter(x=>x.m[5]>0).length;
  const cb=k=>S.filter(x=>x.m[7]!=null&&x.m[7]>=k);
  $('dir-acc').innerHTML=[
    ['Went the called way',pct(share(S)),`of ${S.length} hours with a full hour after · up hours overall ${S.length?pct(upHours/S.length):'—'}`],
    ['Confidence 50+',pct(share(cb(50))),`${cb(50).length} hours`],
    ['Confidence 80+',pct(share(cb(80))),`${cb(80).length} hours`],
    ['Confidence 90+',pct(share(cb(90))),`${cb(90).length} hours`],
    ['▲ up calls',pct(share(up)),`went up · ${up.length} calls (${S.length?pct(up.length/S.length):'—'} of hours)`],
    ['▼ down calls',pct(share(dn)),`went down · ${dn.length} calls`]]
    .map(([t,b,p])=>`<div class="acc-t"><span>${t}</span><div class="acc-v"><b>${b}</b></div><p>${p}</p></div>`).join('');
  const byH=DM.slice(0,5).map(h=>{const a=S.filter(x=>x.m[0]===h); return [h,a.length,share(a),a.filter(x=>x.m[1]>0).length];});
  $('t-dir-hour').innerHTML=`<thead><tr><th>Reading at</th>${byH.map(b=>`<th class="c">${b[0]}</th>`).join('')}</tr></thead><tbody>`+
    `<tr><td>Went the flagged way</td>${byH.map(b=>`<td class="c">${pct(b[2])}</td>`).join('')}</tr>`+
    `<tr><td>Hours</td>${byH.map(b=>`<td class="c">${b[1]}</td>`).join('')}</tr>`+
    `<tr><td>▲ up flags</td>${byH.map(b=>`<td class="c">${b[1]?pct(b[3]/b[1]):'—'}</td>`).join('')}</tr></tbody>`;
  if(!days.length){$('c-dir-grid').innerHTML='<p class="tbl-note">No readings in these dates.</p>';$('c-dir-day').innerHTML='';$('t-dir').innerHTML='';$('dsel').innerHTML='';return;}
  if(!DSEL||!days.find(x=>x.t===DSEL)) DSEL=days[days.length-1].t;
  // grid: one row per session (newest on top), one column per reading
  const host=$('c-dir-grid'), W=host.clientWidth||900, padL=110, rh=28, cw=(W-padL-8)/DM.length, top=20, rows=days.slice().reverse();
  let g=DM.map((h,j)=>`<text class="t-ax" x="${(padL+cw*(j+.5)).toFixed(1)}" y="13" text-anchor="middle">${h}</text>`).join('');
  rows.forEach((x,i)=>{
    const y0=top+i*rh, sel=x.t===DSEL;
    g+=`<g class="day${sel?' rowsel':''}" data-day="${x.t}"><rect class="bg" x="0" y="${y0}" width="${W}" height="${rh}" fill="transparent"/>`+
       `<text class="t-ax" x="${padL-12}" y="${y0+18}" text-anchor="end" style="font-size:12px">${dmy(x.t)} ${x.t.slice(0,4)}</text>`;
    for(const m of x.m){
      const j=DM.indexOf(m[0]); if(j<0) continue;
      const cx=padL+cw*(j+.5), cy=y0+rh/2, z=9, upm=m[1]>0, ok=right(m), col=shade(upm,m[7]), edge=`var(${upm?'--up':'--down'})`;
      const pts=upm?`${cx-z},${cy+z*.8} ${cx+z},${cy+z*.8} ${cx},${cy-z*.8}`:`${cx-z},${cy-z*.8} ${cx+z},${cy-z*.8} ${cx},${cy+z*.8}`;
      const tip=`${x.t} ${m[0]} · ${upm?'▲ up':'▼ down'}${m[7]!=null?` · confidence ${m[7]}`:''}${m[6]!=null?`<br>P(up next hour) ${(m[6]*100).toFixed(1)}%`:''}<br>d high ${m[2]>=0?'+':''}${m[2].toFixed(2)} · d low ${m[3]>=0?'+':''}${m[3].toFixed(2)}<br>price ${f1(m[4])}`+
        (m[5]==null?'<br>no full hour left in the session':`<br>next hour ${m[5]>=0?'+':'−'}${f1(Math.abs(m[5]))} pts · ${ok?'went the flagged way':'went the other way'}`);
      g+=`<polygon points="${pts}" style="fill:${ok===false?'var(--surface)':col};stroke:${col}" stroke-width="${ok===false?2.4:1}" stroke-linejoin="round" data-tip="${esc(tip)}"/>`;
    }
    g+=`</g>`;
  });
  mount(host,W,top+rows.length*rh+4,g);
  for(const e of host.querySelectorAll('g.day')) e.addEventListener('click',()=>{DSEL=e.dataset.day; direction();});
  $('dsel').innerHTML=rows.map(x=>`<option value="${x.t}"${x.t===DSEL?' selected':''}>${x.t}</option>`).join('');
  dirDay(days.find(x=>x.t===DSEL));
  $('t-dir').innerHTML=`<thead><tr><th>Session</th><th>At</th><th class="c">Flag</th><th>Confidence</th><th>P(up)</th><th>d high</th><th>d low</th><th>Price</th><th>Next hour</th><th class="c">Went that way</th><th>Bands from</th></tr></thead><tbody>`+
    rows.flatMap(x=>x.m.slice().reverse().map(m=>{const ok=right(m);
      return `<tr><td>${x.t}</td><td>${m[0]}</td><td class="c ${m[1]>0?'up':'down'}">${m[1]>0?'▲ up':'▼ down'}</td><td>${m[7]??'—'}</td><td>${m[6]!=null?(m[6]*100).toFixed(1)+'%':'—'}</td><td>${m[2].toFixed(2)}</td><td>${m[3].toFixed(2)}</td><td>${f1(m[4])}</td>`+
        `<td>${m[5]==null?'—':`${m[5]>=0?'+':'−'}${f1(Math.abs(m[5]))}`}</td><td class="c ${ok==null?'na':ok?'y':'n'}">${ok==null?'—':ok?'✓':'✗'}</td><td>${x.vs==='1015'?'10:15 re-issue':'09:15 forecast'}</td></tr>`;})).join('')+'</tbody>';
}
// one session: the 5-minute closes, the open, and the hourly flags
function dirDay(x){
  const host=$('c-dir-day'); if(!x||!x.c.length){host.innerHTML='';return;}
  const W=host.clientWidth||900, padL=64, padR=12, top=14, PH=W<520?200:260;
  const OPEN=555, CLOSE=930, xm=mn=>padL+(mn-OPEN)/(CLOSE-OPEN)*(W-padL-padR), tm=t=>{const[a,b]=t.split(':').map(Number);return a*60+b;};
  const vals=x.c.filter(v=>v!=null).concat([x.o]); let lo=Math.min(...vals), hi=Math.max(...vals); const pv=(hi-lo)*.22||5; lo-=pv; hi+=pv;   // room for the tags
  const y=v=>top+(hi-v)/(hi-lo)*PH, mag=Math.pow(10,Math.floor(Math.log10(hi-lo))), rr=(hi-lo)/mag, step=mag*(rr>5?1:rr>2?.5:.2);
  let g='';
  for(let t=Math.ceil(lo/step)*step;t<=hi;t+=step) g+=`<line class="g-grid" x1="${padL}" x2="${W-padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="t-ax" x="${padL-7}" y="${(y(t)+4).toFixed(1)}" text-anchor="end">${f0(t)}</text>`;
  for(let mn=600;mn<=CLOSE;mn+=60) g+=`<text class="t-ax" x="${xm(mn)}" y="${top+PH+16}" text-anchor="middle">${String(mn/60|0).padStart(2,'0')}:00</text>`;
  g+=`<line x1="${padL}" x2="${W-padR}" y1="${y(x.o)}" y2="${y(x.o)}" stroke="var(--muted)" stroke-dasharray="5 4"/><text class="t-ax" x="${padL+4}" y="${y(x.o)-5}">open ${f1(x.o)}</text>`;
  g+=`<path d="${x.c.map((v,i)=>v==null?'':`${i?'L':'M'}${xm(OPEN+5*(i+1)).toFixed(1)},${y(v).toFixed(1)}`).join('')}" fill="none" stroke="var(--ink-2)" stroke-width="1.6"/>`;
  for(const m of x.m){
    const cx=xm(tm(m[0])), upm=m[1]>0, ok=right(m), col=shade(upm,m[7]), edge=`var(${upm?'--up':'--down'})`, tw=m[7]!=null?66:48, th=20, off=24;
    const y0=y(m[4]), ty=upm?y0-off-th:y0+off, mark=ok==null?'':ok?' ✓':' ✗';
    const tip=`${m[0]} · ${upm?'▲ up':'▼ down'}${m[7]!=null?` · confidence ${m[7]}`:''}${m[6]!=null?` · P(up) ${(m[6]*100).toFixed(1)}%`:''}<br>d high ${m[2].toFixed(2)} · d low ${m[3].toFixed(2)}<br>price ${f1(m[4])}`+(m[5]==null?'':`<br>next hour ${m[5]>=0?'+':'−'}${f1(Math.abs(m[5]))} pts · ${ok?'went the flagged way':'went the other way'}`);
    g+=`<g data-tip="${esc(tip)}"><line x1="${cx}" x2="${cx}" y1="${y0}" y2="${upm?ty+th:ty}" style="stroke:${edge}" stroke-width="1.5" stroke-dasharray="2 2"/><circle cx="${cx}" cy="${y0}" r="3" fill="var(--ink)"/>`+
       `<rect x="${cx-tw/2}" y="${ty.toFixed(1)}" width="${tw}" height="${th}" rx="4" style="fill:${ok===false?'var(--surface)':col};stroke:${edge}" stroke-width="1.8"/>`+
       `<text x="${cx}" y="${(ty+14).toFixed(1)}" text-anchor="middle" style="fill:${ok===false?edge:ink(m[7])};font:700 11px var(--sans)">${upm?'▲ UP':'▼ DN'}${m[7]!=null?' '+m[7]:''}${mark}</text></g>`;
  }
  mount(host,W,top+PH+24,g);
}

function render(){
  if(!D) return;
  document.body.dataset.k=K;
  for(const b of document.querySelectorAll('[data-k]')) if(b.tagName==='BUTTON') b.setAttribute('aria-pressed',b.dataset.k===K);
  for(const b of document.querySelectorAll('[data-h]')) b.setAttribute('aria-pressed',b.dataset.h===HZ);
  syncDates(); facts(); board(); latest(); direction(); series();
}
for(const b of document.querySelectorAll('button[data-k]')) b.addEventListener('click',()=>{K=b.dataset.k; store('k',K); render();});
for(const b of document.querySelectorAll('button[data-h]')) b.addEventListener('click',()=>{HZ=b.dataset.h; store('h',HZ); render();});
$('sel').addEventListener('change',e=>{SEL[HZ]=e.target.value; store('sel.'+HZ,SEL[HZ]); render();});
for(const b of document.querySelectorAll('button[data-r]')) b.addEventListener('click',()=>{setRange(b.dataset.r); render();});
for(const id of ['d-from','d-to']) $(id).addEventListener('change',()=>{
  let a=$('d-from').value, z=$('d-to').value; if(!a||!z) return; if(a>z) [a,z]=[z,a];
  FROM=a; TO=z; RNG='custom'; store('from',a); store('to',z); store('rng','custom'); render();});
$('dsel').addEventListener('change',e=>{DSEL=e.target.value; direction();});

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
load(); setInterval(load,15*60*1000);
})();
