/* theme.js — temas de color (solo estético). Aditivo: no toca la lógica de la app.
   Cambia variables CSS y persiste en localStorage. */
'use strict';
(function () {
  const ACCENTS = [
    { a:'#b164e0', a2:'#8e24aa', n:'Morado' }, { a:'#2dd4bf', a2:'#0e7490', n:'Cian' },
    { a:'#34d399', a2:'#059669', n:'Verde' },  { a:'#fbbf24', a2:'#d97706', n:'Ámbar' },
    { a:'#fb7185', a2:'#be123c', n:'Rosa' },   { a:'#60a5fa', a2:'#1d4ed8', n:'Azul' },
    { a:'#f472b6', a2:'#a21caf', n:'Magenta' },{ a:'#a3e635', a2:'#4d7c0f', n:'Lima' },
  ];
  const BGS = [
    { n:'Noche',  bg:'#0d0b15', bg2:'#171327' }, { n:'Carbón', bg:'#0c0c0f', bg2:'#17171c' },
    { n:'Océano', bg:'#0a0f1a', bg2:'#0f1b2e' }, { n:'Vino',   bg:'#140a12', bg2:'#241020' },
  ];
  const KEY = 'paix_theme';
  const root = document.documentElement.style;
  const $ = s => document.querySelector(s);

  const rgb = h => { h = h.replace('#',''); if (h.length===3) h = h.split('').map(c=>c+c).join('');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]; };
  const darken = (hex,f) => { const [r,g,b]=rgb(hex), d=x=>Math.round(x*(1-f));
    return '#'+[d(r),d(g),d(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); };
  const textOn = hex => { const [r,g,b]=rgb(hex); return (0.299*r+0.587*g+0.114*b)>150 ? '#1a1322' : '#ffffff'; };

  function applyAccent(a, a2) { a2 = a2 || darken(a,0.4);
    root.setProperty('--accent',a); root.setProperty('--accent2',a2); root.setProperty('--accentText',textOn(a2));
    const m = document.getElementById('metaTheme'); if (m) m.content = a2; }
  function applyBg(bg, bg2) { root.setProperty('--bg',bg); root.setProperty('--bg2',bg2); }

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch(e) { return {}; } };
  const save = t => localStorage.setItem(KEY, JSON.stringify(t));

  const t = load();
  if (t.a)  applyAccent(t.a, t.a2);
  if (t.bg) applyBg(t.bg, t.bg2);

  function render() {
    const cur = load();
    const ac = $('#themeAccents');
    if (ac) { ac.innerHTML='';
      ACCENTS.forEach(c => { const d=document.createElement('div');
        d.className='sw'+((cur.a||'#b164e0')===c.a?' active':''); d.style.background='linear-gradient(145deg,'+c.a+','+c.a2+')'; d.title=c.n;
        d.onclick=()=>{ applyAccent(c.a,c.a2); const x=load(); x.a=c.a; x.a2=c.a2; save(x); render(); }; ac.appendChild(d); }); }
    const cc = $('#themeAccentCustom');
    if (cc) { cc.value = cur.a || '#b164e0';
      cc.oninput=()=>{ const a=cc.value, a2=darken(a,0.4); applyAccent(a,a2); const x=load(); x.a=a; x.a2=a2; save(x); }; }
    const bgEl = $('#themeBgs');
    if (bgEl) { bgEl.innerHTML='';
      BGS.forEach(b => { const d=document.createElement('div');
        d.className='theme-bg'+((cur.bg||'#0d0b15')===b.bg?' active':''); d.style.background='linear-gradient(145deg,'+b.bg2+','+b.bg+')'; d.title=b.n;
        d.onclick=()=>{ applyBg(b.bg,b.bg2); const x=load(); x.bg=b.bg; x.bg2=b.bg2; save(x); render(); }; bgEl.appendChild(d); }); }
    const rst = $('#themeReset');
    if (rst) rst.onclick=()=>{ localStorage.removeItem(KEY);
      ['--accent','--accent2','--accentText','--bg','--bg2'].forEach(v=>root.removeProperty(v)); render(); };
  }
  if (document.readyState !== 'loading') render();
  else document.addEventListener('DOMContentLoaded', render);
})();
