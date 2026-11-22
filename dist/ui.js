/* UI state is separate from the unchanged forecast and allocation engine. */
const names = ['East hostel', 'West hostel', 'Annexe'];
const scenarioNames = ['Morning rush', 'Uncertain readings', 'Late tanker'];
const base = {people:[210,160,85], stock:[1300,3200,2300], error:[0,0,0], hour:6, temp:34, load:3000, delay:0};
const presets = [base, {...base, stock:[3500,3000,1800], error:[1800,500,250]}, {...base, temp:38, delay:3, stock:[600,2800,2100]}];
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('en-IN');
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
const time = hour => String(hour % 24).padStart(2, '0') + ':00';
const sum = values => values.reduce((a,b) => a+b, 0);
let active = 1, state, plan, scores, comparison = null, preview = null, walking = false, previewTrigger = null;

function loadScenario(i) {
  active = i;
  state = structuredClone(presets[i]);
  comparison = null;
  preview = null;
  $('status').textContent = '';
  render();
}

function field(label, key, value, min, max, step=1) {
  return `<label>${label}<input type="number" required data-key="${key}" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
}

function renderConditions() {
  $('controls').innerHTML = `<label>Forecast starts<select data-key="hour">${[6,12,17].map(h => `<option value="${h}" ${state.hour===h?'selected':''}>${time(h)}</option>`).join('')}</select></label>` +
    field('Temperature °C','temp',state.temp,24,40) + field('Tanker load L','load',state.load,0,12000,250) + field('Arrival delay (hours)','delay',state.delay,0,6);
  $('tank-controls').innerHTML = names.map((name,i) => `<fieldset><legend>${name}</legend>${field('Residents','people.'+i,state.people[i],1,1000)}${field('Tank reading L','stock.'+i,state.stock[i],0,CAP)}${field('Reading uncertainty ± L','error.'+i,state.error[i],0,4000)}</fieldset>`).join('');
  $('conditions-summary').textContent = `${state.temp}°C · arrival delay ${state.delay} h · ${fmt(sum(state.people))} residents`;
  $('conditions-feedback').textContent = '';
}

function stockCell(i) {
  const low = Math.max(0,state.stock[i]-state.error[i]);
  const high = Math.min(CAP,state.stock[i]+state.error[i]);
  return `<span class="stock-number">${fmt(state.stock[i])}</span><span class="cell-detail ${state.error[i]?'uncertain':''}">${state.error[i] ? '± '+fmt(state.error[i])+' L sensor uncertainty' : 'No reading uncertainty'}</span><div class="stock-meter" role="img" aria-label="${names[i]}: ${fmt(state.stock[i])} litres reported; possible stock ${fmt(low)} to ${fmt(high)} litres; capacity ${fmt(CAP)} litres"><i style="width:${100*state.stock[i]/CAP}%"></i>${state.error[i]?`<em style="left:${100*low/CAP}%;width:${100*(high-low)/CAP}%"></em>`:''}</div><span class="cell-detail">${fmt(low)}–${fmt(high)} / ${fmt(CAP)} L</span>`;
}

function forecastRange(i) {
  return [Math.max(0,plan.totals[i]+MODEL.lo*state.people[i]), plan.totals[i]+MODEL.hi*state.people[i]];
}

function renderDispatch() {
  $('dispatch-content').innerHTML = `<table id="dispatch-table"><caption hidden>Recommended deliveries for ${scenarioNames[active]}. Forecast range is calibrated demand uncertainty; stock range is sensor uncertainty.</caption><thead><tr><th scope="col">Destination</th><th scope="col">Tank reading L</th><th scope="col">Forecast demand L<span>six hours · calibrated range</span></th><th scope="col">Deliver L</th><th scope="col">Unmet L<span>expected</span></th></tr></thead><tbody>${names.map((name,i) => `<tr><th scope="row">${name}</th><td class="stock-cell">${stockCell(i)}</td><td class="demand-cell"><span class="forecast-number">${fmt(plan.totals[i])}</span><span class="cell-detail">${forecastRange(i).map(fmt).join('–')} L</span></td><td class="delivery-cell"><strong class="delivery">${fmt(plan.best[i])}</strong></td><td class="unmet-cell">${fmt(plan.gaps[i])}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Total</th><td class="total-stock">${fmt(sum(state.stock))}</td><td class="total-demand">${fmt(sum(plan.totals))}</td><td class="total-delivery">${fmt(sum(plan.best))} L</td><td class="total-unmet">${fmt(plan.loss)} L</td></tr></tfoot></table><div class="sheet-note"><p><b>${fmt(sum(plan.best))} L</b> dispatched / ${fmt(state.load)} L available · ${fmt(plan.unused)} L retained</p><p>Capacity ${fmt(CAP)} L per tank · drops of ${UNIT} L</p></div>`;
  renderComparison();
}

function movementExplanation() {
  const changes = plan.best.map((n,i) => n-comparison.best[i]);
  const sources = names.filter((_,i) => changes[i]<0);
  const gains = names.map((name,i) => changes[i]>0 ? `${name} gains ${fmt(changes[i])} L` : '').filter(Boolean);
  const released = -sum(changes.filter(n=>n<0));
  const received = sum(changes.filter(n=>n>0));
  let message = '';
  if(released && received) message = `${fmt(Math.min(released,received))} L redirected from ${sources.join(' and ')}; ${gains.join(' and ')}.`;
  else if(released) message = `${fmt(released)} L removed from deliveries to ${sources.join(' and ')} and retained on the tanker.`;
  else if(received) message = `${gains.join(' and ')} from water previously retained on the tanker.`;
  else message = 'Delivery quantities are unchanged after this verified reading.';
  if(released && received && released!==received) message += ` Water retained on the tanker ${released>received?'increases':'decreases'} by ${fmt(Math.abs(released-received))} L.`;
  return `${message} Tanker supply remains ${fmt(state.load)} L.`;
}

function renderComparison() {
  $('comparison').hidden = !comparison;
  if(!comparison) { $('comparison').replaceChildren(); return; }
  $('comparison').innerHTML = `<h3 tabindex="-1">Delivery changes after verification</h3><p>${movementExplanation()}</p><table id="comparison-table"><thead><tr><th scope="col">Hostel</th><th scope="col">Previous L</th><th scope="col">Revised L</th><th scope="col">Change L</th></tr></thead><tbody>${names.map((name,i) => {const delta=plan.best[i]-comparison.best[i];return `<tr><th scope="row">${name}</th><td>${fmt(comparison.best[i])}</td><td>${fmt(plan.best[i])}</td><td class="${delta>0?'positive':delta<0?'negative':''}">${signed(delta)}</td></tr>`;}).join('')}</tbody><tfoot><tr><th scope="row">Total</th><td>${fmt(sum(comparison.best))}</td><td>${fmt(sum(plan.best))}</td><td>${signed(sum(plan.best)-sum(comparison.best))}</td></tr></tfoot></table>`;
}

function renderInspection() {
  const rank = scores.map((value,i)=>({value,i})).sort((a,b)=>b.value-a.value);
  const top = rank[0], useful = top.value>=.5;
  $('inspection').innerHTML = `<p class="eyebrow">MEASURE BEFORE DISPATCH</p><h2 id="inspection-title">${useful?'Check this tank first':'No priority inspection'}</h2>${useful?`<p class="priority-name">${names[top.i]}</p><span class="benefit">${fmt(top.value)} L expected shortage preventable</span><p>Checking ${names[top.i]} has the largest calculated benefit: knowing its stock lets the same ${fmt(state.load)} L supply be allocated with less expected shortage.</p>`:`<p>A new reading has less than 1 L of rounded expected dispatch benefit under these conditions. You can still record a verified reading.</p>`}<ol class="ranking" aria-label="Inspection benefit ranking">${rank.map(({value,i})=>`<li><span>${names[i]}</span><b>${fmt(value)} L</b></li>`).join('')}</ol><form id="verify-form"><label class="reading-select">Tank to verify<select id="verify-tank">${names.map((name,i)=>`<option value="${i}" ${i===top.i?'selected':''}>${name}</option>`).join('')}</select></label><div class="reading-entry"><label>Verified stock (L)<input id="actual" type="number" min="0" max="8000" step="1" value="${state.stock[top.i]}" required></label><button class="primary" type="submit">Apply reading</button></div><p class="input-help">0–8,000 L · verification removes sensor uncertainty</p><p id="reading-error" class="error" role="alert" hidden></p></form>`;
  $('verify-tank').onchange = () => { $('actual').value=state.stock[+$('verify-tank').value]; $('reading-error').hidden=true; };
  $('actual').oninput = () => { $('reading-error').hidden=true; };
  $('actual').oninvalid = () => { $('reading-error').textContent='Enter a whole-number reading between 0 and 8,000 L.'; $('reading-error').hidden=false; };
  $('verify-form').onsubmit = event => {
    event.preventDefault();
    if(!$('verify-form').reportValidity()) return;
    const i=+$('verify-tank').value, actual=+$('actual').value;
    comparison={best:plan.best.slice(), hostel:i, reading:actual};
    state.stock[i]=actual; state.error[i]=0;
    render();
    $('status').textContent=`${names[i]} verified at ${fmt(actual)} L. Dispatch recalculated using the verified stock estimate.`;
    $('comparison').querySelector('h3').focus({preventScroll:true});
    $('comparison').scrollIntoView({block:'nearest'});
  };
  $('inspect-question').textContent = useful ? `Why inspect ${names[top.i].split(' ')[0]} first?` : 'Is any tank worth inspecting?';
}

function renderForecast() {
  const hours=plan.hourly[0].map((_,j)=>sum(plan.hourly.map(h=>h[j])));
  const peak=hours.indexOf(Math.max(...hours));
  const ceiling=Math.ceil(Math.max(...hours)/500)*500;
  const x=i=>82+i*96, y=value=>142-112*value/ceiling;
  $('forecast').innerHTML=`<svg viewBox="0 0 600 177" role="img" aria-label="Campus hourly demand: ${hours.map((n,i)=>`${time(state.hour+i)} ${fmt(n)} litres`).join('; ')}"><title>Six-hour campus demand in litres per hour</title>${[0,ceiling/2,ceiling].map(n=>`<line class="chart-grid" x1="82" x2="562" y1="${y(n)}" y2="${y(n)}"/><text class="chart-label" x="70" y="${y(n)+4}" text-anchor="end">${fmt(n)}</text>`).join('')}<polyline class="chart-line" points="${hours.map((n,i)=>`${x(i)},${y(n)}`).join(' ')}"/>${hours.map((n,i)=>`<circle class="chart-dot" cx="${x(i)}" cy="${y(n)}" r="4"><title>${time(state.hour+i)} · ${fmt(n)} L/hour</title></circle><text class="chart-label" x="${x(i)}" y="166" text-anchor="middle">${time(state.hour+i)}</text>`).join('')}</svg><p class="chart-caption">Peak ${time(state.hour+peak)} · <b>${fmt(hours[peak])} L/hour</b>. Six-hour total ${fmt(sum(plan.totals))} L.</p><p class="chart-caption">Demand ranges in the dispatch sheet are calibrated forecasts. Amber stock marks show current reading uncertainty, a separate input.</p>`;
}

function alternative(kind) {
  const specs={late:{key:'delay',amount:2,max:6,label:'Arrival delay',unit:'hours'}, supply:{key:'load',amount:1000,max:12000,label:'Tanker load',unit:'L'}, hot:{key:'temp',amount:3,max:40,label:'Temperature',unit:'°C'}};
  const spec=specs[kind];
  if(!spec) return {error:'Choose one of the supported alternatives.'};
  if(state[spec.key]+spec.amount>spec.max) return {error:`${spec.label} is ${fmt(state[spec.key])} ${spec.unit}. This alternative would exceed the ${fmt(spec.max)} ${spec.unit} input limit. Current dispatch is unchanged.`};
  const next=structuredClone(state); next[spec.key]+=spec.amount;
  return {state:next, plan:solve(next), spec};
}

function showPreview(kind, trigger) {
  previewTrigger=trigger;
  preview=alternative(kind);
  if(preview.error){$('preview').innerHTML=`<p class="error">${preview.error}</p><button id="preview-cancel">Dismiss</button>`;}
  else {
    const next=preview.plan, spec=preview.spec;
    $('preview').innerHTML=`<div class="preview-box"><h3>Current plan → preview</h3><p class="preview-caption">${spec.label}: ${fmt(state[spec.key])} → ${fmt(preview.state[spec.key])} ${spec.unit}</p><p>Expected shortage <b>${fmt(plan.loss)} → ${fmt(next.loss)} L</b> (${signed(next.loss-plan.loss)} L)</p><table id="preview-table"><thead><tr><th>Deliver L</th><th>Current</th><th>Preview</th><th>Change</th></tr></thead><tbody>${names.map((name,i)=>`<tr><th>${name}</th><td>${fmt(plan.best[i])}</td><td>${fmt(next.best[i])}</td><td>${signed(next.best[i]-plan.best[i])}</td></tr>`).join('')}</tbody></table><p class="preview-caption">Supply ${fmt(preview.state.load)} L · ${fmt(next.unused)} L retained. Current plan stays in place until Apply.</p><div class="preview-controls"><button id="preview-apply" class="primary">Apply</button><button id="preview-cancel">Cancel</button></div></div>`;
    $('preview-apply').onclick=()=>{
      state=preview.state; comparison=null; walking=false;
      render(); $('status').textContent='Alternative applied. Dispatch, forecast and inspection priority recalculated.';
      previewTrigger?.focus({preventScroll:true});
    };
  }
  $('preview-cancel').onclick=()=>{preview=null;$('preview').replaceChildren();previewTrigger?.focus({preventScroll:true});};
}

function inspectionAnswer() {
  const i=scores.indexOf(Math.max(...scores));
  if(scores[i]<.5)return 'No reading has at least 1 L of rounded expected dispatch benefit under these conditions.';
  return `${names[i]} ranks first at ${fmt(scores[i])} L of expected shortage preventable. The calculation compares the current plan with re-optimised plans after its low, reported and high stock readings, weighted equally. Supply stays at ${fmt(state.load)} L; better information changes where it is delivered.`;
}
function alternativeAnswer(kind) {
  const result=alternative(kind);
  if(result.error)return result.error;
  return `With ${result.spec.label.toLowerCase()} at ${fmt(result.state[result.spec.key])} ${result.spec.unit}, expected shortage becomes ${fmt(result.plan.loss)} L (${signed(result.plan.loss-plan.loss)} L). ${result.plan.loss<1e-7?'This covers predicted demand in all modelled stock cases.':'Some expected shortage remains.'} Deliveries: ${names.map((name,i)=>`${name} ${fmt(result.plan.best[i])} L`).join('; ')}. This answer does not change your dispatch.`;
}
function answerQuestion(question) {
  const q=question.trim().toLowerCase();
  let answer;
  if(q==='supply'||/another|extra|1,?000|supply/.test(q))answer=alternativeAnswer('supply');
  else if(q==='late'||/late|delay/.test(q))answer=alternativeAnswer('late');
  else if(q==='inspect'||/inspect|measure|check/.test(q))answer=inspectionAnswer();
  else if(/why|deliver|receiv/.test(q)) {
    const i=names.findIndex(name=>q.includes(name.split(' ')[0].toLowerCase()));
    answer=i<0?'Name a hostel: for example, “Why does West receive this amount?”':`${names[i]} has ${fmt(state.stock[i])} L reported stock ± ${fmt(state.error[i])} L and ${fmt(plan.totals[i])} L forecast demand. Its ${fmt(plan.best[i])} L delivery is part of the feasible campus allocation with the least expected unmet demand, then the lowest worst proportional hostel shortage. Expected unmet demand here is ${fmt(plan.gaps[i])} L; arrival delay is ${state.delay} hours.`;
  } else answer='I can explain a named hostel’s delivery, inspection priority, a two-hour arrival delay, or an extra 1,000 L. Try one of the questions above.';
  $('answer').textContent=answer; $('answer').hidden=false;
}

function renderWalk() {
  $('walk').hidden=!walking;
  if(!walking){$('walk').replaceChildren();return;}
  const message=comparison ? `3 / 3 · ${movementExplanation()} Compare the rows below or export this dispatch.` : '1 / 3 · Compare the inspection benefits. 2 / 3 · Select East hostel, enter 5,300 L in Verified stock, then Apply reading to see the allocation change.';
  $('walk').innerHTML=`<div class="tour"><div><b>60-second dispatch walkthrough</b><p>${message}</p></div><div class="tour-actions"><button id="demo-restart">Restart</button><button id="demo-exit">Exit</button></div></div>`;
  $('demo-restart').onclick=startDemo;
  $('demo-exit').onclick=()=>{walking=false;renderWalk();$('demo').focus();};
}
function startDemo(){walking=true;loadScenario(1);$('actual').focus({preventScroll:true});}

function dispatchCSV() {
  const headers=['Hostel','Residents','Tank reading L','Reading uncertainty +/- L','Forecast demand L','Forecast low L','Forecast high L','Deliver L','Expected unmet L','Scenario','Start hour','Temperature C','Tanker load L','Arrival delay hours','Retained on tanker L'];
  if(comparison)headers.push('Previous delivery L','Revised delivery L','Change L');
  const rows=names.map((name,i)=>{
    const row=[name,state.people[i],state.stock[i],state.error[i],Math.round(plan.totals[i]),...forecastRange(i).map(Math.round),plan.best[i],Math.round(plan.gaps[i]),scenarioNames[active],state.hour,state.temp,state.load,state.delay,plan.unused];
    if(comparison)row.push(comparison.best[i],plan.best[i],plan.best[i]-comparison.best[i]);
    return row;
  });
  return [headers,...rows].map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\r\n');
}

function render() {
  plan=solve(state); scores=readingValues(state,plan);
  preview=null; $('preview').replaceChildren();
  $('answer').textContent=''; $('answer').hidden=true; $('question').value='';
  $('heading').textContent=`${time(state.hour)} dispatch`;
  $('context').textContent=`Forecast ${time(state.hour)}–${time(state.hour+6)} · Tanker ${fmt(state.load)} L · ${names.length} destinations`;
  document.querySelectorAll('[data-scenario]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.scenario===active)));
  renderDispatch(); renderInspection(); renderForecast(); renderConditions(); renderWalk();
}

$('conditions-form').onsubmit=event=>{
  event.preventDefault();
  if(!$('conditions-form').reportValidity())return;
  const next=structuredClone(state);
  document.querySelectorAll('[data-key]').forEach(input=>{const [key,index]=input.dataset.key.split('.');if(index===undefined)next[key]=+input.value;else next[key][index]=+input.value;});
  state=next;comparison=null;walking=false;render();
  $('status').textContent='Conditions applied. Dispatch recalculated.';
  $('conditions-feedback').textContent='Conditions applied.';
};
$('conditions-form').addEventListener('input',()=>{$('conditions-feedback').textContent='Unapplied changes — current dispatch is unchanged.';});
$('conditions-form').addEventListener('invalid',()=>{$('conditions-feedback').textContent='Check the highlighted value and its limits. Current dispatch is unchanged.';},true);
document.querySelectorAll('[data-scenario]').forEach(b=>b.onclick=()=>{walking=false;loadScenario(+b.dataset.scenario);});
$('reset').onclick=()=>{walking=false;loadScenario(active);$('status').textContent='Scenario reset. Verified readings and comparison cleared.';};
document.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>showPreview(b.dataset.preview,b));
document.querySelectorAll('[data-question]').forEach(b=>b.onclick=()=>answerQuestion(b.dataset.question));
$('ask-form').onsubmit=event=>{event.preventDefault();answerQuestion($('question').value);};
$('demo').onclick=startDemo;
$('export').onclick=()=>{
  const url=URL.createObjectURL(new Blob([dispatchCSV()],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='TankShift-dispatch.csv';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
loadScenario(1);
