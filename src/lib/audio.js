/* Astral Horizon sound design. All sounds are synthesized with the Web Audio API: no files, no services.
   Ported from the original design file. */
import { getCfg as G } from "./config.js";
const cfg = new Proxy({}, { get: (_, k) => G()[k] });
// eslint-disable-next-line
export const AU={
unlock(){try{if(!this.x){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const x=this.x=new C(),n=x.createBuffer(1,x.sampleRate*2,x.sampleRate),d=n.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;this.nb=n;this.m=x.createGain();this.s=x.createGain();this.a=x.createGain();this.an=x.createAnalyser();this.an.fftSize=64;this.s.connect(this.m);this.a.connect(this.m);this.m.connect(this.an);this.an.connect(x.destination);this.vol()}
if(this.x.state==="suspended")this.x.resume();if(cfg.au.ambOn&&!this.cur&&this.pg)this.ambK(this.key(this.pg))}catch(e){}},
vol(){if(!this.x)return;const u=cfg.au,t=this.x.currentTime;this.m.gain.setTargetAtTime(u.mute?0:u.master,t,.03);this.s.gain.setTargetAtTime(u.sfx*1.8,t,.03);this.a.gain.setTargetAtTime(u.amb*1.5,t,.1)},
tn(f,d,o={}){const x=this.x,t=x.currentTime+(o.t||0),g=x.createGain(),s=x.createOscillator();s.type=o.w||"sine";s.frequency.setValueAtTime(f,t);if(o.to)s.frequency.exponentialRampToValueAtTime(o.to,t+d);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(o.v||.1,t+(o.a||.008));g.gain.exponentialRampToValueAtTime(.0001,t+d);let n=s;if(o.lp){const F=x.createBiquadFilter();F.type="lowpass";F.frequency.value=o.lp;s.connect(F);n=F}n.connect(g);g.connect(o.o||this.s);s.start(t);s.stop(t+d+.05)},
ns(d,o={}){const x=this.x,t=x.currentTime+(o.t||0),s=x.createBufferSource(),F=x.createBiquadFilter(),g=x.createGain();s.buffer=this.nb;F.type=o.ty||"bandpass";F.frequency.setValueAtTime(o.f||800,t);F.frequency.exponentialRampToValueAtTime(o.to||o.f||800,t+d);F.Q.value=o.q||1;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(o.v||.05,t+(o.a||.02));g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(F);F.connect(g);g.connect(this.s);s.start(t);s.stop(t+d+.05)},
play(k,f){if(!this.x||this.x.state!=="running"||!FX[k]||(cfg.au.mute||!cfg.au.ui)&&!f)return;const n=performance.now();this.T=this.T||{};if(this.T[k]&&n-this.T[k]<60)return;this.T[k]=n;FX[k](this)},
boot(){if(!this.x||!cfg.au.boot||cfg.au.mute)return;const x=this.x,t=x.currentTime,g=x.createGain(),F=x.createBiquadFilter();this.bt=1;F.type="lowpass";F.frequency.setValueAtTime(90,t);F.frequency.exponentialRampToValueAtTime(420,t+8);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.15,t+3);this.dr=[42,42.6,63].map(f=>{const o=x.createOscillator();o.type="sawtooth";o.frequency.value=f;o.connect(F);o.start(t);return o});F.connect(g);g.connect(this.s);this.dg=g;const p=this.po=x.createOscillator(),q=this.pgn=x.createGain();p.frequency.value=220;q.gain.value=.012;p.connect(q);q.connect(this.s);p.start(t);if(!(cfg.mot==="off"||matchMedia("(prefers-reduced-motion:reduce)").matches)){this.ns(2.8,{f:200,to:3800,v:.2,a:2.4,q:1.2,t:.8});this.tn(80,2.8,{to:900,v:.09,w:"sawtooth",lp:1200,a:2.4,t:.8})}setTimeout(()=>this.impact(),3550)},
impact(f){if(!this.x||!f&&!this.bt)return;const soft=cfg.mot==="off"||matchMedia("(prefers-reduced-motion:reduce)").matches;this.tn(70,2.2,{to:28,v:soft?.12:.4,lp:200,a:.02});if(!soft){this.ns(1.6,{ty:"lowpass",f:900,to:80,v:.2,a:.01});this.tn(2400,1.4,{to:1200,v:.02,t:.02})}},
pulse(n){if(!this.bt)return;this.tn(660+n*70,.1,{v:.04,w:"triangle"});this.tn(1320+n*140,.05,{v:.025,t:.12})},
prog(p){if(this.po&&this.bt)this.po.frequency.setTargetAtTime(220+p*660,this.x.currentTime,.1)},
chime(){[330,495,660,990].forEach((f,i)=>this.tn(f,1.6,{v:.07,t:i*.09,w:"triangle",lp:3500}));this.tn(55,2,{v:.18,lp:200});this.ns(.6,{f:400,to:3000,v:.04})},
done(){if(!this.bt)return;this.bt=0;const t=this.x.currentTime;this.pgn.gain.setTargetAtTime(0,t,.1);this.chime();this.dg.gain.setTargetAtTime(0,t+.4,.5);setTimeout(()=>[...this.dr,this.po].forEach(o=>{try{o.stop()}catch(e){}}),3000)},
key(p){return{astronaut:"h",map:"e",return:"c"}[p]||"m"},
amb(p){this.pg=p;if(!this.x||!cfg.au.ambOn)return;this.ambK(this.key(p))},
ambK(k){if(!this.x||this.ck===k&&this.cur)return;this.stopA();this.ck=k;const A=this,x=this.x,g=x.createGain(),nd=[];g.gain.setValueAtTime(0,x.currentTime);g.gain.linearRampToValueAtTime(1,x.currentTime+3);g.connect(this.a);
const N=(f,q,v,ty)=>{const s=x.createBufferSource(),F=x.createBiquadFilter(),h=x.createGain();s.buffer=A.nb;s.loop=true;F.type=ty||"lowpass";F.frequency.value=f;F.Q.value=q;h.gain.value=v;s.connect(F);F.connect(h);h.connect(g);s.start();nd.push(s);return F},
O=(f,v)=>{const o=x.createOscillator(),h=x.createGain();o.frequency.value=f;h.gain.value=v;o.connect(h);h.connect(g);o.start();nd.push(o);return o},
LF=(tg,r,d)=>{const o=x.createOscillator(),h=x.createGain();o.frequency.value=r;h.gain.value=d;o.connect(h);h.connect(tg);o.start();nd.push(o)};
if(k=="m"){N(500,.5,.12);O(60,.05);O(120.5,.025);O(180,.012)}
if(k=="h"){N(300,.5,.08);const a=O(110,.05);O(110.7,.05);O(165.3,.03);O(220,.02);LF(a.frequency,.07,3)}
if(k=="e"){const F=N(700,3,.2,"bandpass");LF(F.frequency,.09,300);O(55,.04)}
if(k=="c"){N(420,.5,.1);O(50,.05);O(100,.03);const iv=setInterval(()=>{if(A.ck=="c"&&!cfg.au.mute)A.tn(1400+Math.random()*1600,.05,{v:.02})},2600+Math.random()*2000);nd.push({stop(){clearInterval(iv)}})}
this.cur={g,nd}},
stopA(){const c=this.cur;this.cur=null;this.ck=null;if(!c)return;const t=this.x.currentTime;c.g.gain.cancelScheduledValues(t);c.g.gain.setValueAtTime(c.g.gain.value,t);c.g.gain.setTargetAtTime(0,t,.6);setTimeout(()=>c.nd.forEach(n=>{try{n.stop&&n.stop()}catch(e){}}),2800)}};
export const FX={
click:a=>{a.tn(1900,.04,{to:1300,v:.04});a.tn(420,.05,{v:.025,t:.005})},
nav:a=>{a.ns(.25,{f:500,to:2200,v:.025,q:2});a.tn(880,.12,{v:.04,to:1100,t:.05})},
confirm:a=>{a.tn(660,.12,{v:.05});a.tn(990,.2,{v:.05,t:.09})},
notify:a=>[880,1320,1760].forEach((f,i)=>a.tn(f,.5,{v:.055,t:i*.11,w:"triangle",lp:4000})),
warn:a=>{a.tn(520,.14,{v:.05,w:"square",lp:1400});a.tn(520,.14,{v:.05,w:"square",lp:1400,t:.2})},
error:a=>{a.tn(260,.32,{to:130,v:.06,w:"sawtooth",lp:700});a.tn(190,.32,{to:90,v:.045,w:"sawtooth",lp:500,t:.08})},
open:a=>{a.ns(.28,{f:300,to:1800,v:.04,q:1.5});a.tn(130,.18,{to:70,v:.09,lp:300,t:.03})},
close:a=>{a.ns(.22,{f:1800,to:300,v:.035,q:1.5});a.tn(90,.14,{v:.07,lp:250})},
scan:a=>{a.tn(300,.6,{to:2600,v:.04,w:"triangle",lp:3000,a:.1});a.ns(.6,{f:1200,to:4000,v:.02,q:6});a.tn(2600,.1,{v:.035,t:.62})}};

