// 天井クレーン：回路の組み立て・寸動・インターロック・巻過防止・ブレーキ・故障・荷運びを確かめる
// 使い方: node tests/crane.js
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

const shots = path.join(process.env.TEMP || os.tmpdir(), 'seigyo-navigation-check');
fs.mkdirSync(shots, {recursive: true});

(async()=>{
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000},locale:process.env.CRANE_LANGUAGE==='en'?'en-US':'ja-JP'});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route(/^https?:/,r=>r.abort());
    await page.addInitScript(()=>{
      window.requestAnimationFrame=fn=>{window.nextFrame=fn;return 1;};
      window.clock=performance.now();
      window.advance=seconds=>{for(let i=0;i<seconds*60;i++){window.clock+=1000/60;window.nextFrame(window.clock);}};
    });
    const url=pathToFileURL(path.resolve(__dirname,'../apps/relay-crane.html')).href;
    await page.goto(url);
    await page.evaluate(()=>advance(.1));
    const missing=new Set();
    const checkEnglish=async()=>{
      if(await page.locator('html').getAttribute('lang')!=='en')return;
      await page.waitForTimeout(0);
      const texts=await page.evaluate(()=>{
        const out=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
        while(n=w.nextNode())if(!n.parentElement.closest('script,style,[translate="no"]'))out.push(n.data.trim());
        for(const el of document.querySelectorAll('[aria-label],[title],[alt]'))if(!el.closest('[translate="no"]'))for(const a of ['aria-label','title','alt'])out.push(el.getAttribute(a)||'');
        return out.filter(t=>/[ぁ-ゖァ-ヺ一-龯々]/u.test(t));
      });texts.forEach(t=>missing.add(t));
    };
    const S=async()=>{await checkEnglish();return page.evaluate(()=>window.__S);};
    const press=(k,v)=>page.evaluate(([k,v])=>{window.__P[k]=v;},[k,v]);
    const hold=async(k,sec)=>{await press(k,1);await page.evaluate(s=>advance(s),sec);await press(k,0);await page.evaluate(()=>advance(.1));await checkEnglish();};
    const choose=async(id,v)=>{await page.selectOption('#sel-'+id,v);await page.evaluate(()=>advance(.05));await checkEnglish();};

    // 組む前:電源入を押している間だけMCが入り、巻上は動かない
    assert.match(await page.locator('#buildCount').textContent(),/0 \/ 6$/);
    assert.equal(await page.locator('#buildAll').count(),0);
    assert.equal(await page.locator('#answerList').isVisible(),false);
    await press('on',1);await page.evaluate(()=>advance(.2));
    assert.equal((await S()).MC,1);
    await press('on',0);await page.evaluate(()=>advance(.2));
    assert.equal((await S()).MC,0,'自己保持がないと電源入を離すと切れる');

    // ① 自己保持
    await choose('s1','MCa');
    await hold('on',.2);
    assert.equal((await S()).MC,1,'MCのa接点で自己保持');
    // 非常停止で切れ、解除しても自動では入らない
    await page.locator('#estop').click();await page.evaluate(()=>advance(.2));
    assert.equal((await S()).MC,0);
    await page.locator('#estop').click();await page.evaluate(()=>advance(.2));
    assert.equal((await S()).MC,0,'非常停止の解除だけでは再起動しない');
    await hold('on',.2);

    // ② 寸動 ⑥がないとブレーキに逆らって止まる → 先に⑥を組む
    await choose('s2','PBa');await choose('s3','ILb');await choose('s6','run');
    let h0=(await S()).H;
    await hold('up',1);
    assert.equal((await S()).H,h0,'④が空きのうちは巻上の回路が開いている');
    await hold('dn',1);
    let s=await S();
    assert.ok(s.H<h0-.1,'巻下で下がる');assert.equal(s.MCD,0,'離すと止まる');
    const hStop=s.H;await page.evaluate(()=>advance(1));
    assert.ok(Math.abs((await S()).H-hStop)<1e-6,'止めるとブレーキで保持');

    // ④ 巻過防止を入れてから、③ インターロック:同時に押しても片方だけ
    await choose('s4','LSb');
    await press('up',1);await press('dn',1);await page.evaluate(()=>advance(.3));
    s=await S();assert.ok(s.MCU^s.MCD,'片方だけ入る');assert.equal(s.trip,0);
    await press('up',0);await press('dn',0);await page.evaluate(()=>advance(.1));

    // ④ b接点で上限停止、巻下で戻れる
    await hold('up',5);
    s=await S();assert.ok(s.H>=.92&&s.H<.95,'上限LSで止まる: '+s.H);assert.equal(s.THR,0);
    await hold('dn',.5);assert.ok((await S()).H<.92,'巻下で戻れる');

    // ⑤ 端:進む側のLSで止まり、反対へ戻れる
    await choose('s5','same');
    await hold('e',8);
    s=await S();assert.ok(s.X>=.95&&s.X<.98,'東端LSで止まる: '+s.X);assert.equal(s.THR,0);
    await hold('w',.6);assert.ok((await S()).X<.95);
    assert.match(await page.locator('#buildCount').textContent(),/6 \/ 6$/);
    assert.equal(await page.locator('#parts .ok,#parts .wrong,#lad .slot.ok,#lad .slot.ng').count(),0);
    assert.equal(await page.locator('#answerList').isVisible(),false);
    await page.locator('#answers summary').click();
    assert.equal(await page.locator('#answerList').isVisible(),true);
    await checkEnglish();
    await page.locator('#answers summary').click();

    // 故障:インターロックを短絡線にして同時押し → ブレーカー
    await choose('s3','jump');
    await press('up',1);await press('dn',1);await page.evaluate(()=>advance(.2));
    await press('up',0);await press('dn',0);
    s=await S();assert.equal(s.trip,1,'短絡でブレーカーが切れる');assert.equal(s.MC,0);
    assert.match(await page.locator('#now').textContent(),/ブレーカー遮断|Breaker tripped/);
    await choose('s3','ILb');await page.locator('#breaker').click();await hold('on',.2);
    assert.equal((await S()).MC,1);

    // 故障:反対側の端LS → 車輪止めにぶつかり過負荷
    await choose('s5','opp');
    await hold('e',10);
    s=await S();assert.equal(s.THR,1,'車輪止めで過負荷');
    await choose('s5','same');await page.locator('#thermal').click();await hold('on',.2);

    // 荷運び:完成品で荷の真上へ、下ろして玉掛け、置き場へ
    await page.locator('#reset').click();for(const [id,v] of Object.entries({s1:'MCa',s2:'PBa',s3:'ILb',s4:'LSb',s5:'same',s6:'run'}))await choose(id,v);await page.evaluate(()=>advance(.1));
    await hold('on',.2);
    const drive=async(axis,target)=>{for(let i=0;i<400;i++){const s=await S();const d=target-s[axis];if(Math.abs(d)<.012)break;
      const k=axis==='X'?(d>0?'e':'w'):axis==='Z'?(d>0?'n':'s'):(d>0?'up':'dn');await press(k,1);await page.evaluate(t=>advance(t),Math.max(.05,Math.min(1,Math.abs(d)/.2)));await press(k,0);await page.evaluate(()=>advance(.05));}};
    s=await S();
    await drive('X',s.load.X);await drive('Z',s.load.Z);await page.evaluate(()=>advance(3));
    await drive('H',.15);
    assert.equal(await page.locator('#sling').isDisabled(),false,'荷の真上で玉掛けできる');
    await page.locator('#sling').click();assert.equal((await S()).hooked,true);
    await drive('H',.7);    // 吊った荷はブレーキで空中に止まる(発見:荷の保持)
    await page.evaluate(()=>advance(1.5));
    s=await S();
    await drive('X',s.target.X);await drive('Z',s.target.Z);await page.evaluate(()=>advance(4));
    await drive('H',.12);await hold('dn',.5);
        assert.equal(await page.locator('#sling').isDisabled(),false,'床に下ろすと外せる');
    await page.locator('#sling').click();
    s=await S();assert.equal(s.done,1,'置き場に置くと1件');assert.ok(s.last>0);

    // ブレーキ故障:止めると吊った荷がずり落ちる
    await page.locator('#reset').click();for(const [id,v] of Object.entries({s1:'MCa',s2:'PBa',s3:'ILb',s4:'LSb',s5:'same',s6:'run'}))await choose(id,v);await choose('s6','always');
    await hold('on',.2);h0=(await S()).H;await page.evaluate(()=>advance(1));
    assert.ok((await S()).H<h0-.03,'ブレーキが開いたままだと下がる');

    const notes=await page.locator('#notes li.got').count();
    assert.equal(notes,7,'All seven discoveries must be achievable');
    const download=page.waitForEvent('download');await page.locator('#noteExport').click();
    const backup=JSON.parse(fs.readFileSync(await(await download).path(),'utf8'));
    assert.equal(backup.crane.length,7);
    assert.ok(['relay','device','elevator','pinball'].every(k=>Array.isArray(backup[k])));
    page.once('dialog',d=>d.dismiss());await page.locator('#noteClear').click();
    assert.equal(await page.locator('#notes li.got').count(),7);
    page.once('dialog',d=>d.accept());await page.locator('#noteClear').click();
    assert.equal(await page.locator('#notes li.got').count(),0);
    await page.locator('#noteFile').setInputFiles({name:'notes.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await page.waitForFunction(()=>document.querySelectorAll('#notes li.got').length===7,null,{polling:50});
    await checkEnglish();
    const legacy={...backup};delete legacy.crane;
    await page.locator('#noteFile').setInputFiles({name:'old-notes.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
    await page.waitForTimeout(50);assert.equal(await page.locator('#notes li.got').count(),7);


    for(const topic of ['power','hoist','move','brake','all']){
      await page.locator(`[data-topic="${topic}"]`).click();
      assert.equal(await page.locator(`[data-topic="${topic}"]`).getAttribute('aria-pressed'),'true');
    }
    await page.screenshot({path:path.join(shots,'crane-1440.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'スマートフォン幅で横にはみ出さない');
    await page.screenshot({path:path.join(shots,'crane-390.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    await page.selectOption('[data-language]','en');await page.evaluate(()=>advance(.2));
    assert.match(await page.locator('h1').textContent(),/Overhead Crane/);
    assert.ok((await page.locator('#bay text').allTextContents()).includes('S ↓'));
    for(const topic of ['power','hoist','move','brake','all']){
      await page.locator(`[data-topic="${topic}"]`).click();await checkEnglish();
    }
    for(const id of ['s1','s2','s3','s4','s5','s6']){
      for(const value of await page.locator('#sel-'+id+' option').evaluateAll(els=>els.map(e=>e.value))){await choose(id,value);await checkEnglish();}
    }
    assert.deepEqual([...missing],[], 'Untranslated crane text');
    await page.selectOption('[data-language]','ja');await page.evaluate(()=>advance(.1));
    assert.ok((await page.locator('#bay text').allTextContents()).includes('南 ↓'));
    await page.selectOption('[data-language]','en');await page.evaluate(()=>advance(.1));
    await page.screenshot({path:path.join(shots,'crane-en.png'),fullPage:true});
    await page.locator('#bay').screenshot({path:path.join(shots,'crane-compass-en.png')});
    await page.selectOption('[data-language]','ja');await page.evaluate(()=>advance(.1));
    await page.locator('#bay').screenshot({path:path.join(shots,'crane-compass-ja.png')});
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    assert.equal(await page.locator('a[href="apps/relay-crane.html"]').count(),1);
    assert.deepEqual(errors,[]);
    console.log('PASS crane: seal-in, E-stop, jog, interlock, overwind, end limits, short, overload, brake hold/slip, load delivery, notes, diagram topics, mobile, English, menu');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
