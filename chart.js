// Собственный свечной график ARVEX на canvas. Данные: массив {t,o,h,l,c,v}.
class CandleChart{
 constructor(canvas,opts={}){
  this.c=canvas;this.ctx=canvas.getContext("2d");
  this.data=[];this.visible=80;this.offset=0;
  this.ma=true;this.ema=false;this.vol=true;
  this.lines=[];this.cross=null;this.tfMs=900000;
  this.onCross=opts.onCross||null;
  this.col={up:"#2ee59d",down:"#ff5470",grid:"rgba(255,255,255,.06)",text:"#8890a6",ma:"#f5c451",ema:"#4f8cff",accent:"#7c5cff"};
  this.pad={l:6,r:62,t:10,b:22};
  this._raf=0;this._bind();this.resize();
 }
 setData(arr,tfMs){
  this.data=arr||[];if(tfMs)this.tfMs=tfMs;
  this.offset=Math.min(this.offset,Math.max(0,this.data.length-10));
  this.draw();
 }
 setLines(lines){this.lines=lines||[];this.draw()}
 resize(){
  const p=this.c.parentElement;if(!p)return;
  const r=p.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  this.w=Math.max(160,Math.floor(r.width));this.h=Math.max(140,Math.floor(r.height));
  this.c.width=Math.floor(this.w*dpr);this.c.height=Math.floor(this.h*dpr);
  this.c.style.width=this.w+"px";this.c.style.height=this.h+"px";
  this.ctx.setTransform(dpr,0,0,dpr,0,0);this.draw();
 }
 zoom(f){this.visible=Math.max(20,Math.min(300,Math.round(this.visible*f)));this.offset=Math.min(this.offset,Math.max(0,this.data.length-10));this.draw()}
 _geom(){
  const p=this.pad,pw=this.w-p.l-p.r,ph=this.h-p.t-p.b;
  return {pw,ph,cw:pw/this.visible,x0:p.l,y0:p.t};
 }
 _slice(){
  const end=this.data.length-Math.round(this.offset),start=Math.max(0,end-this.visible);
  return {start,end};
 }
 _bind(){
  const c=this.c;let down=null,moved=false;
  c.addEventListener("pointerdown",e=>{down={x:e.clientX,off:this.offset};moved=false;try{c.setPointerCapture(e.pointerId)}catch(_){}});
  c.addEventListener("pointermove",e=>{
   const rect=c.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
   if(down){
    const dx=e.clientX-down.x;if(Math.abs(dx)>4)moved=true;
    if(moved){const g=this._geom();this.offset=Math.max(0,Math.min(Math.max(0,this.data.length-10),down.off+dx/g.cw));this.cross=null;this.draw();return}
   }else if(e.pointerType==="mouse"){this._setCross(x,y)}
  });
  const up=e=>{
   if(down&&!moved){const rect=c.getBoundingClientRect();const x=e.clientX-rect.left,y=e.clientY-rect.top;
    if(this.cross&&Math.abs(this.cross.x-x)<this._geom().cw*1.5){this.cross=null;this.draw();this.onCross&&this.onCross(null)}else this._setCross(x,y)}
   down=null;
  };
  c.addEventListener("pointerup",up);c.addEventListener("pointercancel",()=>{down=null});
  c.addEventListener("pointerleave",e=>{if(e.pointerType==="mouse"){this.cross=null;this.draw();this.onCross&&this.onCross(null)}});
  c.addEventListener("wheel",e=>{e.preventDefault();this.zoom(e.deltaY>0?1.12:0.89)},{passive:false});
 }
 _setCross(x,y){
  const g=this._geom(),{start,end}=this._slice();
  const n=end-start,i=Math.floor((x-g.x0-(this.visible-n)*g.cw)/g.cw)+start;
  if(i<start||i>=end){this.cross=null;this.draw();return}
  this.cross={x,y,i};this.draw();this.onCross&&this.onCross(this.data[i]);
 }
 _fmt(p){
  const a=Math.abs(p);
  return p.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:a>=100?2:a>=1?3:5});
 }
 _time(t){
  const d=new Date(t),p=n=>String(n).padStart(2,"0");
  if(this.tfMs>=86400000)return p(d.getDate())+"."+p(d.getMonth()+1);
  if(this.tfMs>=14400000)return p(d.getDate())+"."+p(d.getMonth()+1)+" "+p(d.getHours())+":00";
  return p(d.getHours())+":"+p(d.getMinutes());
 }
 _sma(n){const o=[],d=this.data;let s=0;for(let i=0;i<d.length;i++){s+=d[i].c;if(i>=n)s-=d[i-n].c;o.push(i>=n-1?s/n:null)}return o}
 _ema(n){const o=[],d=this.data,k=2/(n+1);let e=null;for(let i=0;i<d.length;i++){e=e==null?d[i].c:d[i].c*k+e*(1-k);o.push(i>=n-1?e:null)}return o}
 draw(){
  if(this._raf)return;
  this._raf=requestAnimationFrame(()=>{this._raf=0;this._paint()});
 }
 _paint(){
  const ctx=this.ctx,w=this.w,h=this.h,col=this.col;
  ctx.clearRect(0,0,w,h);
  const d=this.data;
  if(!d.length){ctx.fillStyle=col.text;ctx.font="13px system-ui";ctx.textAlign="center";ctx.fillText("Загрузка графика…",w/2,h/2);return}
  const g=this._geom(),{start,end}=this._slice(),n=end-start,sl=d.slice(start,end);
  const volH=this.vol?g.ph*0.16:0,priceH=g.ph-volH-(this.vol?6:0);
  let lo=Infinity,hi=-Infinity,vmax=0;
  for(const c of sl){if(c.l<lo)lo=c.l;if(c.h>hi)hi=c.h;if(c.v>vmax)vmax=c.v}
  const padv=(hi-lo)*0.08||hi*0.002;lo-=padv;hi+=padv;
  const Y=p=>g.y0+(hi-p)/(hi-lo)*priceH, X=i=>g.x0+(this.visible-n)*g.cw+(i-start)*g.cw+g.cw/2;
  // сетка и ценовая шкала
  ctx.font="11px system-ui";ctx.textBaseline="middle";
  for(let k=0;k<=4;k++){
   const p=lo+(hi-lo)*k/4,y=Y(p);
   ctx.strokeStyle=col.grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(g.x0,y);ctx.lineTo(w-this.pad.r,y);ctx.stroke();
   ctx.fillStyle=col.text;ctx.textAlign="left";ctx.fillText(this._fmt(p),w-this.pad.r+6,y);
  }
  // время
  ctx.textAlign="center";ctx.textBaseline="top";ctx.fillStyle=col.text;
  const step=Math.max(1,Math.floor(n/4));
  for(let i=start+Math.floor(step/2);i<end;i+=step){const x=X(i);if(x<w-this.pad.r-18)ctx.fillText(this._time(d[i].t),x,h-this.pad.b+6)}
  // объём
  if(this.vol&&vmax>0){
   const vy=g.y0+g.ph;
   for(let i=start;i<end;i++){const c=d[i],bh=c.v/vmax*volH;ctx.fillStyle=(c.c>=c.o?col.up:col.down)+"55";ctx.fillRect(X(i)-g.cw*0.35,vy-bh,Math.max(1,g.cw*0.7),bh)}
  }
  // свечи
  for(let i=start;i<end;i++){
   const c=d[i],x=X(i),up=c.c>=c.o,color=up?col.up:col.down;
   ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1;
   ctx.beginPath();ctx.moveTo(x,Y(c.h));ctx.lineTo(x,Y(c.l));ctx.stroke();
   const bw=Math.max(1,g.cw*0.7),top=Y(Math.max(c.o,c.c)),bh=Math.max(1,Math.abs(Y(c.o)-Y(c.c)));
   ctx.fillRect(x-bw/2,top,bw,bh);
  }
  // индикаторы
  const line=(arr,color)=>{ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.beginPath();let on=false;for(let i=start;i<end;i++){const v=arr[i];if(v==null){on=false;continue}const x=X(i),y=Y(v);if(!on){ctx.moveTo(x,y);on=true}else ctx.lineTo(x,y)}ctx.stroke()};
  if(this.ma)line(this._sma(20),col.ma);
  if(this.ema)line(this._ema(50),col.ema);
  // линии позиций
  ctx.textBaseline="middle";
  for(const L of this.lines){
   if(L.price<lo||L.price>hi)continue;
   const y=Y(L.price);ctx.strokeStyle=L.color;ctx.setLineDash([5,4]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(g.x0,y);ctx.lineTo(w-this.pad.r,y);ctx.stroke();ctx.setLineDash([]);
   ctx.font="10px system-ui";const tw=ctx.measureText(L.label).width+10;
   ctx.fillStyle=L.color;ctx.fillRect(g.x0+4,y-8,tw,16);ctx.fillStyle="#07080d";ctx.textAlign="left";ctx.fillText(L.label,g.x0+9,y);
  }
  // последняя цена
  const last=d[d.length-1].c;
  if(last>=lo&&last<=hi){
   const y=Y(last),up=last>=d[d.length-1].o,color=up?col.up:col.down;
   ctx.strokeStyle=color;ctx.setLineDash([2,3]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(g.x0,y);ctx.lineTo(w-this.pad.r,y);ctx.stroke();ctx.setLineDash([]);
   ctx.fillStyle=color;ctx.fillRect(w-this.pad.r,y-9,this.pad.r,18);
   ctx.fillStyle="#07080d";ctx.font="bold 11px system-ui";ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText(this._fmt(last),w-this.pad.r+4,y);
  }
  // кроссхейр
  if(this.cross&&this.cross.i>=start&&this.cross.i<end){
   const c=d[this.cross.i],x=X(this.cross.i);
   ctx.strokeStyle="rgba(255,255,255,.35)";ctx.setLineDash([3,3]);ctx.lineWidth=1;
   ctx.beginPath();ctx.moveTo(x,g.y0);ctx.lineTo(x,g.y0+g.ph);ctx.moveTo(g.x0,this.cross.y);ctx.lineTo(w-this.pad.r,this.cross.y);ctx.stroke();ctx.setLineDash([]);
   const pv=lo+(hi-lo)*(1-(this.cross.y-g.y0)/priceH);
   if(pv>=lo&&pv<=hi){ctx.fillStyle=col.accent;ctx.fillRect(w-this.pad.r,this.cross.y-9,this.pad.r,18);ctx.fillStyle="#fff";ctx.font="11px system-ui";ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText(this._fmt(pv),w-this.pad.r+4,this.cross.y)}
   const tl=this._time(c.t),tw=ctx.measureText(tl).width+10;
   ctx.fillStyle=col.accent;ctx.fillRect(Math.min(w-this.pad.r-tw,Math.max(0,x-tw/2)),h-this.pad.b+2,tw,16);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(tl,Math.min(w-this.pad.r-tw/2,Math.max(tw/2,x)),h-this.pad.b+10);
  }
 }
}
