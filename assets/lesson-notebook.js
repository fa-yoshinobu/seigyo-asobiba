// Shared discovery storage; accepts older files without elevator records.
function setupNotebook(app,notes,got,refresh){
  const $=id=>document.getElementById(id);
  const prefix='seigyo-asobiba.note.v1.';
  const groups=['relay','device','elevator'];
  const records={relay:new Set(),device:new Set(),elevator:new Set()};
  const memoryOnly=new Set();
  let waitForOperation=false;
  const known=new Set(notes.map(([id])=>id));
  const validId=id=>typeof id==='string'&&/^[a-z][a-z0-9_]{0,47}$/.test(id);
  const status=$('noteStatus');
  const unavailable=()=>{$('noteSaveInfo').textContent='自動保存できません。ページを閉じる前に記録を書き出してください。';};
  function remember(group,id){
    records[group].add(id);
    if(group===app&&known.has(id))got.add(id);
  }
  function restoreKey(key){
    if(!key||!key.startsWith(prefix))return;
    const [group,id]=key.slice(prefix.length).split('.');
    if(groups.includes(group)&&validId(id)&&key===prefix+group+'.'+id)remember(group,id);
  }
  function readSaved(){
    try{
      for(const group of groups)for(const id of records[group]){
        const key=prefix+group+'.'+id;
        if(!memoryOnly.has(key)&&localStorage.getItem(key)!=='1'){
          records[group].delete(id);
          if(group===app){got.delete(id);waitForOperation=true;}
        }
      }
      for(const key of Object.keys(localStorage)){
        if(key.startsWith(prefix)&&localStorage.getItem(key)==='1')restoreKey(key);
      }
    }catch{unavailable();}
  }
  function save(group,id){
    remember(group,id);
    // 発見ごとに別キーを使い、別タブの同時保存でも互いの記録を上書きしない。
    const key=prefix+group+'.'+id;
    try{localStorage.setItem(key,'1');memoryOnly.delete(key);}catch{memoryOnly.add(key);unavailable();}
  }
  readSaved();
  window.addEventListener('storage',e=>{
    if(e.key===null||e.key.startsWith(prefix)){readSaved();refresh();}
  });
  window.addEventListener('pageshow',e=>{if(e.persisted){readSaved();refresh();}});

  $('noteClear').onclick=()=>{
    const scope={relay:'カチッとリレー（全20面）',device:'機器あそび場（全9部屋）',elevator:'リレー式エレベーター'}[app];
    const question=scope+'の発見記録を、このブラウザーからすべて消去しますか？';
    if(!window.confirm(window.lessonLanguage?.text(question)??question))return;
    readSaved();
    let cleared=true;
    for(const id of records[app]){
      const key=prefix+app+'.'+id;
      try{localStorage.removeItem(key);}catch{cleared=false;unavailable();}
      memoryOnly.delete(key);
    }
    records[app].clear();got.clear();waitForOperation=true;refresh();
    status.textContent=cleared?scope+'の記録をクリアしました。':'この画面の記録をクリアしました。保存先の消去は確認できません。';
  };
  // 動作中の盤や別タブのシミュレーションが、消した直後に同じ発見を書き戻すのを防ぐ。
  for(const type of ['pointerdown','keydown','click','input'])document.addEventListener(type,e=>{
    if(e.target.closest?.('#tabs,#rooms,#panel,#diag,#timers,#reset,#ctl,#scene,#fix'))waitForOperation=false;
    if(type==='keydown'&&app==='relay'&&/^[1-4]$/.test(e.key))waitForOperation=false;
    if(type==='keydown'&&app==='elevator'&&/^[1-3]$/.test(e.key)&&!e.target.closest('input,select,textarea,button'))waitForOperation=false;
  },true);
  $('noteExport').onclick=()=>{
    readSaved();
    const backup={format:'seigyo-asobiba.notes',version:1,relay:[...records.relay].sort(),device:[...records.device].sort(),elevator:[...records.elevator].sort()};
    const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
    const link=document.createElement('a');
    link.href=url;link.download='seigyo-asobiba-notes.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    status.textContent='記録を書き出しました。';
  };
  const picker=$('noteFile');
  $('noteImport').onclick=()=>picker.click();
  picker.onchange=async()=>{
    const file=picker.files[0];
    if(!file)return;
    try{
      if(file.size>256*1024)throw new Error();
      const backup=JSON.parse(await file.text());
      if(backup?.format!=='seigyo-asobiba.notes'||backup.version!==1||
        !groups.every(group=>(group==='elevator'&&backup[group]===undefined)||(Array.isArray(backup[group])&&backup[group].every(validId))))throw new Error();
      for(const group of groups)for(const id of new Set(backup[group]||[]))save(group,id);
      refresh();
      status.textContent='記録を読み込み、今までの発見とまとめました。';
    }catch{
      status.textContent='読み込めませんでした。この教材で書き出したJSONファイルを選んでください。';
    }finally{picker.value='';}
  };
  return id=>{
    if(waitForOperation)return false;
    save(app,id);return true;
  };
}
