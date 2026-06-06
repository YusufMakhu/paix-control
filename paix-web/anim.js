/* anim.js — geometría y biblioteca de animaciones procedurales.
   Cargado tras font.js. Cada animación: build() -> [rows14, ...].
   Expone globals: ANIMATIONS, buildTextFrames, diskRows. */
'use strict';

function emptyRows(){ return new Array(14).fill(0); }
function fullDisc(){ return CIRCLE_MASK.slice(); }
function clip(rows){ for(let r=0;r<14;r++) rows[r]&=CIRCLE_MASK[r]; return rows; }

function diskRows(rmax){
  const rows=emptyRows();
  for(let y=0;y<14;y++)for(let x=0;x<14;x++){
    if(!maskOK(x,y))continue;
    if(Math.hypot(x-6.5,y-6.5)<=rmax) rows[y]|=(1<<(13-x));
  }
  return rows;
}
function ringBandRows(rmin,rmax){
  const rows=emptyRows();
  for(let y=0;y<14;y++)for(let x=0;x<14;x++){
    if(!maskOK(x,y))continue;
    const d=Math.hypot(x-6.5,y-6.5);
    if(d>=rmin&&d<=rmax) rows[y]|=(1<<(13-x));
  }
  return rows;
}
function colBand(start,width){
  const rows=emptyRows();
  for(let x=start;x<start+width;x++){ if(x<0||x>13)continue;
    for(let y=0;y<14;y++){ if(maskOK(x,y)) rows[y]|=(1<<(13-x)); } }
  return rows;
}
function rayRows(angleDeg){
  const rows=emptyRows(); const a=angleDeg*Math.PI/180;
  for(let t=0;t<=6.6;t+=0.5){
    const x=Math.round(6.5+Math.cos(a)*t), y=Math.round(6.5+Math.sin(a)*t);
    if(maskOK(x,y)) rows[y]|=(1<<(13-x));
  }
  return rows;
}

// --- Texto por páginas (apto para el buffer nativo de ~9 frames) -----------
// El badge solo reproduce ~9 frames en bucle, así que el texto largo se
// muestra en ventanas de 14 px que cubren toda la frase (legible y estable).
const ANIM_MAX = 9;
function buildTextPages(str){
  const base=textToCols(str);
  if(base.length<=14) return [colsWindowToRows(base, Math.floor((base.length-14)/2), 4)];  // cabe: estático centrado
  // Scroll CIRCULAR continuo: texto + un pequeño espacio de palabra (6 px); se
  // muestrea el recorrido completo en 9 pasos uniformes. El paso del último frame
  // al primero es igual que los demás => bucle sin reinicio. El hueco pequeño evita
  // que la pantalla se quede en negro (siempre hay texto a la vista).
  const cols = base.concat(new Array(6).fill(0));
  const W = cols.length, N = ANIM_MAX;                 // 9 frames (máximo del badge)
  const frames = [];
  for(let k=0;k<N;k++){
    const off = Math.round(k * W / N);
    const rows = new Array(14).fill(0);
    for(let c=0;c<14;c++){
      const cb = cols[(off + c) % W];
      for(let y=0;y<7;y++){ if((cb>>y)&1) rows[4+y] |= (1<<(13-c)); }
    }
    for(let r=0;r<14;r++) rows[r] &= CIRCLE_MASK[r];
    frames.push(rows);
  }
  return frames;
}
// Reduce cualquier lista de frames a un máximo (muestreo uniforme).
function resampleFrames(frames, max){
  if(frames.length<=max) return frames.slice();
  const out=[]; for(let i=0;i<max;i++) out.push(frames[Math.round(i*(frames.length-1)/(max-1))]);
  return out;
}

// --- Corazón (rows-strings 14x14) -----------------------------------------
function strToRows(arr){
  const rows=emptyRows();
  for(let y=0;y<14&&y<arr.length;y++){ const s=arr[y];
    for(let x=0;x<14&&x<s.length;x++){ if(s[x]==='#'&&maskOK(x,y)) rows[y]|=(1<<(13-x)); } }
  return rows;
}
const HEART_BIG = strToRows([
  "..............",
  "..............",
  "...##....##...",
  "..####..####..",
  ".############.",
  ".############.",
  ".############.",
  "..##########..",
  "...########...",
  "....######....",
  ".....####.....",
  "......##......",
  "..............",
  "..............",
]);
const HEART_SMALL = strToRows([
  "..............",
  "..............",
  "..............",
  "....#....#....",
  "...###..###...",
  "...########...",
  "...########...",
  "....######....",
  ".....####.....",
  "......##......",
  "..............",
  "..............",
  "..............",
  "..............",
]);

// --- Lluvia ----------------------------------------------------------------
function rainFrames(){
  const drops=[{x:4,p:0},{x:7,p:4},{x:9,p:8},{x:6,p:11},{x:10,p:2},{x:3,p:6}];
  const frames=[];
  for(let t=0;t<14;t++){ const rows=emptyRows();
    for(const d of drops){ const y=(t+d.p)%14; if(maskOK(d.x,y)) rows[y]|=(1<<(13-d.x));
      const y2=(y+13)%14; if(maskOK(d.x,y2)&&Math.random){} }
    frames.push(clip(rows)); }
  return frames;
}

// --- Biblioteca ------------------------------------------------------------
const ANIMATIONS = [
  { id:'breathe', label:'Latido', icon:'🫀', ring:'07', dur:110, build(){
      const seq=[]; for(let r=0;r<=7;r++)seq.push(r); for(let r=6;r>=1;r--)seq.push(r);
      return seq.map(diskRows);
  }},
  { id:'blink', label:'Parpadeo', icon:'💡', ring:'01', dur:450, build(){ return [fullDisc(), emptyRows()]; }},
  { id:'turnR', label:'Giro dcha', icon:'➡️', ring:'06', dur:90, build(){
      const f=[]; for(let s=-3;s<=14;s++) f.push(colBand(s,4)); f.push(emptyRows()); return f;
  }},
  { id:'turnL', label:'Giro izq', icon:'⬅️', ring:'06', dur:90, build(){
      const f=[]; for(let s=14;s>=-3;s--) f.push(colBand(s,4)); f.push(emptyRows()); return f;
  }},
  { id:'spin', label:'Ruleta', icon:'🌀', ring:'04', dur:70, build(){
      const f=[]; for(let a=0;a<360;a+=30) f.push(rayRows(a)); return f;
  }},
  { id:'radar', label:'Ondas', icon:'📡', ring:'05', dur:120, build(){
      const f=[]; for(let r=0;r<=7;r++) f.push(ringBandRows(r-0.6,r+0.6)); return f;
  }},
  { id:'heart', label:'Corazón', icon:'❤️', ring:'02', dur:380, build(){ return [HEART_BIG, HEART_SMALL]; }},
  { id:'rain', label:'Lluvia', icon:'🌧️', ring:'04', dur:120, build:rainFrames },
  { id:'count', label:'3·2·1', icon:'⏱️', ring:'03', dur:700, build(){
      return [charRows('3'), charRows('2'), charRows('1'),
              strToRows([ "..............","..............","...#......#...","..............",
                          "..............","..#........#..","...#......#...","....######....",
                          ".....####.....","..............","..............","..............",
                          "..............",".............."])];
  }},
];

// ===== Caritas animadas a pantalla completa (monocromas, ≤9 frames) =========
function fpx(rows,x,y){ if(maskOK(x,y)) rows[y]|=(1<<(13-x)); }
function feye(rows,cx,state){           // cx = columna izquierda del ojo (2 px de ancho)
  if(state==='closed'){ for(let x=cx-1;x<=cx+2;x++) fpx(rows,x,5); }
  else if(state==='wide'){ for(let y=3;y<=6;y++)for(let x=cx;x<=cx+1;x++) fpx(rows,x,y); }
  else if(state==='heart'){ fpx(rows,cx-1,4);fpx(rows,cx,4);fpx(rows,cx+1,4);fpx(rows,cx+2,4);
                            fpx(rows,cx-1,5);fpx(rows,cx,5);fpx(rows,cx+1,5);fpx(rows,cx+2,5);
                            fpx(rows,cx,6);fpx(rows,cx+1,6); }
  else { for(let y=4;y<=5;y++)for(let x=cx;x<=cx+1;x++) fpx(rows,x,y); }   // open
}
function fmouth(rows,type){
  if(type==='smile'){ fpx(rows,3,8);fpx(rows,10,8); fpx(rows,4,9);fpx(rows,9,9); for(let x=5;x<=8;x++)fpx(rows,x,10); }
  else if(type==='bigsmile'){ fpx(rows,2,8);fpx(rows,11,8); fpx(rows,3,9);fpx(rows,10,9); fpx(rows,4,10);fpx(rows,9,10); for(let x=5;x<=8;x++)fpx(rows,x,11); for(let x=4;x<=9;x++)fpx(rows,x,10); }
  else if(type==='laugh'){ for(let x=4;x<=9;x++)fpx(rows,x,8); for(let x=3;x<=10;x++)fpx(rows,x,9); for(let x=3;x<=10;x++)fpx(rows,x,10); for(let x=5;x<=8;x++)fpx(rows,x,11); }
  else if(type==='o'){ fpx(rows,6,8);fpx(rows,7,8); fpx(rows,5,9);fpx(rows,8,9); fpx(rows,6,10);fpx(rows,7,10); fpx(rows,5,9);fpx(rows,8,9); }
  else if(type==='kiss'){ fpx(rows,6,8); fpx(rows,5,9);fpx(rows,6,9);fpx(rows,7,9); fpx(rows,6,10); }
  else if(type==='flat'){ for(let x=4;x<=9;x++)fpx(rows,x,9); }
  else if(type==='sad'){ fpx(rows,3,10);fpx(rows,10,10); fpx(rows,4,9);fpx(rows,9,9); for(let x=5;x<=8;x++)fpx(rows,x,8); }
}
function face(l,r,m){ const rows=emptyRows(); feye(rows,3,l); feye(rows,9,r); fmouth(rows,m); return clip(rows); }

const EMOJI_FACES = [
  { id:'laugh',  label:'Risa',      icon:'😄', ring:'06', build:()=>[ face('open','open','smile'), face('open','open','laugh') ] },
  { id:'wink',   label:'Guiño',     icon:'😉', ring:'06', build:()=>[ face('open','open','smile'), face('open','closed','smile') ] },
  { id:'blink',  label:'Parpadeo',  icon:'😊', ring:'06', build:()=>[ face('open','open','smile'), face('closed','closed','smile'), face('open','open','smile') ] },
  { id:'love',   label:'Enamorado', icon:'😍', ring:'02', build:()=>[ face('heart','heart','smile'), face('heart','heart','bigsmile') ] },
  { id:'kiss',   label:'Beso',      icon:'😘', ring:'09', build:()=>[ face('open','open','smile'), face('open','closed','kiss'), face('open','closed','kiss') ] },
  { id:'surprise',label:'Sorpresa', icon:'😮', ring:'04', build:()=>[ face('wide','wide','o'), face('wide','wide','flat') ] },
  { id:'sad',    label:'Triste',    icon:'😢', ring:'04', build:()=>{
      const a=face('open','open','sad'); const b=face('open','open','sad'); fpx(b,3,7); const c=face('open','open','sad'); fpx(c,3,7); fpx(c,3,8); return [a,b,c]; } },
  { id:'cool',   label:'Cool',      icon:'😎', ring:'06', build:()=>{
      const g=emptyRows(); for(let x=2;x<=11;x++) fpx(g,x,5); for(let y=4;y<=6;y++){for(let x=2;x<=4;x++)fpx(g,x,y); for(let x=9;x<=11;x++)fpx(g,x,y);}
      const f1=clip(g.slice()); fmouth(f1,'smile'); const f2=clip(g.slice()); fmouth(f2,'bigsmile'); return [f1,f2]; } },
];
