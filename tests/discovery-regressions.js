// node tests/discovery-regressions.js（smoke.js と同じ Playwright 環境で実行）
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/fonts\.google/, route => route.abort());
    // 加熱の待ち時間を短縮する。教材が登録したフレームを順に実行する。
    await page.addInitScript(() => {
      let queue = [], now = 0;
      Object.defineProperty(performance, 'now', { value: () => now });
      window.requestAnimationFrame = fn => queue.push(fn);
      window.advance = seconds => {
        for (let i = 0; i < seconds * 20; i++) {
          now += 50;
          const callbacks = queue;
          queue = [];
          callbacks.forEach(fn => fn(now));
        }
      };
    });
    const open = file => page.goto(pathToFileURL(path.resolve(__dirname, '../apps', file)).href);
    const frames = seconds => page.evaluate(s => window.advance(s), seconds);
    // 停止中の時計に依存する自動スクロールを避け、画面の各コントロールを操作する。
    const click = selector => page.locator(selector).evaluate(el => el.click());
    const range = (id, value) => page.locator('#' + id).evaluate((el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);

    await open('device-playground.html');
    for (const sensor of ['pt', 'tc']) {
      await page.evaluate(() => localStorage.removeItem('seigyo-asobiba.note.v1.device.onoff'));
      await page.reload();
      await click('#sensor [data-v="'+sensor+'"]');
      await click('#speed [data-v="10"]');
      await frames(11);
      assert.equal(await page.locator('#notes li.got').filter({hasText:'ON/OFF制御では'}).count(), 0, '最初の昇温だけでは発見にしない');
      await frames(9);
      assert.equal(await page.locator('#notes li.got').filter({hasText:'ON/OFF制御では'}).count(), 1, '再現手順どおり20秒以内に発見できる');
      await frames(40);
      const cycle = await page.evaluate(() => {
        const history = window.__dbg().hist.slice(-240), temps = history.map(h => h.T);
        return { min: Math.min(...temps), max: Math.max(...temps),
          switches: history.slice(1).filter((h, i) => h.u !== history[i].u).length };
      });
      assert.ok(cycle.min < 59 && cycle.max > 60 && cycle.switches >= 2, sensor+'でもHYS付きON/OFF制御で水温が上下する');
      assert.equal(await page.locator('#notes li.got').filter({hasText:'ON/OFF制御では'}).count(), 1);
      console.log(sensor+' / HYS 1℃: '+cycle.min.toFixed(1)+'〜'+cycle.max.toFixed(1)+'℃');
    }
    await page.reload();
    await frames(40);
    assert.equal(await page.locator('#broken.show').count(), 0, '水がある通常の加熱では故障しない');
    assert.equal(await page.locator('#heaterStatus').innerText(), '水中');
    await page.reload();
    await click('#drain');
    await frames(8);
    const heating = await page.evaluate(() => ({heater:window.__dbg().Th,sensor:window.__dbg().pv}));
    assert.ok(heating.heater > heating.sensor + 100, '露出したヒーター本体の温度上昇を観察できる');
    assert.equal(await page.locator('#heaterTemp').innerText(), heating.heater.toFixed(1)+'℃');
    assert.equal(await page.locator('#heaterStatus').innerText(), '空焚き・温度上昇中');
    assert.equal(await page.locator('#broken.show').count(), 0, '故障前に温度上昇を見られる時間がある');
    await frames(7);
    assert.match(await page.locator('#broken.show').innerText(), /空焚き/);
    assert.equal(await page.locator('#heaterStatus').innerText(), '断線・冷却中');
    const beforeCooling = await page.evaluate(() => window.__dbg().Th);
    await frames(1);
    assert.ok(await page.evaluate(() => window.__dbg().Th) < beforeCooling, '断線したヒーターは冷える');
    assert.equal(await page.locator('#notes li.got').filter({ hasText: '空焚き' }).count(), 1);
    await click('#fix');
    await frames(.1);
    assert.equal(await page.locator('#broken.show').count(), 0);
    assert.equal(await page.locator('#heaterStatus').innerText(), '水中');

    await page.reload();
    await click('#outDev [data-v="ssr"]');
    assert.equal(await page.locator('#hs').innerText(), '放熱板を外す');
    assert.equal(await page.evaluate(() => window.__dbg().hs), true, 'SSRは放熱板付きで開始する');
    await frames(60);
    assert.equal(await page.locator('#broken.show').count(), 0, '放熱板付きなら過熱故障しない');
    await click('#hs');
    await frames(20);
    assert.match(await page.locator('#broken.show').innerText(), /SSRが熱で壊れました/, '水温が安定した後でも放熱板を外して過熱を観察できる');

    await page.reload();
    await click('#outDev [data-v="ssr"]');
    await click('#hs');
    assert.equal(await page.locator('#hs').innerText(), '放熱板を付ける');
    await frames(3);
    const hotSsr = await page.evaluate(() => window.__dbg().S);
    assert.ok(hotSsr > 60 && hotSsr < 100, '故障前にSSRの温度上昇を観察できる');
    assert.equal(await page.locator('#broken.show').count(), 0);
    await click('#hs');
    await frames(10);
    assert.ok(await page.evaluate(() => window.__dbg().S) < hotSsr, '故障前に放熱板を戻すと冷却できる');
    assert.equal(await page.locator('#broken.show').count(), 0);

    await page.reload();
    await click('#outDev [data-v="ssr"]');
    await click('#hs');
    await frames(6);
    assert.match(await page.locator('#broken.show').innerText(), /SSRが熱で壊れました/, '初期の3倍速で6秒以内に過熱故障する');
    assert.equal(await page.locator('#hs').isDisabled(), true);
    assert.equal(await page.locator('#notes li.got').filter({hasText:'SSRの過熱'}).count(), 1);
    await click('#fix');
    await click('#hs');
    await frames(20);
    assert.equal(await page.locator('#broken.show').count(), 0, '交換後に放熱板を付ければ再故障しない');

    await page.getByRole('button', { name: '配線と発熱の部屋' }).evaluate(el => el.click());
    await range('len', 50);
    await range('n', 3);
    await click('#size [data-v="0.75"]');
    await frames(1);
    await click('#size [data-v="5.5"]');
    await frames(1);
    assert.equal(await page.locator('#notes li.got').filter({ hasText: '電線を太くすると' }).count(), 1);
    for (const scenario of ['off','above5','short','lengthOnly','noComparison','changedLoad']) {
      await page.evaluate(() => localStorage.removeItem('seigyo-asobiba.note.v1.device.thick'));
      await page.reload();
      await page.getByRole('button', { name: '配線と発熱の部屋' }).evaluate(el => el.click());
      await range('len', scenario==='short'?20:100);
      await range('n', scenario==='above5'?6:2);
      await click('#size [data-v="0.75"]');
      if(scenario!=='noComparison')await frames(.1);
      if(scenario==='off')await click('#wirePower');
      if(scenario==='changedLoad')await range('n',1);
      if(scenario==='lengthOnly')await range('len',50);
      else await click('#size [data-v="5.5"]');
      if(scenario==='off'){
        await frames(.1);
        assert.equal(await page.locator('#notes li.got').filter({hasText:'電線を太くすると'}).count(),0);
        await click('#wirePower');
      }
      await frames(.1);
      assert.equal(await page.locator('#notes li.got').filter({hasText:'電線を太くすると'}).count(),
        ['lengthOnly','noComparison','changedLoad'].includes(scenario)?0:1,scenario);
    }

    await page.getByRole('button', { name: '測る部屋(テスター)', exact: true }).evaluate(el => el.click());
    const point = id => page.locator('#scene [data-point="'+id+'"]').dispatchEvent('click');
    const meterMode = mode => page.locator('#dial [data-m="'+mode+'"]').dispatchEvent('click');
    await frames(.05);
    assert.match(await page.locator('#normalPower').innerText(), /スイッチOFF/, '正常値の表と現在のスイッチ条件の違いを表示する');
    await meterMode('acv');
    await point('outL');
    assert.equal(await page.locator('#pBlk').getAttribute('aria-pressed'), 'true', '赤を当てたら次は黒');
    await point('outN'); await frames(.1);
    assert.equal(await page.locator('#pRed').getAttribute('aria-pressed'), 'true', '黒を当てたら次は赤');
    assert.equal(await page.locator('#tRead').innerText(), '100.0');
    await point('p1');
    assert.equal(await page.locator('#pBlk').getAttribute('aria-pressed'), 'true', '両方接続済みでも赤の移動後は黒に切り替わる');
    await point('p2');
    assert.deepEqual(await page.evaluate(() => {const s=window.__dbg();return [s.red,s.black,s.next];}), ['p1','p2','red']);
    await point('outL'); await point('outN');
    await page.locator('#measBreakerScene').dispatchEvent('click'); await frames(.1);
    assert.equal(await page.locator('#tRead').innerText(), '0.0', '図のブレーカーを切るとコンセントも無電圧になる');
    assert.equal(await page.locator('#measBreaker').innerText(), 'ブレーカーを入れる');
    await meterMode('ohm'); await frames(.1);
    assert.equal(await page.locator('#tRead').innerText(), '18.0', '電源OFF後は負荷側のトランス1次の抵抗を測れる');
    await click('#pOff'); await point('p1'); await point('s1'); await frames(.1);
    assert.equal(await page.locator('#tRead').innerText(), 'OL');
    assert.equal(await page.locator('#notes li.got').filter({hasText:'ブレーカーを切って1次・2次間'}).count(), 1);
    await click('#pOff'); await meterMode('a'); await point('swA'); await point('swB');
    await click('#measBreaker'); await frames(.1);
    assert.equal(await page.locator('#tRead').innerText(), '0.500', 'ブレーカーを入れると直列の電流測定ができる');
    await click('#measBreaker'); await click('#pOff'); await meterMode('ohm');
    await point('outL'); await point('outN'); await frames(.1);
    assert.equal(await page.locator('#broken.show').count(), 0);
    await click('#measBreaker'); await frames(.1);
    assert.match(await page.locator('#broken.show').innerText(), /テスター/, '抵抗レンジのまま通電した故障判定は維持する');

    const faults = ['sw','fuse','lamp','cable','trans'];
    const setFault = index => page.evaluate(index => {
      const random = Math.random;
      try { Math.random=()=>(index+.5)/5; document.getElementById('flt').click(); }
      finally { Math.random=random; }
    }, index);
    for (const [index, fault] of faults.entries()) {
      await page.getByRole('button', {name:'測る部屋(テスター)',exact:true}).evaluate(el=>el.click());
      assert.equal(await page.locator('#flt').innerText(), '故障探しをONにする');
      await setFault(index);
      assert.equal(await page.locator('#flt').innerText(), '故障探しをOFFにする');
      await meterMode('dcv');
      for (const [i, pair] of [['swA','swB'],['fA','fB'],['lA','lB'],['cA','dN']].entries()) {
        await click('#pOff'); await point(pair[0]); await point(pair[1]); await frames(.05);
        assert.equal(await page.locator('#tRead').innerText(), i===index?'24.00':'0.00', fault+'の故障を部品両端の電圧で区別できる');
      }
      await click('#pOff'); await meterMode('acv'); await point('p1'); await point('p2'); await frames(.05);
      assert.equal(await page.locator('#tRead').innerText(), '100.0');
      await click('#pOff'); await point('s1'); await point('s2'); await frames(.05);
      assert.equal(await page.locator('#tRead').innerText(), fault==='trans'?'0.0':'24.0');
      await click('#flt'); await frames(.05);
      assert.equal(await page.evaluate(()=>window.__dbg().fault), null, 'OFFで故障を解除する');
      assert.equal(await page.locator('#guess').isVisible(), false);
      await click('#pOff'); await meterMode('dcv'); await point('lA'); await point('lB'); await frames(.05);
      assert.equal(await page.locator('#tRead').innerText(), '24.00', 'OFF後は正常なランプ回路に戻る');
      await setFault(index);
      await click('#guess [data-g="'+faults[(index+1)%5]+'"]');
      assert.equal(await page.evaluate(()=>window.__dbg().fault), fault, '違う部品では正解にしない');
      await click('#guess [data-g="'+fault+'"]'); await frames(.05);
      assert.match(await page.locator('#say').innerText(), /正解/);
      assert.equal(await page.locator('#notes li.got').filter({hasText:'「悪いのは？」'}).count(), 1);
      assert.equal(await page.locator('#flt').innerText(), '故障探しをONにする');
    }

    const normalPairs = [
      ['acv','outL','outN'], ['acv','p1','p2'], ['acv','s1','s2'], ['dcv','dP','dN'],
      ['dcv','swA','swB'], ['dcv','fA','fB'], ['dcv','lA','lB'], ['dcv','cA','dN']
    ];
    for (const [index,[mode,red,black]] of normalPairs.entries()) {
      await click('#pOff'); await meterMode(mode); await point(red); await point(black); await frames(.05);
      const listed = await page.locator('#normalValues tbody tr').nth(index).locator('td').nth(2).innerText();
      assert.equal(Number(await page.locator('#tRead').innerText()), parseFloat(listed), red+'–'+black+'の正常値が実際の測定と一致する');
    }
    assert.equal(await page.locator('#scene circle[cx="820"][cy="180"]').getAttribute('fill'), 'url(#bulbOn)', '正常なランプは24Vで点灯する');
    assert.equal(await page.locator('#normalPower').isVisible(), false);
    await click('#measBreaker'); await frames(.05);
    assert.match(await page.locator('#normalPower').innerText(), /ブレーカーOFF/);

    await page.getByRole('button', { name: 'モーターの部屋' }).evaluate(el => el.click());
    await frames(1.2);
    for (const [method, initial] of [['dol', 55], ['sd', 18], ['inv', 3]]) {
      await click('#meth [data-v="' + method + '"]');
      await click('#start');
      await frames(0.05);
      const points = await page.evaluate(() => window.__dbg().cur.pts);
      assert.equal(points[0][0], -1);
      assert.ok(points.filter(([t]) => t <= 0).every(([, amps]) => amps === 0));
      assert.equal(Math.round(points.find(([t]) => t > 0)[1]), initial);
      if (method !== 'inv') { await click('#stop'); await frames(2); }
    }
    await frames(3.4);
    await click('#stop');
    await frames(0.35);
    const decel = await page.evaluate(() => ({ amps: window.__dbg().I, hz: window.__dbg().f }));
    assert.ok(decel.amps > 0 && decel.hz > 0);
    await click('#start');
    assert.deepEqual(await page.evaluate(() => ({
      amps: window.__dbg().cur.pts.at(-1)[1], hz: window.__dbg().f
    })), decel, '減速中に再始動しても直前の電流と周波数を引き継ぐ');
    await click('#clr');
    await frames(0.2);
    assert.equal(await page.evaluate(() => window.__dbg().traces.length), 0);

    const motorBreaker = () => page.locator('#motorBreakerScene').dispatchEvent('click');
    for (const method of ['dol','sd','inv']) {
      await page.getByRole('button', {name:'モーターの部屋',exact:true}).evaluate(el=>el.click());
      await click('#meth [data-v="'+method+'"]'); await click('#start'); await frames(.5);
      await motorBreaker(); await frames(.1);
      assert.deepEqual(await page.evaluate(()=>{const s=window.__dbg();return [s.breaker,s.run,s.I,s.f];}), [false,false,0,0], method+'でも図から電源を切れる');
      await click('#start');
      assert.equal(await page.evaluate(()=>window.__dbg().run), false, 'ブレーカーOFFでは始動しない');
      await click('#brk'); await frames(.1);
      assert.equal(await page.locator('#motorBreakerScene').getAttribute('aria-label'), 'ブレーカーを切る');
      assert.equal(await page.evaluate(()=>window.__dbg().run), false, '再投入だけで勝手に始動しない');
    }
    await motorBreaker(); await frames(2); await click('#ww'); await motorBreaker(); await frames(.1);
    assert.match(await page.locator('#broken.show').innerText(), /インバータが壊れました/);
    await motorBreaker(); await frames(.1);
    assert.equal(await page.evaluate(()=>window.__dbg().breaker), false, '故障中は図からも再投入できない');
    assert.equal(await page.locator('#brk').isDisabled(), true);

    await open('click-relay.html');
    await page.getByRole('button', { name: /自己保持/ }).evaluate(el => el.click());
    await cut('PB2(停止)の2', 'R1の13');
    await cut('R1の14', 'R1のA1');
    await join('PB1(起動)の1', 'R1の33');
    await join('R1の34', 'PB1(起動)の2');
    const stopNote = page.locator('#notes li.got').filter({ hasText: '停止を押しても止まらない' });
    const greenLamp = page.locator('#panel circle[fill="url(#gOn_g)"]');
    const run = async () => {
      await page.keyboard.down('1');
      await frames(0.1);
      await page.keyboard.up('1');
      await frames(0.1);
      assert.equal(await greenLamp.count(), 1);
    };
    await run();
    assert.equal(await page.locator('#notes li.got').filter({ hasText: '自己保持:ボタンを離しても' }).count(), 1,
      '元の13–14の代わりに33–34を使い、起動端子から分岐しても自己保持を発見');
    await page.keyboard.down('2');
    assert.equal(await stopNote.count(), 0, '正常配線では接点が戻るまでの時間を誤配線とみなさない');
    await frames(0.1);
    await page.keyboard.up('2');
    assert.equal(await greenLamp.count(), 0);

    for (const number of ['1', '2']) {
      // 3面では左から起動、停止の順に同じ番号の端子が並ぶ。
      const stopTerminal = page.locator('#panel .term').filter({ hasText: new RegExp('^' + number + '$') }).nth(1);
      await stopTerminal.dispatchEvent('pointerdown');
    }
    await page.keyboard.press('2');
    assert.equal(await stopNote.count(), 0, '運転前に停止を押しても記録しない');
    await run();
    const stopButton = page.locator('#panel .btn').filter({ hasText: '切' });
    await stopButton.dispatchEvent('pointerdown', { pointerId: 10 });
    await stopButton.dispatchEvent('pointerup', { pointerId: 10 });
    assert.equal(await stopNote.count(), 1, 'フレームをまたがない短いクリックでも迂回配線を発見できる');
    await frames(0.2);
    assert.equal(await greenLamp.count(), 1);

    await cut('PB2(停止)の1', 'PB2(停止)の2');
    await cut('R1の34', 'PB1(起動)の2');
    await click('#slow');
    await page.keyboard.down('1');
    await frames(0.6);
    await page.keyboard.up('1');
    await frames(0.6);
    assert.equal(await greenLamp.count(), 0);
    assert.equal(await page.locator('#notes li.got').filter({ hasText: '自己保持の線が無いと' }).count(), 1);
    await page.getByRole('button', { name: /寸動/ }).evaluate(el => el.click());
    await page.keyboard.down('1');
    await frames(0.6);
    await page.keyboard.up('1');
    await frames(0.6);
    assert.equal(await page.locator('#notes li.got').filter({ hasText: '寸動:' }).count(), 1,
      'ゆっくり動作でリレーが戻るまで420msかかっても、コンベアの寸動を記録');
    await click('#slow');

    await page.getByRole('button', { name: /インターロック/ }).evaluate(el => el.click());
    await page.keyboard.down('1');
    await page.keyboard.down('2');
    await frames(1);
    const lamps = await page.locator('#panel circle[fill^="url(#gOn_"]').count();
    assert.equal(lamps, 1, '同時押しでも正転・逆転の運転灯は片方だけ点灯する');
    await page.keyboard.up('1');
    await page.keyboard.up('2');

    await page.getByRole('button', { name: /配線直し/ }).evaluate(el => el.click());
    const start1 = 'PB1(起動)の1', start2 = 'PB1(起動)の2';
    const stop1 = 'PB2(停止)の1', stop2 = 'PB2(停止)の2';
    const fixNote = page.locator('#notes li.got').filter({ hasText: '配線間違いを直せた' });
    const status = page.locator('#repairStatus');
    async function join(a, b) {
      for (const terminal of [a, b]) {
        await page.getByLabel(terminal, { exact: true }).first().dispatchEvent('pointerdown');
      }
    }
    async function cut(a, b) {
      const removed = await page.locator('#panel .wire').evaluateAll((wires, ends) => {
        for (const wire of wires) {
          wire.dispatchEvent(new PointerEvent('pointerenter'));
          const label = document.getElementById('say').textContent;
          if (ends.every(end => label.includes(end))) {
            wire.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            return true;
          }
        }
        return false;
      }, [a, b]);
      assert.ok(removed, a + ' ↔ ' + b);
    }
    async function stopFan() {
      await page.keyboard.down('2');
      await frames(0.15);
      await page.keyboard.up('2');
      await frames(4);
    }
    await cut('T1の16', 'ファンの1');
    await cut('R1の14', 'R1の42');
    await join('T1の18', 'ファンの1');
    await frames(0.15);
    await page.keyboard.down('1');
    await frames(3.5);
    await page.keyboard.up('1');
    await frames(0.1);
    await stopFan();
    assert.equal(await fixNote.count(), 0, '起動ボタンを長押ししただけでは自己保持にならない');
    await cut(stop2, 'R1の13');
    // 自己保持接点を起動ボタンの両端から分岐させる解き方。
    await join(start1, 'R1の13');
    await join(start2, 'R1の14');
    await join(stop1, stop2);
    await frames(0.15);
    await run();
    await frames(3.2);
    await stopFan();
    assert.equal(await greenLamp.count(), 1);
    assert.equal(await fixNote.count(), 0, '停止ボタンが効かない配線は未クリア');
    await cut(stop1, stop2);
    await stopFan();
    assert.equal(await fixNote.count(), 0, '配線を変えたら、その配線で起動から確認する');
    await run();
    await frames(3.2);
    assert.match(await status.innerText(), /ファンが回りました/);
    await stopFan();
    assert.match(await status.innerText(), /✓ 19面クリア/);
    assert.equal(await fixNote.count(), 1, '起動ボタンを経由する配線も正解');

    await click('#reset');
    await cut('T1の16', 'ファンの1');
    await cut('R1の14', 'R1の42');
    await join('R1の14', 'R1のA1');
    await join('ファンの1', '+24V');
    await frames(0.15);
    await run();
    await frames(3.2);
    await stopFan();
    assert.doesNotMatch(await status.innerText(), /クリア/, '最初から回っているファンは不正解');
    await cut('ファンの1', '+24V');
    await join('T1の18', 'ファンの1');
    await frames(0.15);
    await run();
    await frames(3.2);
    await stopFan();
    assert.match(await status.innerText(), /✓ 19面クリア/, 'お手本どおりの配線も正解');
    await page.getByRole('button', { name: /ゼロから配線/ }).evaluate(el => el.click());
    await frames(0.1);
    assert.match(await page.locator('#stName').innerText(), /^20\./);
    assert.equal(await page.locator('#panel .wire').count(), 0);
    await page.locator('#diag .hitd').first().dispatchEvent('click');
    assert.match(await page.locator('#referenceEnds').innerText(), /線1.*24V/);
    assert.equal(await page.locator('#panel .wire').count(), 0, '配線例を選んでも盤に線を追加しない');
    for(const [a,b] of [
      ['+24V',stop1],[stop2,start1],[start2,'R1のA1'],['R1のA2','0V'],
      ['+24V','R1の23'],['R1の24','GL(運転ランプ)のX1'],['GL(運転ランプ)のX2','0V'],
      ['+24V','R1の41'],['R1の42','RL(停止ランプ)のX1'],['RL(停止ランプ)のX2','0V']
    ]) await join(a,b);
    await page.locator('#panel .brk').dispatchEvent('pointerdown');
    await frames(0.1);
    await page.keyboard.down('1');await frames(0.1);await page.keyboard.up('1');await frames(0.1);
    assert.equal(await greenLamp.count(), 0, '自己保持のない盤は起動を離すと消える');
    await stopFan();
    assert.doesNotMatch(await status.innerText(), /20面クリア/);
    await join(start1,'R1の33');await join('R1の34',start2);
    await frames(0.1);await run();await stopFan();
    assert.match(await status.innerText(), /✓ 20面クリア/);
    await click('#reset');
    assert.equal(await page.locator('#panel .wire').count(), 0);
    await page.reload();
    assert.equal(await page.locator('#notes li.got').filter({hasText:'空の盤から'}).count(),1);
    assert.equal(await fixNote.count(), 1, '再読み込み後も発見ノートにチェックが残る');
    assert.deepEqual(errors, []);
    console.log('空焚き・太い電線・始動電流・停止ボタンの迂回配線・同時押し・19・20面の動作判定を確認');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
