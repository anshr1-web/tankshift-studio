'use strict';
// npm install --prefix /tmp/tankshift-browser-tests playwright-core
// NODE_PATH=/tmp/tankshift-browser-tests/node_modules node --test tests/browser.test.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const url = process.env.TANKSHIFT_URL || pathToFileURL(path.join(root, 'dist/index.html')).href;
const artifacts = process.env.TANKSHIFT_ARTIFACTS || path.join(os.tmpdir(), 'tankshift-browser-artifacts');
let browser;
before(async () => {
  await fs.mkdir(artifacts, {recursive:true});
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
});
after(async () => { await browser?.close(); });

async function withPage(fn, viewport={width:1440,height:900}, pageUrl=url) {
  const context = await browser.newContext({viewport,acceptDownloads:true});
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  try {
    await page.goto(pageUrl);
    await page.locator('#dispatch-table').waitFor();
    await fn(page);
    assert.deepEqual(errors, [], 'no uncaught browser errors');
  } finally { await context.close(); }
}
const deliveries = page => page.evaluate(() => Array.from(plan.best));
const inputs = page => page.evaluate(() => JSON.parse(JSON.stringify(state)));
async function verify(page,value='5300') {
  await page.locator('#actual').fill(value);
  await page.locator('#verify-form button[type="submit"]').click();
}
async function condition(page,key,value) {
  await page.locator('#conditions').evaluate(el=>el.open=true);
  await page.locator(`[data-key="${key}"]`).fill(String(value));
}

test('desktop dispatch and inspection action fit together at 1440 × 900', async()=>withPage(async page=>{
  assert.deepEqual(await deliveries(page),[2000,750,250]);
  for (const selector of ['#dispatch-table','#verify-form']) {
    const bounds=await page.locator(selector).boundingBox();
    assert(bounds && bounds.y>=0 && bounds.y+bounds.height<=900, `${selector} visible without scrolling`);
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
  await page.screenshot({path:path.join(artifacts,'desktop-initial.png'),fullPage:true});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(artifacts,'desktop-initial-viewport.png')});
}));

test('verified East reading renders exact reallocation and preserves 3000 L total',async()=>withPage(async page=>{
  await verify(page);
  assert.deepEqual(await deliveries(page),[250,1750,1000]);
  const text=await page.locator('#comparison').innerText();
  for(const value of ['1,750','1,000','750'])assert(text.includes(value),`comparison includes ${value}`);
  assert.equal(await page.evaluate(()=>plan.best.reduce((a,b)=>a+b,0)),3000);
  assert.equal(await page.evaluate(()=>state.stock[0]),5300);
  assert.equal(await page.evaluate(()=>state.error[0]),0);
  await page.screenshot({path:path.join(artifacts,'desktop-verified.png'),fullPage:true});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(artifacts,'desktop-verified-viewport.png')});
}));

test('reset and scenario switching clear previous plan comparison',async()=>withPage(async page=>{
  await verify(page);await page.locator('#reset').click();
  assert.deepEqual(await deliveries(page),[2000,750,250]);
  assert.equal(await page.evaluate(()=>comparison),null);
  await verify(page);await page.locator('[data-scenario="0"]').click();
  assert.equal(await page.evaluate(()=>comparison),null);
  await page.locator('[data-scenario="1"]').click();
  assert.deepEqual(await deliveries(page),[2000,750,250]);
}));

test('what-if preview and cancellation preserve dispatch; Apply commits the alternative',async()=>withPage(async page=>{
  for(const kind of ['late','supply']) {
    const original=await inputs(page), before=await deliveries(page);
    await page.locator(`[data-preview="${kind}"]`).click();
    await page.locator('#preview-cancel').waitFor();
    assert.deepEqual(await inputs(page),original);
    assert.deepEqual(await deliveries(page),before);
    await page.locator('#preview-cancel').click();
    assert.deepEqual(await inputs(page),original);
    assert.deepEqual(await deliveries(page),before);
  }
  await page.locator('[data-preview="supply"]').click();
  await page.locator('#preview-apply').click();
  assert.equal((await inputs(page)).load,4000);
  assert.deepEqual(await deliveries(page),await page.evaluate(()=>Array.from(solve(state).best)));
}));

test('invalid verified readings do not mutate dispatch or stock',async()=>withPage(async page=>{
  const original=await inputs(page);
  for(const value of ['', '-1','8001','5300.5']) {
    await verify(page,value);
    assert.deepEqual(await inputs(page),original);
    assert.deepEqual(await deliveries(page),[2000,750,250]);
  }
}));

test('390 px layout has no horizontal page overflow or clipped input controls',async()=>withPage(async page=>{
  const assertLayout=async()=>{
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
    const clips=await page.locator('button,input,select').evaluateAll(els=>els.filter(el=>{
      const b=el.getBoundingClientRect();return b.width>0 && b.height>0 && (b.left<0 || b.right>innerWidth+1);
    }).map(el=>el.id||el.textContent));
    assert.deepEqual(clips,[],'controls do not escape viewport');
  };
  await assertLayout();
  await page.screenshot({path:path.join(artifacts,'mobile-initial.png'),fullPage:true});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(artifacts,'mobile-initial-viewport.png')});
  await verify(page);await assertLayout();
  await page.screenshot({path:path.join(artifacts,'mobile-verified.png'),fullPage:true});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(artifacts,'mobile-verified-viewport.png')});
  await page.locator('#conditions').evaluate(el=>el.open=true);await assertLayout();
},{width:390,height:844}));

test('standalone offline bundle loads and produces the same verified allocation',async()=>withPage(async page=>{
  assert.deepEqual(await deliveries(page),[2000,750,250]);
  await verify(page);
  assert.deepEqual(await deliveries(page),[250,1750,1000]);
},{width:1440,height:900},pathToFileURL(path.join(root,'START-HERE.html')).href));

test('zero supply and full tanks remain valid in the actual conditions form',async()=>withPage(async page=>{
  await condition(page,'load',0);
  await page.locator('#conditions-form button[type="submit"]').click();
  assert.deepEqual(await deliveries(page),[0,0,0]);
  assert.equal(await page.evaluate(()=>plan.unused),0);
  await page.locator('#reset').click();
  for(let i=0;i<3;i++){
    await condition(page,`stock.${i}`,8000);
    await condition(page,`error.${i}`,0);
  }
  await page.locator('#conditions-form button[type="submit"]').click();
  assert.deepEqual(await deliveries(page),[0,0,0]);
  assert.equal(await page.evaluate(()=>plan.unused),3000);
}));

test('invalid condition drafts preserve the current dispatch and respect limits',async()=>withPage(async page=>{
  const original=await inputs(page);
  await condition(page,'stock.0',8001);
  await page.locator('#conditions-form button[type="submit"]').click();
  assert.deepEqual(await inputs(page),original);
  assert.deepEqual(await deliveries(page),[2000,750,250]);
  await condition(page,'stock.0',3500);
  await condition(page,'load',12000);
  await condition(page,'delay',6);
  await page.locator('#conditions-form button[type="submit"]').click();
  for(const kind of ['late','supply']) {
    await page.locator(`[data-preview="${kind}"]`).click();
    assert.equal(await page.locator('#preview-apply').count(),0,'cannot apply out-of-range preview');
    assert((await page.locator('#preview').innerText()).length>0,'limit explanation is visible');
  }
}));

function parseCSV(text) {
  return text.trim().split(/\r?\n/).map(line=>{
    const values=[];let value='',quoted=false;
    for(let i=0;i<line.length;i++) {
      const c=line[i];
      if(c==='"') {if(quoted && line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
      else if(c===',' && !quoted){values.push(value);value='';}
      else value+=c;
    }
    values.push(value);return values;
  });
}

test('downloaded CSV matches visible inputs and deliveries before and after verification',async()=>withPage(async page=>{
  for(const verified of [false,true]) {
    if(verified) await verify(page);
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
    assert.equal(download.suggestedFilename(),'TankShift-dispatch.csv');
    const csv=parseCSV(await fs.readFile(await download.path(),'utf8'));
    const [headers,...rows]=csv;
    assert.equal(rows.length,3);
    const snapshot=await page.evaluate(()=>({state,plan,comparison}));
    const column=name=>{const i=headers.indexOf(name);assert(i>=0,`CSV contains ${name}`);return i;};
    for(let i=0;i<3;i++) {
      assert.equal(+rows[i][column('Deliver L')],snapshot.plan.best[i]);
      assert.equal(+rows[i][column('Tank reading L')],snapshot.state.stock[i]);
      assert.equal(+rows[i][column('Reading uncertainty +/- L')],snapshot.state.error[i]);
      assert.equal(+rows[i][column('Expected unmet L')],Math.round(snapshot.plan.gaps[i]));
      assert.equal(+rows[i][column('Tanker load L')],snapshot.state.load);
      assert.equal(+rows[i][column('Arrival delay hours')],snapshot.state.delay);
      assert.equal(+rows[i][column('Forecast demand L')],Math.round(snapshot.plan.totals[i]));
      const rowText=await page.locator('#dispatch-table tbody tr').nth(i).innerText();
      assert(rowText.includes(snapshot.plan.best[i].toLocaleString('en-IN')),'exported delivery is visible in hostel row');
      if(verified) {
        assert.equal(+rows[i][column('Previous delivery L')],snapshot.comparison.best[i]);
        assert.equal(+rows[i][column('Revised delivery L')],snapshot.plan.best[i]);
        assert.equal(+rows[i][column('Change L')],snapshot.plan.best[i]-snapshot.comparison.best[i]);
      }
    }
    if(!verified)assert(!headers.includes('Previous delivery L'));
  }
}));

test('consecutive verified readings compare against the immediately preceding plan',async()=>withPage(async page=>{
  await verify(page,'4000');
  const before=await deliveries(page);
  await page.locator('#verify-tank').selectOption('1');
  await verify(page,'3500');
  assert.deepEqual(await page.evaluate(()=>Array.from(comparison.best)),before);
  assert.deepEqual(before,[1500,1250,250]);
  assert.deepEqual(await deliveries(page),[1500,750,750]);
}));

test('scenario assistant uses current calculations and clears stale answers',async()=>withPage(async page=>{
  await page.locator('[data-question="supply"]').click();
  const answer=await page.locator('#answer').innerText();
  const expected=await page.evaluate(()=>Math.round(solve({...state,load:state.load+1000}).loss));
  assert(answer.includes(expected.toLocaleString('en-IN')),'extra-supply answer contains actual solver shortage');
  await verify(page);
  assert.equal(await page.locator('#answer').innerText(),'');
  await page.locator('#question').fill('Who won the cricket match?');
  await page.locator('#ask-form button[type="submit"]').click();
  assert.match(await page.locator('#answer').innerText(),/explain|supported|Try/i);
}));

test('walkthrough uses real controls and derives its result from the applied reading',async()=>withPage(async page=>{
  await page.locator('#demo').click();
  assert.deepEqual(await deliveries(page),[2000,750,250]);
  await verify(page,'4000');
  const revised=await deliveries(page);
  assert.deepEqual(revised,[1500,1250,250]);
  const text=await page.locator('#walk').innerText();
  assert(text.includes('500'),'walkthrough explains actual 500 L reallocation for this reading');
  assert(!text.includes('1,750'),'walkthrough does not hard-code the 5300 L outcome');
  await page.locator('#demo-restart').click();
  assert.deepEqual(await deliveries(page),[2000,750,250]);
  await page.locator('#demo-exit').click();
  assert.equal(await page.locator('#walk').isVisible(),false);
}));

test('verification with no delivery change displays zero deltas',async()=>withPage(async page=>{
  await verify(page,'3500');
  assert.deepEqual(await deliveries(page),[2000,750,250]);
  const changes=await page.locator('#comparison-table tbody tr td:last-child').allTextContents();
  assert.deepEqual(changes.map(s=>Number(s.replace(/,/g,''))),[0,0,0]);
}));

test('mobile demand chart labels remain readable and inside the chart',async()=>withPage(async page=>{
  const checkChart=async()=>{const issues=await page.locator('#forecast svg').evaluate(svg=>{
    const bounds=svg.getBoundingClientRect();
    const labels=[...svg.querySelectorAll('text')].map(el=>({text:el.textContent,b:el.getBoundingClientRect()}));
    const issues=[];
    for(const {text,b} of labels){
      if(b.left<bounds.left-1||b.right>bounds.right+1||b.bottom>bounds.bottom+1)issues.push(`clipped ${text}`);
      if(b.height<10)issues.push(`too small ${text}`);
    }
    const hours=labels.filter(({text})=>text.includes(':'));
    for(let i=1;i<hours.length;i++)if(hours[i-1].b.right>hours[i].b.left)issues.push('overlapping hours');
    return issues;
  });
  assert.deepEqual(issues,[]);};
  await checkChart();
  for(let i=0;i<3;i++)await condition(page,`people.${i}`,1000);
  await page.locator('#conditions-form button[type="submit"]').click();
  await checkChart();
},{width:390,height:844}));
