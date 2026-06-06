/* PAIX Control v2 — Web Bluetooth (local, sin nube). Protocolo verificado.
   Requiere font.js y anim.js cargados antes. Ver PAIX_PROTOCOL.md */
'use strict';

// ---- UUIDs ----------------------------------------------------------------
const WRITE_SERVICE = '2e6f1d15-f1c5-4bf6-be38-6e03817cba10';
const WRITE_CHAR    = '19e97635-4207-4c41-a78f-57a7fbd342d0'; // write-without-response
const FW_SERVICE    = '0000d0ff-3c17-d293-8e48-14fe2e4da212';
const FW_CHAR       = '0000ffd4-0000-1000-8000-00805f9b34fb';
const BATTERY_SVC   = 0x180f, BATTERY_CHAR = 0x2a19;

const CMD_CUSTOM_PREFIX = '2201';   // selector custom-view antes de cada imagen
const RING_DEFAULT = '07';
const TEXT_DUR = 90, FRAME_DUR = 140;

const PRESETS = [
  {code:'0704',emo:'🙂',name:'Smile'},{code:'070D',emo:'😉',name:'Wink'},
  {code:'070F',emo:'🙁',name:'Triste'},{code:'0710',emo:'😆',name:'XD'},
  {code:'0711',emo:'😮',name:'Sorpresa'},{code:'0709',emo:'👋',name:'Hola'},
  {code:'0718',emo:'⭐',name:'Estrella'},{code:'0717',emo:'🎧',name:'Escucha'},
  {code:'0701',emo:'🅿️',name:'Logo'},{code:'070B',emo:'🌧️',name:'Lluvia'},
  {code:'070C',emo:'☀️',name:'Sol'},{code:'070A',emo:'❄️',name:'Nieve'},
];
const RING_COLORS = [
  {h:'00',c:'#222',n:'Negro'},{h:'01',c:'#ffffff',n:'Blanco'},{h:'02',c:'#e53935',n:'Rojo'},
  {h:'03',c:'#43a047',n:'Verde'},{h:'04',c:'#1e88e5',n:'Azul'},{h:'05',c:'#00acc1',n:'Cian'},
  {h:'06',c:'#fdd835',n:'Amarillo'},{h:'07',c:'#8e24aa',n:'Morado'},{h:'08',c:'#ff7043',n:'Rojo claro'},
  {h:'09',c:'#ec407a',n:'Rosa'},
];
const EXTRAS = [
  {code:'0701',name:'Logo'},{code:'0705',name:'Armar alarma'},{code:'0706',name:'Desarmar'},
  {code:'0702',name:'Giro izq'},{code:'0703',name:'Giro dcha'},{code:'0708',name:'Stop'},
];

// ---- Estado ---------------------------------------------------------------
let connected=false;
let editorRows = new Array(14).fill(0), editorRing = RING_DEFAULT, editorPen = true;
let textRing = RING_DEFAULT;
let animFrames = [new Array(14).fill(0)], aIdx = 0, aRing = '07', aPen = true;
let playing=false, playToken=0;

const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const sleep = ms => new Promise(r=>setTimeout(r,ms));

function log(msg, cls=''){
  const el=$('#log'), t=new Date().toLocaleTimeString();
  const d=document.createElement('div'); if(cls)d.className=cls; d.textContent=`[${t}] ${msg}`;
  el.appendChild(d); el.scrollTop=el.scrollHeight;
}
function hexToBytes(h){ h=h.replace(/\s+/g,''); if(h.length%2)throw new Error('hex impar'); const a=new Uint8Array(h.length/2);
  for(let i=0;i<a.length;i++)a[i]=parseInt(h.substr(i*2,2),16); return a; }
function rowsToHex(r){ return r.map(v=>(v&0xFFFF).toString(16).toUpperCase().padStart(4,'0')).join(''); }
function imageCmd(ringHex,r){ return '23'+String(ringHex).padStart(2,'0').toUpperCase()+rowsToHex(r); }

// ---- BLE (transporte vía capa BLE: Web Bluetooth o plugin nativo) ---------
function setStatus(on){ connected=on; $('#statusDot').classList.toggle('on',on);
  const ct=$('#connTxt'); if(ct) ct.textContent=on?'On':'Off';
  $('#btnConnect').classList.toggle('hide',on); $('#btnDisconnect').classList.toggle('hide',!on);
  $('#btnConnect').textContent = on?'🔌 Conectado':'🔌 Conectar'; }

function afterConnect(info){
  setStatus(true); log('Conectado ✓ (conexión mantenida viva)','log-ok');
  if(info && info.fw!=null){ $('#fwPill').textContent='fw '+info.fw; $('#fwPill').classList.remove('hide'); log('Firmware: '+info.fw); }
  if(info && info.battery!=null){ $('#batPill').textContent=info.battery+' %'; }
}
const bleOpts = ()=>({ onBattery:p=>$('#batPill').textContent=p+' %', onDisconnect:onDisconnected });
async function connect(){
  if(!BLE.available()){ log('Bluetooth no disponible. En navegador usa Chrome por HTTPS o localhost.','log-err'); return; }
  try{ log('Buscando "PAIX"…'); afterConnect(await BLE.connect(bleOpts())); }
  catch(e){ log('Conexión cancelada/fallida: '+(e.message||e),'log-err'); }
}
async function reconnect(){
  try{ log('Reconectando…'); afterConnect(await BLE.reconnect(bleOpts())); }
  catch(e){ log('Reconexión fallida: '+(e.message||e),'log-err'); }
}
function onDisconnected(){ stopPlay(); setStatus(false);
  log('Desconectado. El badge vuelve a su logo.','log-err'); $('#btnConnect').textContent='🔌 Reconectar'; }
function disconnect(){ stopPlay(); BLE.disconnect(); setStatus(false); }
function ensureConnected(){ if(!connected){ log('No conectado. Pulsa Conectar.','log-err'); return false; } return true; }

// Único punto de escritura. Trocea en 20 B y delega en la capa BLE (WRITE_CHAR).
async function sendHex(hex, quiet=false){
  if(!ensureConnected()) return false;
  hex=hex.replace(/\s+/g,'').toUpperCase();
  let data; try{ data=hexToBytes(hex); }catch(e){ log(e.message,'log-err'); return false; }
  if(!quiet) log('TX '+hex+' ('+data.length+' B)','log-tx');
  for(let i=0;i<data.length;i+=20){
    try{ await BLE.write(data.slice(i,i+20)); }
    catch(e){ log('Error escritura: '+e.message,'log-err'); return false; }
    await sleep(12);
  }
  return true;
}
async function sendImage(rows, ringHex, quiet=true){
  if(!await sendHex(CMD_CUSTOM_PREFIX, true)) return false;
  return sendHex(imageCmd(ringHex, rows), quiet);
}

// ---- Motor de animación NATIVA (el badge la reproduce en bucle, sin streaming) ----
// Sube hasta 9 frames con cabecera 22+NN+duraciones; el firmware los cicla solo.
// Cero streaming => sin saturación => sin desconexiones. Sigue aunque cierres la app.
let curAnim = null;  // {frames, ring} subida actualmente
function durByteFromSpeed(){ const v=+($('#liveSpeed').value||6); return Math.max(1, Math.round(20 - v*1.8)); } // v1=lento(18) .. v10=rápido(2)
function showAnimBar(n){ $('#playLbl').textContent='▶ Animación en el badge ('+n+' frames) — se reproduce sola'; $('#playbar').classList.remove('hide'); }
function stopAnimation(){ $('#playbar').classList.add('hide'); curAnim=null; }
function stopPlay(){ stopAnimation(); }   // alias para los manejadores estáticos

async function uploadAnimation(frames, ringHex, label){
  if(!ensureConnected()) return;
  let fr = frames.map(f => Array.isArray(f) ? f : f.rows);
  fr = resampleFrames(fr, ANIM_MAX);
  if(fr.length<=1){ stopAnimation(); await sendImage(fr[0]||new Array(14).fill(0), ringHex, false); return; }
  const dur=durByteFromSpeed(), n=fr.length, h2=x=>x.toString(16).padStart(2,'0').toUpperCase();
  const header='22'+h2(n)+h2(dur).repeat(n);
  log('TX animación '+(label?('"'+label+'" '):'')+n+' frames (dur '+dur+')','log-tx');
  if(!await sendHex(header)) return;
  for(const f of fr){ if(!await sendHex(imageCmd(ringHex,f), true)) return; await sleep(20); }
  curAnim={frames:fr, ring:ringHex}; showAnimBar(n);
  log('Animación grabada en el badge ✓ (se reproduce sola)','log-ok');
}
async function stopOnBadge(){ stopAnimation(); await sendHex('0701'); }  // detiene: muestra el logo

// ---- Pintado de tablero (compartido) --------------------------------------
function paint(ctx, canvas, rows, ringHex, drawRing=true){
  const W=canvas.width, CELL=W/14; ctx.clearRect(0,0,W,W);
  if(drawRing){ const rc=RING_COLORS.find(c=>c.h===ringHex); ctx.save();
    ctx.strokeStyle=rc?rc.c:'#8e24aa'; ctx.lineWidth=CELL*0.5;
    ctx.beginPath(); ctx.arc(W/2,W/2,W/2-CELL*0.32,0,7); ctx.stroke(); ctx.restore(); }
  for(let y=0;y<14;y++)for(let x=0;x<14;x++){ if(!maskOK(x,y))continue;
    const cx=x*CELL+CELL/2,cy=y*CELL+CELL/2,r=CELL*0.40; ctx.beginPath(); ctx.arc(cx,cy,r,0,7);
    if((rows[y]>>(13-x))&1){ ctx.fillStyle='#fff7ad'; ctx.shadowColor='#ffe66d'; ctx.shadowBlur=drawRing?8:0; ctx.fill(); ctx.shadowBlur=0; }
    else if(drawRing){ ctx.fillStyle='#241f3a'; ctx.fill(); ctx.strokeStyle='#3a3360'; ctx.lineWidth=1; ctx.stroke(); }
  }
}
function evToCell(canvas, ev){ const b=canvas.getBoundingClientRect(), CELL=canvas.width/14;
  return { x:Math.floor((ev.clientX-b.left)*(canvas.width/b.width)/CELL),
           y:Math.floor((ev.clientY-b.top)*(canvas.height/b.height)/CELL) }; }

function attachBoard(canvas, ctx, state){
  function repaint(){ paint(ctx,canvas,state.rows,state.ring); }
  let drawing=false,last='';
  const at=ev=>{ const {x,y}=evToCell(canvas,ev),k=x+','+y; if(k===last)return; last=k; if(!maskOK(x,y))return;
    if(state.pen()) state.rows[y]|=(1<<(13-x)); else state.rows[y]&=~(1<<(13-x)); repaint(); state.onChange&&state.onChange(); };
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);drawing=true;last='';at(e);});
  canvas.addEventListener('pointermove',e=>{if(drawing)at(e);});
  canvas.addEventListener('pointerup',()=>{drawing=false;last='';});
  canvas.addEventListener('pointercancel',()=>{drawing=false;last='';});
  return repaint;
}

// ---- Swatches reutilizables ----------------------------------------------
function renderSwatches(container, getSel, onSel){
  container.innerHTML='';
  RING_COLORS.forEach(rc=>{ const d=document.createElement('div'); d.className='sw'+(rc.h===getSel()?' active':'');
    d.style.background=rc.c; d.title=rc.n; d.onclick=()=>{ onSel(rc.h); renderSwatches(container,getSel,onSel); }; container.appendChild(d); });
}

// ---- Editor principal -----------------------------------------------------
let repaintEditor;
function initEditor(){
  const c=$('#board'), ctx=c.getContext('2d');
  repaintEditor=attachBoard(c,ctx,{ get rows(){return editorRows;}, get ring(){return editorRing;}, pen:()=>editorPen,
    onChange:()=>{ if($('#autoSend').checked && connected){ clearTimeout(initEditor._t); initEditor._t=setTimeout(()=>{stopPlay();sendImage(editorRows,editorRing);},180);} } });
  repaintEditor();
}

// ---- Editor de fotogramas -------------------------------------------------
let repaintAnim;
function initAnimEditor(){
  const c=$('#animBoard'), ctx=c.getContext('2d');
  attachBoard(c,ctx,{ get rows(){return animFrames[aIdx];}, get ring(){return aRing;}, pen:()=>aPen,
    onChange:()=>{ paint(ctx,c,animFrames[aIdx],aRing); renderTimeline(); } });
  repaintAnim=()=>{ paint(ctx,c,animFrames[aIdx],aRing); renderTimeline(); };
  repaintAnim();
}
function renderTimeline(){
  const tl=$('#timeline'); tl.innerHTML=''; $('#frInfo').textContent=`${aIdx+1}/${animFrames.length}`;
  animFrames.forEach((fr,i)=>{ const cv=document.createElement('canvas'); cv.width=cv.height=44; cv.className='fr'+(i===aIdx?' active':'');
    paint(cv.getContext('2d'),cv,fr,aRing,false); cv.onclick=()=>{aIdx=i;repaintAnim();}; tl.appendChild(cv); });
}

// ---- UI: presets, extras, tabs -------------------------------------------
function renderPresets(){
  const g=$('#presetGrid'); g.innerHTML='';
  PRESETS.forEach(p=>{ const b=document.createElement('button'); b.innerHTML=`<span class="emo">${p.emo}</span>${p.name}`;
    b.onclick=()=>{ stopPlay(); sendHex(p.code); }; g.appendChild(b); });
  const eg=$('#extraGrid'); eg.innerHTML='';
  EXTRAS.forEach(p=>{ const b=document.createElement('button'); b.textContent=p.name; b.onclick=()=>{stopPlay();sendHex(p.code);}; eg.appendChild(b); });
}
function renderAnimLibrary(){
  const g=$('#animGrid'); g.innerHTML='';
  ANIMATIONS.forEach(a=>{ const b=document.createElement('button'); b.innerHTML=`<span class="emo">${a.icon}</span>${a.label}`;
    b.onclick=()=>uploadAnimation(a.build(), a.ring, a.label); g.appendChild(b); });
}
function renderEmojiFaces(){
  const g=$('#emojiGrid'); g.innerHTML='';
  EMOJI_FACES.forEach(f=>{ const b=document.createElement('button'); b.innerHTML=`<span class="emo">${f.icon}</span>${f.label}`;
    b.onclick=()=>uploadAnimation(f.build(), f.ring, f.label); g.appendChild(b); });
}
function renderTextEmojis(){
  const bar=$('#textEmojiBar'); bar.innerHTML='';
  TEXT_ICONS.forEach(ic=>{ const b=document.createElement('button'); b.textContent=ic.c; b.title=ic.n;
    b.style.fontSize='20px'; b.style.padding='8px 12px';
    b.onclick=()=>{ const inp=$('#txtInput'); const s=inp.selectionStart||inp.value.length, e=inp.selectionEnd||inp.value.length;
      inp.value=inp.value.slice(0,s)+ic.c+inp.value.slice(e); inp.focus();
      const p=s+ic.c.length; try{inp.setSelectionRange(p,p);}catch(_){} };
    bar.appendChild(b); });
}
function switchTab(name){ $$('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  $$('section[data-panel]').forEach(s=>s.classList.toggle('hide',s.dataset.panel!==name)); }

// ---- Guardado local -------------------------------------------------------
const LS='paix_designs';
const loadAll=()=>{ try{return JSON.parse(localStorage.getItem(LS)||'[]');}catch(e){return[];} };
const saveAll=a=>localStorage.setItem(LS,JSON.stringify(a));
function addDesign(d){ const a=loadAll(); a.push(d); saveAll(a); renderSaved(); log('Guardado: '+d.name,'log-ok'); }
function renderSaved(){
  const list=$('#savedList'); list.innerHTML=''; const items=loadAll();
  if(!items.length){ list.innerHTML='<div class="note">Aún no has guardado nada.</div>'; return; }
  items.forEach((it,i)=>{
    const row=document.createElement('div'); row.className='item';
    const cv=document.createElement('canvas'); cv.width=cv.height=48;
    paint(cv.getContext('2d'),cv,(it.type==='anim'?it.frames[0]:it.rows),it.ring,false); row.appendChild(cv);
    const nm=document.createElement('div'); nm.className='nm';
    nm.innerHTML=`${it.name||'Diseño'} <span class="badgeType">${it.type==='anim'?'animación':'imagen'}</span>`; row.appendChild(nm);
    const bL=document.createElement('button'); bL.textContent='Cargar'; bL.onclick=()=>loadDesign(it);
    const bS=document.createElement('button'); bS.className='primary'; bS.textContent='Enviar'; bS.onclick=()=>sendDesign(it);
    const bD=document.createElement('button'); bD.className='ghost'; bD.textContent='🗑'; bD.onclick=()=>{const a=loadAll();a.splice(i,1);saveAll(a);renderSaved();};
    row.append(bL,bS,bD); list.appendChild(row);
  });
}
function loadDesign(it){
  if(it.type==='anim'){ animFrames=it.frames.map(f=>f.slice()); aIdx=0; aRing=it.ring||'07';
    renderSwatches($('#aRingSwatches'),()=>aRing,h=>{aRing=h;repaintAnim();}); repaintAnim(); switchTab('animate'); }
  else { editorRows=it.rows.slice(); editorRing=it.ring||RING_DEFAULT;
    renderSwatches($('#ringSwatches'),()=>editorRing,h=>{editorRing=h;repaintEditor();}); repaintEditor(); switchTab('editor'); }
}
function sendDesign(it){
  if(it.type==='anim'){ uploadAnimation(it.frames, it.ring||'07', it.name); }
  else { stopAnimation(); sendImage(it.rows, it.ring||RING_DEFAULT, false); }
}

// ---- Reloj ----------------------------------------------------------------
function clockCmd(){ const d=new Date(), h=x=>x.toString(16).padStart(2,'0');
  return ('1900'+h(d.getHours())+h(d.getMinutes())+h(d.getSeconds())).toUpperCase(); }

// ---- init -----------------------------------------------------------------
function init(){
  if(!navigator.bluetooth) $('#secNote').innerHTML='⚠️ Web Bluetooth no disponible. Necesitas <b>Chrome en Android</b> y <b>HTTPS</b> (o este PC con Edge/Chrome en localhost).';
  renderPresets(); renderAnimLibrary(); renderEmojiFaces(); renderTextEmojis(); renderSaved();
  renderSwatches($('#ringSwatches'),()=>editorRing,h=>{editorRing=h;repaintEditor();});
  renderSwatches($('#txtRingSwatches'),()=>textRing,h=>{textRing=h;});
  renderSwatches($('#aRingSwatches'),()=>aRing,h=>{aRing=h;repaintAnim();});
  initEditor(); initAnimEditor();

  $('#btnConnect').onclick=()=>{ if(connected) return; BLE.remembered()? reconnect() : connect(); };
  $('#btnDisconnect').onclick=disconnect;
  $$('.tabs button').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));

  // editor principal
  $('#btnPen').onclick=()=>{editorPen=true;$('#btnPen').classList.add('primary');$('#btnErase').classList.remove('primary');};
  $('#btnErase').onclick=()=>{editorPen=false;$('#btnErase').classList.add('primary');$('#btnPen').classList.remove('primary');};
  $('#btnClear').onclick=()=>{editorRows=new Array(14).fill(0);repaintEditor();if($('#autoSend').checked&&connected){stopPlay();sendImage(editorRows,editorRing);}};
  $('#btnSendDesign').onclick=()=>{stopPlay();sendImage(editorRows,editorRing,false);};
  $('#btnSaveDesign').onclick=()=>{const n=prompt('Nombre:','Mi diseño');if(n!==null)addDesign({name:n,type:'image',rows:editorRows.slice(),ring:editorRing});};

  // texto (por páginas, nativo)
  $('#btnTextSend').onclick=()=>{ $('#liveSpeed').value=$('#txtSpeed').value; uploadAnimation(buildTextPages($('#txtInput').value), textRing, 'Texto'); };
  $('#btnTextSave').onclick=()=>{ const t=$('#txtInput').value; const n=prompt('Nombre:', t.slice(0,12)); if(n!==null) addDesign({name:n,type:'anim',frames:buildTextPages(t),ring:textRing}); };

  // editor de fotogramas
  $('#aPen').onclick=()=>{aPen=true;$('#aPen').classList.add('primary');$('#aErase').classList.remove('primary');};
  $('#aErase').onclick=()=>{aPen=false;$('#aErase').classList.add('primary');$('#aPen').classList.remove('primary');};
  $('#aClearFr').onclick=()=>{animFrames[aIdx]=new Array(14).fill(0);repaintAnim();};
  $('#aPrev').onclick=()=>{aIdx=(aIdx-1+animFrames.length)%animFrames.length;repaintAnim();};
  $('#aNext').onclick=()=>{aIdx=(aIdx+1)%animFrames.length;repaintAnim();};
  $('#aAdd').onclick=()=>{animFrames.splice(aIdx+1,0,new Array(14).fill(0));aIdx++;repaintAnim();};
  $('#aDup').onclick=()=>{animFrames.splice(aIdx+1,0,animFrames[aIdx].slice());aIdx++;repaintAnim();};
  $('#aDel').onclick=()=>{ if(animFrames.length>1){animFrames.splice(aIdx,1);aIdx=Math.min(aIdx,animFrames.length-1);} else {animFrames[0]=new Array(14).fill(0);} repaintAnim(); };
  $('#aPlay').onclick=()=>{ $('#liveSpeed').value=$('#aSpeed').value; uploadAnimation(animFrames, aRing, 'Mi animación'); };
  $('#aSave').onclick=()=>{const n=prompt('Nombre:','Mi animación');if(n!==null)addDesign({name:n,type:'anim',frames:animFrames.map(f=>f.slice()),ring:aRing,dur:FRAME_DUR});};

  // más
  $('#btnClock').onclick=()=>{stopPlay();sendHex(clockCmd());};
  $('#btnRaw').onclick=()=>{const h=$('#rawHex').value.trim();if(h){stopPlay();sendHex(h);}};
  $('#rawHex').addEventListener('keydown',e=>{if(e.key==='Enter'){const h=e.target.value.trim();if(h){stopPlay();sendHex(h);}}});
  $('#btnClearLog').onclick=()=>$('#log').innerHTML='';
  $('#btnStop').onclick=stopOnBadge;
  let _spT; $('#liveSpeed').oninput=()=>{ if(curAnim){ clearTimeout(_spT); _spT=setTimeout(()=>uploadAnimation(curAnim.frames, curAnim.ring, 'velocidad'),220); } };
  $('#btnExport').onclick=()=>{const b=new Blob([JSON.stringify(loadAll(),null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='paix-disenos.json';a.click();};
  $('#btnImport').onclick=()=>$('#fileImport').click();
  $('#fileImport').onchange=async e=>{const f=e.target.files[0];if(!f)return;
    try{const arr=JSON.parse(await f.text());if(!Array.isArray(arr))throw new Error('formato');saveAll(loadAll().concat(arr));renderSaved();log('Importados '+arr.length,'log-ok');}
    catch(err){log('Import fallido: '+err.message,'log-err');}};

  log('Listo. Pulsa Conectar.');
}
init();
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
