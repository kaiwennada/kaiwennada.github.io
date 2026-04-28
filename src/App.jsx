import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

const SCALES = {
  pentatonic:[0,2,4,7,9], minor:[0,2,3,5,7,8,10], major:[0,2,4,5,7,9,11],
  dorian:[0,2,3,5,7,9,10], hirajoshi:[0,2,3,7,8], chromatic:[0,1,2,3,4,5,6,7,8,9,10,11],
};
const clamp = (v,a,b) => Math.min(b,Math.max(a,v));

const _hash = { cellSize:0.32,min:-3.2,gridN:0,cellCount:new Int32Array(0),cellStart:new Int32Array(0),sortedIdx:new Int32Array(0),buf:new Int32Array(0) };
function buildSpatialHash(pos,n,cs=0.32,he=3.4){
  const mn=-he,g=Math.ceil(he*2/cs),tot=g*g*g;
  if(_hash.cellCount.length!==tot){_hash.cellCount=new Int32Array(tot);_hash.cellStart=new Int32Array(tot+1);}else _hash.cellCount.fill(0);
  if(_hash.buf.length<n)_hash.buf=new Int32Array(n);if(_hash.sortedIdx.length<n)_hash.sortedIdx=new Int32Array(n);
  _hash.cellSize=cs;_hash.min=mn;_hash.gridN=g;
  const buf=_hash.buf,cc=_hash.cellCount;
  for(let i=0;i<n;i++){const i3=i*3,x=pos[i3],y=pos[i3+1],z=pos[i3+2],cx=Math.max(0,Math.min(g-1,Math.floor((x-mn)/cs))),cy=Math.max(0,Math.min(g-1,Math.floor((y-mn)/cs))),cz=Math.max(0,Math.min(g-1,Math.floor((z-mn)/cs)));buf[i]=cx+cy*g+cz*g*g;cc[buf[i]]++;}
  const cst=_hash.cellStart;cst[0]=0;for(let i=0;i<tot;i++)cst[i+1]=cst[i]+cc[i];
  for(let i=0;i<tot;i++)cc[i]=0;
  const sorted=_hash.sortedIdx;for(let i=0;i<n;i++){const c=buf[i];sorted[cst[c]+cc[c]++]=i;}
}
function forEachNearby(pos,i,cb){
  const g=_hash.gridN,cs=_hash.cellSize,mn=_hash.min,i3=i*3;
  const cx=Math.max(0,Math.min(g-1,Math.floor((pos[i3]-mn)/cs)));
  const cy=Math.max(0,Math.min(g-1,Math.floor((pos[i3+1]-mn)/cs)));
  const cz=Math.max(0,Math.min(g-1,Math.floor((pos[i3+2]-mn)/cs)));
  const cst=_hash.cellStart,sorted=_hash.sortedIdx;
  for(let dz=-1;dz<=1;dz++){const ncz=cz+dz;if(ncz<0||ncz>=g)continue;
    for(let dy=-1;dy<=1;dy++){const ncy=cy+dy;if(ncy<0||ncy>=g)continue;
      for(let dx=-1;dx<=1;dx++){const ncx=cx+dx;if(ncx<0||ncx>=g)continue;
        const c=ncx+ncy*g+ncz*g*g,s=cst[c],e=cst[c+1];
        for(let k=s;k<e;k++){const j=sorted[k];if(j!==i)cb(j);}}}}
}

const BEHAVIORS = {
  lorenz:{label:'lorenz',description:'the butterfly. s=10, ?=28, ß=8/3.',
    init(pos,vel,n){for(let i=0;i<n;i++){const i3=i*3;pos[i3]=(Math.random()-0.5)*20;pos[i3+1]=(Math.random()-0.5)*20;pos[i3+2]=Math.random()*30;}},
    step(pos,vel,n,t,dt,params){const s=0.085,h=Math.min(0.012,dt*params.flow*0.6);for(let i=0;i<n;i++){const i3=i*3,x=pos[i3]/s,y=pos[i3+1]/s,z=pos[i3+2]/s+25;pos[i3]=(x+10*(y-x)*h)*s;pos[i3+1]=(y+(x*(28-z)-y)*h)*s;pos[i3+2]=((z+(x*y-(8/3)*z)*h)-25)*s;}}},
  aizawa:{label:'aizawa',description:'spherical shell with inner loop.',
    init(pos,vel,n){for(let i=0;i<n;i++){const i3=i*3;pos[i3]=(Math.random()-0.5)*2;pos[i3+1]=(Math.random()-0.5)*2;pos[i3+2]=(Math.random()-0.5)*2;}},
    step(pos,vel,n,t,dt,params){const s=1.3,h=Math.min(0.05,dt*params.flow*2.2);for(let i=0;i<n;i++){const i3=i*3,x=pos[i3]/s,y=pos[i3+1]/s,z=pos[i3+2]/s;pos[i3]=(x+((z-0.7)*x-3.5*y)*h)*s;pos[i3+1]=(y+(3.5*x+(z-0.7)*y)*h)*s;pos[i3+2]=(z+(0.6+0.95*z-z*z*z/3-(x*x+y*y)*(1+0.25*z)+0.1*z*x*x*x)*h)*s;}}},
  thomas:{label:'thomas',description:'cyclically symmetric. dense filigree.',
    init(pos,vel,n){for(let i=0;i<n;i++){const i3=i*3;pos[i3]=(Math.random()-0.5)*6;pos[i3+1]=(Math.random()-0.5)*6;pos[i3+2]=(Math.random()-0.5)*6;}},
    step(pos,vel,n,t,dt,params){const b=0.19,h=Math.min(0.12,dt*params.flow*4),s=0.55;for(let i=0;i<n;i++){const i3=i*3,x=pos[i3]/s,y=pos[i3+1]/s,z=pos[i3+2]/s;pos[i3]=(x+(Math.sin(y)-b*x)*h)*s;pos[i3+1]=(y+(Math.sin(z)-b*y)*h)*s;pos[i3+2]=(z+(Math.sin(x)-b*z)*h)*s;}}},
  halvorsen:{label:'halvorsen',description:'three-fold rotational symmetry.',
    init(pos,vel,n){for(let i=0;i<n;i++){const i3=i*3;pos[i3]=(Math.random()-0.5)*3;pos[i3+1]=(Math.random()-0.5)*3;pos[i3+2]=(Math.random()-0.5)*3;}},
    step(pos,vel,n,t,dt,params){const a=1.4,h=Math.min(0.012,dt*params.flow*0.5),s=0.28;for(let i=0;i<n;i++){const i3=i*3,x=pos[i3]/s,y=pos[i3+1]/s,z=pos[i3+2]/s;pos[i3]=(x+(-a*x-4*y-4*z-y*y)*h)*s;pos[i3+1]=(y+(-a*y-4*z-4*x-z*z)*h)*s;pos[i3+2]=(z+(-a*z-4*x-4*y-x*x)*h)*s;}}},
  murmuration:{label:'murmuration',description:'topological neighbors, constant speed, scale-free coupling.',
    init(pos,vel,n,phases){for(let i=0;i<n;i++){const i3=i*3,a=Math.random()*Math.PI*2,u=Math.random()*2-1,sr=Math.sqrt(1-u*u),r=Math.cbrt(Math.random())*1.4;pos[i3]=sr*Math.cos(a)*r*1.2;pos[i3+1]=u*r*0.8;pos[i3+2]=sr*Math.sin(a)*r*1.1;const va=Math.random()*Math.PI*2,vu=Math.random()*2-1,vsr=Math.sqrt(1-vu*vu),c=0.04;vel[i3]=vsr*Math.cos(va)*c;vel[i3+1]=vu*c;vel[i3+2]=vsr*Math.sin(va)*c;if(phases){phases[i3]=0.85+Math.random()*0.3;phases[i3+1]=Math.random();}}},
    step(pos,vel,n,t,dt,params,phases){const flow=params.flow;buildSpatialHash(pos,n,0.34,3.4);const CS=0.055*flow,K=7,AW=0.085,CW=0.01,SD=0.13,SW=0.022,EP=0.0018,AA=0.011*flow;let cx=0,cy=0,cz=0;for(let i=0;i<n;i++){cx+=pos[i*3];cy+=pos[i*3+1];cz+=pos[i*3+2];}cx/=n;cy/=n;cz/=n;let mr=0;for(let i=0;i<n;i++){const dx=pos[i*3]-cx,dy=pos[i*3+1]-cy,dz=pos[i*3+2]-cz;mr+=Math.sqrt(dx*dx+dy*dy+dz*dz);}mr/=n;const nd2=new Float32Array(K),ni=new Int32Array(K),ag=Math.sin(t*0.7)*0.5+Math.sin(t*1.13)*0.3;for(let i=0;i<n;i++){const i3=i*3,px=pos[i3],py=pos[i3+1],pz=pos[i3+2];for(let k=0;k<K;k++){nd2[k]=Infinity;ni[k]=-1;}let wi=0;forEachNearby(pos,i,(j)=>{const j3=j*3,dx=pos[j3]-px,dy=pos[j3+1]-py,dz=pos[j3+2]-pz,d2=dx*dx+dy*dy+dz*dz;if(d2<nd2[wi]){nd2[wi]=d2;ni[wi]=j;let w=0,wd=nd2[0];for(let k=1;k<K;k++)if(nd2[k]>wd){wd=nd2[k];w=k;}wi=w;}});let ax=0,ay=0,az=0,mx=0,my=0,mz=0,nf=0,sx=0,sy=0,sz=0;for(let k=0;k<K;k++){const j=ni[k];if(j<0)continue;const j3=j*3;mx+=pos[j3];my+=pos[j3+1];mz+=pos[j3+2];ax+=vel[j3];ay+=vel[j3+1];az+=vel[j3+2];nf++;const d2=nd2[k];if(d2<SD*SD&&d2>1e-8){const iD=1/Math.sqrt(d2),str=(1-d2/(SD*SD))*SW;sx+=(px-pos[j3])*iD*str;sy+=(py-pos[j3+1])*iD*str;sz+=(pz-pos[j3+2])*iD*str;}}if(nf>0){const inv=1/nf;vel[i3]+=(ax*inv-vel[i3])*AW;vel[i3+1]+=(ay*inv-vel[i3+1])*AW;vel[i3+2]+=(az*inv-vel[i3+2])*AW;vel[i3]+=(mx*inv-px)*CW;vel[i3+1]+=(my*inv-py)*CW;vel[i3+2]+=(mz*inv-pz)*CW;}vel[i3]+=sx;vel[i3+1]+=sy;vel[i3+2]+=sz;const dcx=cx-px,dcy=cy-py,dcz=cz-pz,dC=Math.sqrt(dcx*dcx+dcy*dcy+dcz*dcz)+1e-6;if(dC>mr){const pull=(dC-mr)*EP;vel[i3]+=(dcx/dC)*pull;vel[i3+1]+=(dcy/dC)*pull;vel[i3+2]+=(dcz/dC)*pull;}const bp=phases[i3+1]*Math.PI*2,af=ag*Math.sin(bp+t*0.4);vel[i3]+=(px-cx)*AA*af*0.003;vel[i3+1]+=(py-cy)*AA*af*0.003;vel[i3+2]+=(pz-cz)*AA*af*0.003;vel[i3]+=(Math.random()-0.5)*0.003;vel[i3+1]+=(Math.random()-0.5)*0.003;vel[i3+2]+=(Math.random()-0.5)*0.003;const cruise=CS*phases[i3],sp=Math.sqrt(vel[i3]*vel[i3]+vel[i3+1]*vel[i3+1]+vel[i3+2]*vel[i3+2]);if(sp>1e-6){const f=cruise/sp;vel[i3]*=f;vel[i3+1]*=f;vel[i3+2]*=f;}pos[i3]+=vel[i3];pos[i3+1]+=vel[i3+1];pos[i3+2]+=vel[i3+2];}},},
  vortex:{label:'vortex',description:'rotation around Y with radial noise.',
    init(pos,vel,n){for(let i=0;i<n;i++){const i3=i*3,a=Math.random()*Math.PI*2,r=0.3+Math.random()*2.3;pos[i3]=Math.cos(a)*r;pos[i3+1]=(Math.random()-0.5)*3.5;pos[i3+2]=Math.sin(a)*r;vel[i3]=vel[i3+1]=vel[i3+2]=0;}},
    step(pos,vel,n,t,dt,params){const h=dt*params.flow;for(let i=0;i<n;i++){const i3=i*3,x=pos[i3],z=pos[i3+2],r=Math.sqrt(x*x+z*z)||0.01,omega=1.6/(r*0.7+0.4),c=Math.cos(omega*h),s=Math.sin(omega*h);pos[i3]=x*c-z*s;pos[i3+2]=x*s+z*c;pos[i3+1]+=Math.sin(t*0.5+i*0.07)*h*0.25;const r2=Math.sqrt(pos[i3]*pos[i3]+pos[i3+2]*pos[i3+2]),tgt=1.5;pos[i3]+=(pos[i3]/(r2+0.01))*(tgt-r2)*0.01;pos[i3+2]+=(pos[i3+2]/(r2+0.01))*(tgt-r2)*0.01;}}},
  lightning:{label:'lightning',description:'sudden branching flashes and rapid outward bursts.',
    init(pos,vel,n,phases){for(let i=0;i<n;i++){const i3=i*3;pos[i3]=(Math.random()-0.5)*0.6;pos[i3+1]=(Math.random()-0.5)*0.6;pos[i3+2]=(Math.random()-0.5)*0.6;vel[i3]=(Math.random()-0.5)*0.002;vel[i3+1]=(Math.random()-0.5)*0.002;vel[i3+2]=(Math.random()-0.5)*0.002;phases[i3]=Math.random();phases[i3+1]=Math.random();phases[i3+2]=Math.random();}},
    step(pos,vel,n,t,dt,params){const flow=params.flow,burstProb=0.0009*flow,branchProb=0.002*flow,damp=0.985;for(let i=0;i<n;i++){const i3=i*3; // occasional burst
        if(Math.random()<burstProb){const a=Math.random()*Math.PI*2,phi=(Math.random()-0.5)*Math.PI/6;const sp=0.6+Math.random()*1.6;vel[i3]+=Math.cos(a)*Math.cos(phi)*sp;vel[i3+1]+=Math.sin(phi)*sp*0.6;vel[i3+2]+=Math.sin(a)*Math.cos(phi)*sp;}
        // branching: nearby particle influences create zig-zag
        if(Math.random()<branchProb){const j=(i*37)%n;const j3=j*3;vel[i3]+=(pos[i3]-pos[j3])*0.02;vel[i3+1]+=(pos[i3+1]-pos[j3+1])*0.02;vel[i3+2]+=(pos[i3+2]-pos[j3+2])*0.02;}
        // integrate with damping
        vel[i3]*=damp;vel[i3+1]*=damp;vel[i3+2]*=damp;pos[i3]+=vel[i3]*dt*60;pos[i3+1]+=vel[i3+1]*dt*60;pos[i3+2]+=vel[i3+2]*dt*60;
        // wrap back if too far
        const r2=pos[i3]*pos[i3]+pos[i3+1]*pos[i3+1]+pos[i3+2]*pos[i3+2]; if(r2>36){pos[i3]*=0.2;pos[i3+1]*=0.2;pos[i3+2]*=0.2;vel[i3]=vel[i3+1]=vel[i3+2]=0;}}
    },
  curl:{label:'curl noise',description:'fluid-like divergence-free flow.',
    init(pos,vel,n){for(let i=0;i<n;i++){const i3=i*3;pos[i3]=(Math.random()-0.5)*4;pos[i3+1]=(Math.random()-0.5)*4;pos[i3+2]=(Math.random()-0.5)*1.5;}},
    step(pos,vel,n,t,dt,params){const h=dt*params.flow*0.9,f=0.45,tt=t*0.18;for(let i=0;i<n;i++){const i3=i*3,x=pos[i3],y=pos[i3+1],z=pos[i3+2];pos[i3]+=(Math.sin(y*f+tt)-Math.cos(z*f-tt*0.7))*h;pos[i3+1]+=(Math.sin(z*f+tt*1.1)-Math.cos(x*f+tt*0.9))*h;pos[i3+2]+=(Math.sin(x*f-tt*0.6)-Math.cos(y*f+tt*1.3))*h*0.5;const r=Math.sqrt(x*x+y*y+z*z);if(r>3){const k=(r-3)*0.04;pos[i3]-=(x/r)*k;pos[i3+1]-=(y/r)*k;pos[i3+2]-=(z/r)*k;}}}},
  flock:{label:'flock',description:'O(n) boids — cohesion, alignment, jitter.',
    init(pos,vel,n){for(let i=0;i<n;i++){const i3=i*3;pos[i3]=(Math.random()-0.5)*3;pos[i3+1]=(Math.random()-0.5)*3;pos[i3+2]=(Math.random()-0.5)*3;const a=Math.random()*Math.PI*2;vel[i3]=Math.cos(a)*0.02;vel[i3+1]=Math.sin(a)*0.02;vel[i3+2]=(Math.random()-0.5)*0.02;}},
    step(pos,vel,n,t,dt,params){const flow=params.flow,tx=Math.sin(t*0.21)*2.6,ty=Math.sin(t*0.29)*1.9,tz=Math.sin(t*0.17)*2.4,TP=0.0028*flow,AW=0.08,SO=[1,7,29,73,167],SD=0.035,SK=0.013,MN=0.04*flow,MX=0.14*flow,DP=0.992;for(let i=0;i<n;i++){const i3=i*3,px=pos[i3],py=pos[i3+1],pz=pos[i3+2];vel[i3]+=(tx-px)*TP;vel[i3+1]+=(ty-py)*TP;vel[i3+2]+=(tz-pz)*TP;const nb=(i+47)%n,n3=nb*3;vel[i3]+=(vel[n3]-vel[i3])*AW;vel[i3+1]+=(vel[n3+1]-vel[i3+1])*AW;vel[i3+2]+=(vel[n3+2]-vel[i3+2])*AW;for(let k=0;k<SO.length;k++){const j=(i+SO[k])%n,j3=j*3,dx=px-pos[j3],dy=py-pos[j3+1],dz=pz-pos[j3+2],d2=dx*dx+dy*dy+dz*dz;if(d2<SD&&d2>1e-8){const iD=1/Math.sqrt(d2),s=(1-d2/SD)*SK;vel[i3]+=dx*iD*s;vel[i3+1]+=dy*iD*s;vel[i3+2]+=dz*iD*s;}}vel[i3]+=(Math.random()-0.5)*0.006*flow;vel[i3+1]+=(Math.random()-0.5)*0.006*flow;vel[i3+2]+=(Math.random()-0.5)*0.006*flow;vel[i3]*=DP;vel[i3+1]*=DP;vel[i3+2]*=DP;const sp=Math.sqrt(vel[i3]*vel[i3]+vel[i3+1]*vel[i3+1]+vel[i3+2]*vel[i3+2]);if(sp>MX){const f=MX/sp;vel[i3]*=f;vel[i3+1]*=f;vel[i3+2]*=f;}else if(sp<MN&&sp>1e-5){const f=MN/sp;vel[i3]*=f;vel[i3+1]*=f;vel[i3+2]*=f;}pos[i3]+=vel[i3];pos[i3+1]+=vel[i3+1];pos[i3+2]+=vel[i3+2];}}},
};
const BEHAVIOR_ORDER = ['lorenz','aizawa','thomas','halvorsen','murmuration','lightning','vortex','curl','flock'];

function makeIR(ctx,dur=2.5,dec=2.2){const rate=ctx.sampleRate,len=Math.max(1,Math.floor(rate*dur)),buf=ctx.createBuffer(2,len,rate);for(let ch=0;ch<2;ch++){const d=buf.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,dec);}return buf;}
function makeDot(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(0.3,'rgba(255,255,255,0.6)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);const t=new THREE.CanvasTexture(c);t.needsUpdate=true;return t;}

export default function App() {
  const [running, setRunning] = useState(false);
  const [behavior, setBehavior] = useState('lorenz');
  const [motion, setMotion] = useState({ particleCount:8000, flow:1.0, pointSize:0.05 });
  const [pitch, setPitch] = useState({ centerFreq:220, spread:2400, scale:'pentatonic', voiceCount:8 });
  const [mix, setMix] = useState({ volume:0.5, reverb:0.35 });
  const [oscP, setOscP] = useState([
    { wave:'sawtooth', oct:0,  det:0,  vol:0.75, on:true },
    { wave:'triangle', oct:-1, det:7,  vol:0.40, on:true },
    { wave:'sine',     oct:1,  det:-5, vol:0.25, on:true },
  ]);
  const [filterP, setFilterP] = useState({ type:'lowpass', cutoff:1400, res:3.5, envAmt:0.5 });
  const [adsrP, setAdsrP] = useState({ a:0.06, d:0.3, s:0.70, r:1.5 });
  const [lfoP, setLfoP] = useState({ on:true, rate:0.8, depth:0.4, target:'filter', wave:'sine' });
  const [selOsc, setSelOsc] = useState(0);
  const mountRef = useRef(null), engineRef = useRef(null), dataRef = useRef({ positions:null, velocities:null, n:0 });
  const rafRef = useRef(null), behaviorRef = useRef(behavior);
  const motionRef = useRef(motion), pitchRef = useRef(pitch), mixRef = useRef(mix);
  const oscPRef = useRef(oscP), filterPRef = useRef(filterP), adsrPRef = useRef(adsrP), lfoPRef = useRef(lfoP);
  const camRef = useRef({ yaw:0.3, pitch:0.2, dist:6, autoYaw:true, lastInteract:0 });
  const dragRef = useRef({ active:false, x:0, y:0 });
  const ctxRef = useRef(null), synthRef = useRef(null);
  const [audioSrc, setAudioSrc] = useState('synth');
  const [audioStatus, setAudioStatus] = useState('');
  const [reactivity, setReactivity] = useState(1.0);
  const analyserRef = useRef(null), freqDataRef = useRef(new Uint8Array(128));
  const mediaNodeRef = useRef(null), mediaStreamRef = useRef(null);
  const bufSrcRef = useRef(null), reactRef = useRef({ amp:0, bass:0, mid:0, treble:0, bassPeak:0 });
  const audioSrcRef = useRef('synth');
  useEffect(()=>{ audioSrcRef.current=audioSrc; },[audioSrc]);
  useEffect(()=>{ behaviorRef.current=behavior; },[behavior]);
  useEffect(()=>{ motionRef.current=motion; },[motion]);
  useEffect(()=>{ pitchRef.current=pitch; },[pitch]);
  useEffect(()=>{ mixRef.current=mix; },[mix]);
  useEffect(()=>{ oscPRef.current=oscP; liveUpdateOscs(); },[oscP]);
  useEffect(()=>{ filterPRef.current=filterP; liveUpdateFilter(); },[filterP]);
  useEffect(()=>{ adsrPRef.current=adsrP; },[adsrP]);
  useEffect(()=>{ lfoPRef.current=lfoP; liveUpdateLFO(); },[lfoP]);
  const liveUpdateOscs = () => { const syn=synthRef.current, ctx=ctxRef.current; if(!syn||!ctx) return; syn.voices.forEach(v => { for(let i=0;i<3;i++){const op=oscPRef.current[i];try{ v.oscs[i].type=op.wave; }catch{}v.oscs[i].detune.setTargetAtTime(op.det,ctx.currentTime,0.05);v.oscGains[i].gain.setTargetAtTime(op.on?op.vol:0,ctx.currentTime,0.05);}}); };
  const liveUpdateFilter = () => { const syn=synthRef.current, ctx=ctxRef.current; if(!syn||!ctx) return; syn.voices.forEach(v=>{try{ v.filter.type=filterPRef.current.type; }catch{}v.filter.Q.setTargetAtTime(filterPRef.current.res,ctx.currentTime,0.1);}); };
  const liveUpdateLFO = () => { const syn=synthRef.current; if(!syn) return; syn.lfoOsc.type=lfoPRef.current.wave; syn.lfoOsc.frequency.value=lfoPRef.current.rate; reconnectLFO(syn); };
  const reconnectLFO = (syn) => { const lp=lfoPRef.current; try{ syn.lfoGain.disconnect(); }catch{} if(!lp.on){ syn.lfoGain.gain.value=0; return; } if(lp.target==='filter'){syn.lfoGain.gain.value=lp.depth*2200;syn.voices.forEach(v=>syn.lfoGain.connect(v.filter.frequency));}else if(lp.target==='pitch'){syn.lfoGain.gain.value=lp.depth*220;syn.voices.forEach(v=>v.oscs.forEach(o=>syn.lfoGain.connect(o.detune)));}else{syn.lfoGain.gain.value=lp.depth*0.65;syn.voices.forEach(v=>syn.lfoGain.connect(v.ampMod.gain));} };
  useEffect(()=>{
    const lnk=document.createElement('link');lnk.rel='stylesheet';lnk.href='https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,500&family=IBM+Plex+Mono:wght@300;400;600&display=swap';document.head.appendChild(lnk);
    const st=document.createElement('style');
    st.textContent=`.ms-lay{display:flex;flex-direction:column;height:100vh;}.ms-vp{flex:1 1 auto;min-height:0;position:relative;overflow:hidden;}.ms-ctrl{flex:0 0 auto;width:100%;max-height:55vh;overflow-y:auto;padding:16px 18px 28px;background:linear-gradient(180deg,rgba(12,10,16,.97),rgba(8,7,13,1));border-top:1px solid rgba(200,180,140,.08);}.ms-ctrl::-webkit-scrollbar{width:4px}.ms-ctrl::-webkit-scrollbar-thumb{background:rgba(232,227,211,.1);border-radius:2px}@media(min-width:900px){.ms-lay{flex-direction:row}.ms-ctrl{width:360px;max-height:none;height:100%;border-top:none;border-left:1px solid rgba(200,180,140,.08)}}`;
    document.head.appendChild(st);
    return()=>{ try{document.head.removeChild(lnk);}catch{} try{document.head.removeChild(st);}catch{} };
  },[]);
  useEffect(()=>{
    const mount=mountRef.current; if(!mount) return;
    const scene=new THREE.Scene(),W=mount.clientWidth,H=mount.clientHeight;
    const camera=new THREE.PerspectiveCamera(55,W/Math.max(1,H),0.01,100);camera.position.set(0,0,6);
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(W,H);renderer.setClearColor(0,0);
    mount.appendChild(renderer.domElement);renderer.domElement.style.touchAction='none';renderer.domElement.style.display='block';
    const geo=new THREE.BufferGeometry();
    const mat=new THREE.PointsMaterial({size:motionRef.current.pointSize,map:makeDot(),transparent:true,opacity:0.78,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true,vertexColors:true});
    scene.add(new THREE.Points(geo,mat));
    engineRef.current={scene,camera,renderer,geo,mat};
    allocate(motionRef.current.particleCount);applyInit(behaviorRef.current);
    const onResize=()=>{const W2=mount.clientWidth,H2=mount.clientHeight;if(!W2||!H2)return;renderer.setSize(W2,H2);camera.aspect=W2/H2;camera.updateProjectionMatrix();};
    window.addEventListener('resize',onResize);const sid=setTimeout(onResize,60);
    return()=>{clearTimeout(sid);window.removeEventListener('resize',onResize);try{mount.removeChild(renderer.domElement);}catch{}geo.dispose();mat.dispose();if(mat.map)mat.map.dispose();renderer.dispose();engineRef.current=null;};
  },[]);
  const allocate = useCallback((n)=>{
    const eng=engineRef.current; if(!eng)return;
    const pos=new Float32Array(n*3),vel=new Float32Array(n*3),prev=new Float32Array(n*3),phases=new Float32Array(n*3),cols=new Float32Array(n*3);
    for(let i=0;i<n;i++){const i3=i*3,h=18+(i/n)*28+(Math.random()-0.5)*6,c=new THREE.Color();c.setHSL(h/360,0.72,0.58);cols[i3]=c.r;cols[i3+1]=c.g;cols[i3+2]=c.b;phases[i3]=Math.random();phases[i3+1]=Math.random();phases[i3+2]=Math.random();}
    eng.geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    eng.geo.setAttribute('color',new THREE.BufferAttribute(cols,3));
    eng.geo.attributes.position.usage=THREE.DynamicDrawUsage;
    eng.geo.setDrawRange(0,n);
    dataRef.current={positions:pos,velocities:vel,prevPositions:prev,phases,n};
  },[]);
  const applyInit = useCallback((name)=>{ const d=dataRef.current; if(!d.positions)return; const b=BEHAVIORS[name]; if(!b)return; b.init(d.positions,d.velocities,d.n,d.phases); const eng=engineRef.current; if(eng)eng.geo.attributes.position.needsUpdate=true; },[]);
  useEffect(()=>{ allocate(motion.particleCount); applyInit(behaviorRef.current); },[motion.particleCount]);
  useEffect(()=>{ applyInit(behavior); },[behavior]);
  useEffect(()=>{ const eng=engineRef.current; if(eng)eng.mat.size=motion.pointSize; },[motion.pointSize]);
  const buildVoice = (ctx, bus) => {
    const mix=ctx.createGain(); mix.gain.value=0.3;
    const oscs=[],oscGains=[];
    for(let i=0;i<3;i++){const op=oscPRef.current[i], osc=ctx.createOscillator();osc.type=op.wave; osc.detune.value=op.det;const g=ctx.createGain(); g.gain.value=op.on?op.vol:0;osc.connect(g); g.connect(mix); osc.start();oscs.push(osc); oscGains.push(g);}
    const filter=ctx.createBiquadFilter();filter.type=filterPRef.current.type; filter.frequency.value=filterPRef.current.cutoff; filter.Q.value=filterPRef.current.res;
    const env=ctx.createGain(); env.gain.value=0;
    const ampMod=ctx.createGain(); ampMod.gain.value=1;
    const pan=ctx.createStereoPanner();
    mix.connect(filter); filter.connect(env); env.connect(ampMod); ampMod.connect(pan); pan.connect(bus);
    return { oscs, oscGains, mix, filter, env, ampMod, pan };
  };
  const startAudio = useCallback(async()=>{
    if(ctxRef.current)return;
    const AC=window.AudioContext||window.webkitAudioContext;
    const ctx=new AC(); await ctx.resume(); ctxRef.current=ctx;
    const masterGain=ctx.createGain(); masterGain.gain.value=0;
    const comp=ctx.createDynamicsCompressor(); comp.threshold.value=-14; comp.knee.value=12; comp.ratio.value=4; comp.attack.value=0.01; comp.release.value=0.2;
    const conv=ctx.createConvolver(); conv.buffer=makeIR(ctx,3.2,2.8);
    const wet=ctx.createGain(); wet.gain.value=mixRef.current.reverb;
    const dry=ctx.createGain(); dry.gain.value=Math.max(0.2,1-mixRef.current.reverb*0.5);
    const bus=ctx.createGain(); bus.gain.value=1;
    bus.connect(comp); comp.connect(dry); comp.connect(conv); conv.connect(wet);
    dry.connect(masterGain); wet.connect(masterGain); masterGain.connect(ctx.destination);
    const lfoOsc=ctx.createOscillator(); lfoOsc.type=lfoPRef.current.wave; lfoOsc.frequency.value=lfoPRef.current.rate;
    const lfoGain=ctx.createGain(); lfoGain.gain.value=0;
    lfoOsc.connect(lfoGain); lfoOsc.start();
    const voices=[];
    for(let i=0;i<pitchRef.current.voiceCount;i++) voices.push(buildVoice(ctx,bus));
    const syn={ voices, lfoOsc, lfoGain, masterGain, bus, comp, conv, wet, dry };
    synthRef.current=syn;
    reconnectLFO(syn);
    const now=ctx.currentTime,a=Math.max(0.001,adsrPRef.current.a),d=Math.max(0.001,adsrPRef.current.d),s=adsrPRef.current.s;
    voices.forEach(v=>{ v.env.gain.setValueAtTime(0,now); v.env.gain.linearRampToValueAtTime(1,now+a); v.env.gain.linearRampToValueAtTime(s,now+a+d); });
    masterGain.gain.setTargetAtTime(mixRef.current.volume,now,0.4);
  },[]);
  const stopAudio = useCallback(()=>{
    const ctx=ctxRef.current,syn=synthRef.current; if(!ctx||!syn)return;
    const now=ctx.currentTime,r=Math.max(0.1,adsrPRef.current.r);
    syn.voices.forEach(v=>{ try{v.env.gain.cancelScheduledValues(now);v.env.gain.setValueAtTime(adsrPRef.current.s,now);v.env.gain.linearRampToValueAtTime(0,now+r);}catch{} });
    syn.masterGain.gain.setTargetAtTime(0,now,0.12);
    setTimeout(()=>{
      const s=synthRef.current; if(!s)return;
      try{s.lfoOsc.stop();}catch{}
      s.voices?.forEach(v=>{ v.oscs?.forEach(o=>{try{o.stop();}catch{} try{o.disconnect();}catch{}}); [v.oscGains,v.mix,v.filter,v.env,v.ampMod,v.pan].flat().filter(Boolean).forEach(n=>{try{n.disconnect();}catch{}}); });
      [s.lfoGain,s.lfoOsc,s.bus,s.comp,s.conv,s.wet,s.dry,s.masterGain].forEach(n=>{try{n?.disconnect();}catch{}});
      try{ctx.close();}catch{}
      ctxRef.current=null; synthRef.current=null;
    },Math.max(1500,(r+0.5)*1000));
  },[]);
  useEffect(()=>()=>{ if(ctxRef.current)stopAudio(); if(rafRef.current)cancelAnimationFrame(rafRef.current); },[stopAudio]);
  const ensureCtx = useCallback(async()=>{ if(ctxRef.current)return ctxRef.current; const AC=window.AudioContext||window.webkitAudioContext; const ctx=new AC(); await ctx.resume(); ctxRef.current=ctx; return ctx; },[]);
  const tearExternal = useCallback(()=>{
    if(bufSrcRef.current){try{bufSrcRef.current.stop();}catch{} bufSrcRef.current=null;}
    if(mediaStreamRef.current){mediaStreamRef.current.getTracks().forEach(t=>{try{t.stop();}catch{}}); mediaStreamRef.current=null;}
    if(mediaNodeRef.current){try{mediaNodeRef.current.disconnect();}catch{} mediaNodeRef.current=null;}
    if(analyserRef.current){try{analyserRef.current.disconnect();}catch{} analyserRef.current=null;}
    reactRef.current={amp:0,bass:0,mid:0,treble:0,bassPeak:0};
  },[]);
  const startMic = useCallback(async()=>{
    try{ setAudioStatus('requesting mic...'); tearExternal();
      const ctx=await ensureCtx(), stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      mediaStreamRef.current=stream;
      const src=ctx.createMediaStreamSource(stream), an=ctx.createAnalyser(); an.fftSize=256; an.smoothingTimeConstant=0.75;
      src.connect(an); mediaNodeRef.current=src; analyserRef.current=an;
      setAudioSrc('mic'); setAudioStatus('listening to microphone');
    }catch(e){setAudioStatus('mic error: '+(e.message||e)); setAudioSrc('synth');}
  },[ensureCtx,tearExternal]);
  const startTab = useCallback(async()=>{
    if(!navigator.mediaDevices?.getDisplayMedia){setAudioStatus('not supported in this browser');return;}
    try{ setAudioStatus('share a tab & tick "share audio"...'); tearExternal();
      const ctx=await ensureCtx(), stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});
      if(!stream.getAudioTracks().length){stream.getTracks().forEach(t=>t.stop());setAudioStatus('no audio -- enable "share tab audio"');return;}
      stream.getVideoTracks().forEach(t=>t.stop());
      const aStream=new MediaStream(stream.getAudioTracks()); mediaStreamRef.current=aStream;
      const src=ctx.createMediaStreamSource(aStream), an=ctx.createAnalyser(); an.fftSize=256; an.smoothingTimeConstant=0.75;
      src.connect(an); mediaNodeRef.current=src; analyserRef.current=an;
      stream.getAudioTracks()[0].addEventListener('ended',()=>{tearExternal();setAudioSrc('synth');setAudioStatus('sharing ended');});
      setAudioSrc('tab'); setAudioStatus('listening to tab');
    }catch(e){setAudioStatus('tab error: '+(e.message||e));}
  },[ensureCtx,tearExternal]);
  const loadFile = useCallback(async(file)=>{
    if(!file)return;
    try{ setAudioStatus('decoding '+file.name+'...'); tearExternal();
      const ctx=await ensureCtx(), ab=await file.arrayBuffer();
      const buf=await new Promise((res,rej)=>{try{const p2=ctx.decodeAudioData(ab.slice(0),res,rej);if(p2?.then)p2.then(res,rej);}catch(e){rej(e);}});
      const src=ctx.createBufferSource(); src.buffer=buf; src.loop=true;
      const an=ctx.createAnalyser(); an.fftSize=256; an.smoothingTimeConstant=0.75;
      src.connect(an); an.connect(ctx.destination); src.start(0);
      bufSrcRef.current=src; mediaNodeRef.current=src; analyserRef.current=an;
      setAudioSrc('file'); setAudioStatus('playing: '+file.name+' ('+buf.duration.toFixed(1)+'s)');
    }catch(e){setAudioStatus('file failed: '+(e.message||e)); setAudioSrc('synth');}
  },[ensureCtx,tearExternal]);
  const switchSynth = useCallback(()=>{ tearExternal(); setAudioSrc('synth'); setAudioStatus(''); },[tearExternal]);
  const onPD = e=>{const t=e.touches?.[0]||e;dragRef.current={active:true,x:t.clientX,y:t.clientY};camRef.current.autoYaw=false;camRef.current.lastInteract=performance.now();};
  const onPM = e=>{if(!dragRef.current.active)return;const t=e.touches?.[0]||e,dx=t.clientX-dragRef.current.x,dy=t.clientY-dragRef.current.y;dragRef.current.x=t.clientX;dragRef.current.y=t.clientY;camRef.current.yaw+=dx*0.006;camRef.current.pitch=clamp(camRef.current.pitch-dy*0.006,-1.3,1.3);camRef.current.lastInteract=performance.now();};
  const onPU = ()=>{ dragRef.current.active=false; };
  useEffect(()=>{
    let last=performance.now();
    const tick=(now)=>{
      rafRef.current=requestAnimationFrame(tick);
      const dt=Math.min(0.035,(now-last)/1000); last=now;
      const eng=engineRef.current, d=dataRef.current; if(!eng||!d.positions)return;
      const an=analyserRef.current;
      if(an){const data=freqDataRef.current; an.getByteFrequencyData(data);
        let bS=0,mS=0,tS=0;for(let k=0;k<3;k++)bS+=data[k];for(let k=3;k<17;k++)mS+=data[k];for(let k=17;k<64;k++)tS+=data[k];
        const bass=bS/3/255,mid=mS/14/255,treble=tS/47/255,amp=(bass+mid+treble)/3;
        const r=reactRef.current; r.bass=r.bass*0.5+bass*0.5; r.mid=r.mid*0.7+mid*0.3; r.treble=r.treble*0.7+treble*0.3; r.amp=r.amp*0.75+amp*0.25; r.bassPeak=Math.max(r.bassPeak*0.85,bass);
      }
      if(d.prevPositions)d.prevPositions.set(d.positions);
      const reactive=audioSrcRef.current!=='synth'&&analyserRef.current;
      const rBoost=reactive?reactRef.current.amp*reactivity*2.5:0;
      const effP=reactive?{...motionRef.current,flow:motionRef.current.flow*(1+rBoost)}:motionRef.current;
      const b=BEHAVIORS[behaviorRef.current]; if(b)b.step(d.positions,d.velocities,d.n,now/1000,dt,effP,d.phases);
      if(reactive&&reactRef.current.bassPeak>0.15){
        const pulse=reactRef.current.bassPeak*0.025*reactivity;
        for(let i=0;i<d.n;i++){const i3=i*3,x=d.positions[i3],y=d.positions[i3+1],z=d.positions[i3+2],r2=Math.sqrt(x*x+y*y+z*z)+0.01;d.positions[i3]+=(x/r2)*pulse;d.positions[i3+1]+=(y/r2)*pulse;d.positions[i3+2]+=(z/r2)*pulse;}
      }
      eng.geo.attributes.position.needsUpdate=true;
      const cam=camRef.current;
      if(cam.autoYaw)cam.yaw+=dt*0.12;
      if(!cam.autoYaw&&now-cam.lastInteract>4000)cam.autoYaw=true;
      const cp=Math.cos(cam.pitch),sp=Math.sin(cam.pitch);
      eng.camera.position.set(Math.sin(cam.yaw)*cp*cam.dist,sp*cam.dist,Math.cos(cam.yaw)*cp*cam.dist);
      eng.camera.lookAt(0,0,0);
      eng.renderer.render(eng.scene,eng.camera);
      const ctx=ctxRef.current, syn=synthRef.current;
      const isSynth=audioSrcRef.current==='synth';
      if(ctx&&syn){
        syn.masterGain.gain.setTargetAtTime(isSynth?mixRef.current.volume:0,ctx.currentTime,0.08);
        syn.wet.gain.setTargetAtTime(mixRef.current.reverb,ctx.currentTime,0.15);
        syn.dry.gain.setTargetAtTime(Math.max(0.2,1-mixRef.current.reverb*0.5),ctx.currentTime,0.15);
        if(isSynth&&d.prevPositions&&syn.voices.length>0){
          const pr=pitchRef.current, scale=SCALES[pr.scale]||SCALES.pentatonic;
          const root=pr.centerFreq, voices=syn.voices, step=Math.max(1,Math.floor(d.n/voices.length));
          const op=oscPRef.current, fp=filterPRef.current;
          for(let vi=0;vi<voices.length;vi++){
            const v=voices[vi], pi=(vi*step)%d.n, i3=pi*3;
            const py=d.positions[i3+1], vPos=clamp(py/3,-1,1);
            const sIdx=Math.round(vPos*scale.length*(pr.spread/1200));
            const oct=Math.floor(sIdx/scale.length); let deg=sIdx%scale.length; if(deg<0)deg+=scale.length;
            const baseFreq=root*Math.pow(2,(oct*12+scale[deg])/12);
            for(let i=0;i<3;i++) v.oscs[i].frequency.setTargetAtTime(baseFreq*Math.pow(2,op[i].oct),ctx.currentTime,0.04);
            v.pan.pan.setTargetAtTime(clamp(d.positions[i3]/3,-1,1),ctx.currentTime,0.06);
            const dxp=d.positions[i3]-d.prevPositions[i3],dyp=d.positions[i3+1]-d.prevPositions[i3+1],dzp=d.positions[i3+2]-d.prevPositions[i3+2];
            const spd=Math.min(1,Math.sqrt(dxp*dxp+dyp*dyp+dzp*dzp)*22);
            const dynCut=fp.cutoff+fp.envAmt*spd*fp.cutoff*4;
            v.filter.frequency.setTargetAtTime(clamp(dynCut,20,18000),ctx.currentTime,0.04);
          }
        }
      }
    };
    rafRef.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(rafRef.current);
  },[reactivity]);
  const toggleRunning = async()=>{ if(!running){await startAudio();setRunning(true);}else{stopAudio();setRunning(false);} };
  // --- keyboard -> MIDI / synth input for PC users
  const midiRef = useRef({ outputs: [] });
  const activeNotesRef = useRef(new Map());
  // key -> semitone offset relative to center
  const KEY_TO_SEMITONE = {
    'z':0,'s':1,'x':2,'d':3,'c':4,'v':5,'g':6,'b':7,'h':8,'n':9,'j':10,'m':11,
    'q':-12,'2':-11,'w':-10,'3':-9,'e':-8,'r':-7,'5':-6,'t':-5,'6':-4,'y':-3,'7':-2,'u':-1
  };

  // send to WebMIDI outputs if available
  useEffect(()=>{
    if(navigator.requestMIDIAccess){
      navigator.requestMIDIAccess().then(ma=>{
        const outs=[]; for(const o of ma.outputs.values()) outs.push(o); midiRef.current.outputs=outs;
      }).catch(()=>{});
    }
  },[]);

  const noteOn = async(midiNote, velocity=127)=>{
    const ctx = ctxRef.current || await ensureCtx();
    if(!ctx) return;
    // ensure synth bus exists (start synth audio stack if necessary)
    if(!synthRef.current) await startAudio();
    const outBus = synthRef.current?.bus || ctx.destination;
    // build a small voice (3 oscillators matching oscPRef)
    const oscs=[], gains=[];
    const p = oscPRef.current;
    const pan = ctx.createStereoPanner();
    const noteGain = ctx.createGain(); noteGain.gain.value = 0;
    noteGain.connect(pan); pan.connect(outBus);
    for(let i=0;i<3;i++){
      const op = p[i]||{wave:'sine',det:0,vol:0.3};
      const o = ctx.createOscillator(); o.type = op.wave; o.detune.value = op.det;
      const g = ctx.createGain(); g.gain.value = op.vol * (velocity/127);
      o.connect(g); g.connect(noteGain);
      o.start(); oscs.push(o); gains.push(g);
    }
    // set pitch
    const freq = 440 * Math.pow(2,(midiNote-69)/12);
    oscs.forEach(o=>o.frequency.setValueAtTime(freq,ctx.currentTime));
    // ADSR envelope
    const now = ctx.currentTime; const a = Math.max(0.001,adsrPRef.current.a), d = Math.max(0.001,adsrPRef.current.d), s = adsrPRef.current.s;
    noteGain.gain.cancelScheduledValues(now); noteGain.gain.setValueAtTime(0,now);
    noteGain.gain.linearRampToValueAtTime(1, now + a);
    noteGain.gain.linearRampToValueAtTime(s, now + a + d);
    // simple panning based on midiNote
    pan.pan.setTargetAtTime(((midiNote%12)-6)/6, now, 0.02);
    // record active
    const releaseFn = ()=>{
      const r = Math.max(0.05, adsrPRef.current.r);
      const t = ctx.currentTime; noteGain.gain.cancelScheduledValues(t); noteGain.gain.setValueAtTime(noteGain.gain.value, t); noteGain.gain.linearRampToValueAtTime(0, t + r);
      setTimeout(()=>{ try{ oscs.forEach(o=>{ o.stop(); try{o.disconnect();}catch{} }); gains.forEach(g=>{ try{g.disconnect();}catch{} }); try{noteGain.disconnect(); pan.disconnect();}catch{} }catch{} }, (r+0.1)*1000);
    };
    activeNotesRef.current.set(midiNote, { oscs, gains, noteGain, pan, releaseFn });
    // forward to MIDI outputs
    midiRef.current.outputs.forEach(o=>{ try{o.send([0x90, midiNote & 0x7f, velocity & 0x7f]); }catch{} });
  };

  const noteOff = (midiNote)=>{
    const rec = activeNotesRef.current.get(midiNote); if(!rec) return;
    try{ rec.releaseFn(); }catch{} activeNotesRef.current.delete(midiNote);
    midiRef.current.outputs.forEach(o=>{ try{o.send([0x80, midiNote & 0x7f, 0]); }catch{} });
  };

  useEffect(()=>{
    const onKeyDown = async(e)=>{
      if(e.repeat) return; const k = (e.key||'').toLowerCase(); if(!(k in KEY_TO_SEMITONE)) return;
      const semitone = KEY_TO_SEMITONE[k];
      const centerMidi = Math.round(69 + 12*Math.log2((pitchRef.current?.centerFreq||220)/440));
      const midiNote = centerMidi + semitone;
      if(activeNotesRef.current.has(midiNote)) return;
      await noteOn(midiNote, 100);
    };
    const onKeyUp = (e)=>{ const k=(e.key||'').toLowerCase(); if(!(k in KEY_TO_SEMITONE)) return; const semitone=KEY_TO_SEMITONE[k]; const centerMidi = Math.round(69 + 12*Math.log2((pitchRef.current?.centerFreq||220)/440)); const midiNote = centerMidi + semitone; noteOff(midiNote); };
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
    return ()=>{ window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  },[]);
  const S = (label, children) => (
    <div style={{marginBottom:18}}>
      <div style={{fontSize:9,letterSpacing:'0.28em',textTransform:'uppercase',color:'rgba(232,227,211,0.38)',marginBottom:9,paddingBottom:4,borderBottom:'1px solid rgba(232,227,211,0.07)',fontWeight:500}}>{label}</div>
      {children}
    </div>
  );
  const Sl = ({label,unit,value,min,max,step,fmt,onChange}) => {
    const pct=((value-min)/(max-min))*100;
    return (
      <div style={{marginBottom:11}}>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:10,letterSpacing:'0.06em',marginBottom:3}}>
          <span style={{color:'rgba(232,227,211,0.8)'}}>{label}</span>
          <span style={{color:'#d97757',fontVariantNumeric:'tabular-nums'}}>{fmt(value)}{unit&&<span style={{color:'rgba(232,227,211,0.4)',marginLeft:2}}>{unit}</span>}</span>
        </div>
        <div style={{position:'relative',height:16,display:'flex',alignItems:'center'}}>
          <div style={{position:'absolute',inset:'auto 0',height:2,background:'rgba(232,227,211,0.08)'}}/>
          <div style={{position:'absolute',left:0,top:'50%',transform:'translateY(-50%)',width:pct+'%',height:2,background:'rgba(217,119,87,0.75)'}}/>
          <div style={{position:'absolute',left:'calc('+pct+'% - 6px)',top:'50%',transform:'translateY(-50%)',width:12,height:12,borderRadius:2,background:'#e8e3d3',boxShadow:'0 0 8px rgba(217,119,87,0.4)',pointerEvents:'none'}}/>
          <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(parseFloat(e.target.value))} style={{position:'absolute',inset:0,width:'100%',height:'100%',margin:0,padding:0,opacity:0,cursor:'pointer'}}/>
        </div>
      </div>
    );
  };
  const SelRow = ({label,value,options,onChange}) => (
    <div style={{marginBottom:10}}>
      <div style={{fontSize:10,letterSpacing:'0.06em',marginBottom:5,color:'rgba(232,227,211,0.8)'}}>{label}</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
        {options.map(o=>(
          <button key={o} onClick={()=>onChange(o)} style={{padding:'3px 9px',background:value===o?'rgba(217,119,87,0.15)':'transparent',border:value===o?'1px solid rgba(217,119,87,0.5)':'1px solid rgba(232,227,211,0.12)',borderRadius:4,color:value===o?'#d97757':'rgba(232,227,211,0.6)',fontFamily:"'IBM Plex Mono',monospace",fontSize:9.5,cursor:'pointer',transition:'all .15s'}}>{o}</button>
        ))}
      </div>
    </div>
  );
  const Chip = ({label,active,onClick}) => (
    <button onClick={onClick} style={{padding:'6px 11px',background:active?'rgba(217,119,87,0.18)':'transparent',border:active?'1px solid rgba(217,119,87,0.6)':'1px solid rgba(232,227,211,0.14)',borderRadius:999,color:active?'#d97757':'rgba(232,227,211,0.7)',fontFamily:"'IBM Plex Mono',monospace",fontSize:9.8,letterSpacing:'0.05em',cursor:'pointer',transition:'all .15s'}}>{label}</button>
  );
  const updOsc = (field,val) => setOscP(prev=>prev.map((o,i)=>i===selOsc?{...o,[field]:val}:o));
  return (
    <div style={{fontFamily:"'IBM Plex Mono',ui-monospace,monospace",background:'radial-gradient(ellipse at 30% 0%,#110d18,#08070d 55%,#050408)',color:'#e8e3d3',width:'100%',overflow:'hidden'}}>
      <div className="ms-lay">
        <div ref={mountRef} className="ms-vp" onMouseDown={onPD} onMouseMove={onPM} onMouseUp={onPU} onMouseLeave={onPU} onTouchStart={onPD} onTouchMove={onPM} onTouchEnd={onPU} onTouchCancel={onPU} style={{cursor:'grab'}}>
          <div style={{position:'absolute',top:16,left:20,pointerEvents:'none',zIndex:2}}>
            <div style={{fontFamily:"'Fraunces',serif",fontStyle:'italic',fontWeight:500,fontSize:'clamp(22px,3.2vw,32px)',letterSpacing:'-0.02em',lineHeight:1,color:'#e8e3d3',textShadow:'0 2px 24px rgba(0,0,0,.9)'}}>
              murmuration<span style={{color:'#d97757',fontStyle:'normal'}}>.</span>synth
            </div>
            <div style={{marginTop:5,fontSize:9.5,letterSpacing:'0.22em',textTransform:'uppercase',color:'rgba(232,227,211,0.45)'}}>v4 · {BEHAVIORS[behavior].label} · {motion.particleCount.toLocaleString()}</div>
          </div>
          <div style={{position:'absolute',bottom:14,left:20,zIndex:2,fontFamily:"'Fraunces',serif",fontStyle:'italic',fontSize:13,color:'rgba(232,227,211,0.5)',pointerEvents:'none'}}>{BEHAVIORS[behavior].description}</div>
          <div style={{position:'absolute',bottom:14,right:18,zIndex:2,fontSize:9.5,letterSpacing:'0.15em',textTransform:'uppercase',color:'rgba(232,227,211,0.35)',pointerEvents:'none'}}>drag to orbit</div>
          {!running&&(
            <div onClick={toggleRunning} style={{position:'absolute',inset:0,zIndex:5,background:'radial-gradient(ellipse at center,rgba(8,7,13,.2),rgba(8,7,13,.75))',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
              <div style={{textAlign:'center',padding:20}}>
                <div style={{fontFamily:"'Fraunces',serif",fontStyle:'italic',fontSize:'clamp(15px,2vw,22px)',color:'rgba(232,227,211,0.75)',marginBottom:18,lineHeight:1.3}}>a flock of oscillators,<br/>bound by sight &amp; flight.</div>
                <button onClick={e=>{e.stopPropagation();toggleRunning();}} style={{padding:'11px 28px',background:'#d97757',color:'#08070d',border:'none',borderRadius:999,fontFamily:"'IBM Plex Mono',monospace",fontSize:10.5,fontWeight:600,letterSpacing:'0.22em',textTransform:'uppercase',cursor:'pointer',boxShadow:'0 4px 30px rgba(217,119,87,0.45)'}}>begin listening</button>
              </div>
            </div>
          )}
        </div>
        <div className="ms-ctrl">
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:18}}>
            <button onClick={toggleRunning} style={{padding:'9px 18px',background:running?'rgba(216,83,83,0.15)':'#d97757',color:running?'#d85353':'#08070d',border:running?'1px solid rgba(216,83,83,0.4)':'none',borderRadius:999,fontFamily:"'IBM Plex Mono',monospace",fontSize:10,fontWeight:600,letterSpacing:'0.22em',textTransform:'uppercase',cursor:'pointer'}}>
              {running?'stop':'begin'}
            </button>
            <div style={{flex:1}}/>
            <button onClick={()=>applyInit(behavior)} style={{padding:'7px 13px',background:'transparent',color:'rgba(232,227,211,0.65)',border:'1px solid rgba(232,227,211,0.18)',borderRadius:999,fontFamily:"'IBM Plex Mono',monospace",fontSize:9.5,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>reseed</button>
          </div>
          {S('Behavior',
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {BEHAVIOR_ORDER.map(k=><Chip key={k} label={BEHAVIORS[k].label} active={behavior===k} onClick={()=>setBehavior(k)}/>)}
            </div>
          )}
          {S('Motion',<>
            <Sl label="particles"  value={motion.particleCount} min={500}   max={20000} step={100}  fmt={v=>v.toLocaleString()} onChange={v=>setMotion(p=>({...p,particleCount:v}))}/>
            <Sl label="flow"       value={motion.flow}          min={0.1}   max={3}     step={0.01} fmt={v=>v.toFixed(2)}       onChange={v=>setMotion(p=>({...p,flow:v}))}/>
            <Sl label="point size" value={motion.pointSize}     min={0.015} max={0.15}  step={0.001} fmt={v=>v.toFixed(3)}     onChange={v=>setMotion(p=>({...p,pointSize:v}))}/>
          </>)}
          {S('Synthesizer — Oscillators',<>
            <div style={{display:'flex',gap:5,marginBottom:10}}>
              {[0,1,2].map(i=>(
                <button key={i} onClick={()=>setSelOsc(i)} style={{padding:'5px 12px',background:selOsc===i?'rgba(217,119,87,0.18)':'transparent',border:selOsc===i?'1px solid rgba(217,119,87,0.6)':'1px solid rgba(232,227,211,0.14)',borderRadius:4,color:selOsc===i?'#d97757':'rgba(232,227,211,0.65)',fontFamily:"'IBM Plex Mono',monospace",fontSize:9.5,cursor:'pointer',display:'flex',alignItems:'center',gap:5,transition:'all .15s'}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:oscP[i].on?'#d97757':'rgba(232,227,211,0.2)',display:'inline-block'}}/>
                  OSC {i+1}
                </button>
              ))}
            </div>
            <div style={{background:'rgba(232,227,211,0.03)',borderRadius:6,padding:'10px 12px',border:'1px solid rgba(232,227,211,0.07)',marginBottom:8}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:9}}>
                <span style={{fontSize:10,color:'rgba(232,227,211,0.7)',letterSpacing:'0.06em'}}>OSC {selOsc+1}</span>
                <button onClick={()=>updOsc('on',!oscP[selOsc].on)} style={{padding:'3px 10px',background:oscP[selOsc].on?'rgba(217,119,87,0.18)':'rgba(232,227,211,0.06)',border:oscP[selOsc].on?'1px solid rgba(217,119,87,0.5)':'1px solid rgba(232,227,211,0.14)',borderRadius:4,color:oscP[selOsc].on?'#d97757':'rgba(232,227,211,0.5)',fontFamily:"'IBM Plex Mono',monospace",fontSize:9,cursor:'pointer'}}>
                  {oscP[selOsc].on?'ON':'OFF'}
                </button>
              </div>
              <SelRow label="waveform" value={oscP[selOsc].wave} options={['sine','triangle','sawtooth','square']} onChange={v=>updOsc('wave',v)}/>
              <div style={{display:'flex',gap:8,marginBottom:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:9.5,color:'rgba(232,227,211,0.7)',letterSpacing:'0.06em',marginBottom:5}}>octave</div>
                  <div style={{display:'flex',gap:3}}>
                    {[-2,-1,0,1,2].map(oct=>(
                      <button key={oct} onClick={()=>updOsc('oct',oct)} style={{flex:1,padding:'4px 0',background:oscP[selOsc].oct===oct?'rgba(217,119,87,0.2)':'transparent',border:oscP[selOsc].oct===oct?'1px solid rgba(217,119,87,0.5)':'1px solid rgba(232,227,211,0.12)',borderRadius:3,color:oscP[selOsc].oct===oct?'#d97757':'rgba(232,227,211,0.55)',fontFamily:"'IBM Plex Mono',monospace",fontSize:9,cursor:'pointer'}}>{oct>0?'+'+oct:oct}</button>
                    ))}
                  </div>
                </div>
              </div>
              <Sl label="detune" unit="cents" value={oscP[selOsc].det} min={-50} max={50} step={0.5} fmt={v=>(v>0?'+':'')+v.toFixed(1)} onChange={v=>updOsc('det',v)}/>
              <Sl label="volume" value={oscP[selOsc].vol} min={0} max={1} step={0.01} fmt={v=>v.toFixed(2)} onChange={v=>updOsc('vol',v)}/>
            </div>
          </>)}
          {S('Synthesizer — Filter',<>
            <SelRow label="type" value={filterP.type} options={['lowpass','highpass','bandpass','notch']} onChange={v=>setFilterP(p=>({...p,type:v}))}/>
            <Sl label="cutoff"  unit="Hz" value={filterP.cutoff} min={40}  max={18000} step={10}   fmt={v=>v.toFixed(0)} onChange={v=>setFilterP(p=>({...p,cutoff:v}))}/>
            <Sl label="resonance"          value={filterP.res}   min={0.1} max={20}    step={0.1}  fmt={v=>v.toFixed(1)} onChange={v=>setFilterP(p=>({...p,res:v}))}/>
            <Sl label="env amount"         value={filterP.envAmt} min={0}  max={1}     step={0.01} fmt={v=>v.toFixed(2)} onChange={v=>setFilterP(p=>({...p,envAmt:v}))}/>
          </>)}
          {S('Synthesizer — ADSR',<>
            <Sl label="attack"  unit="s" value={adsrP.a} min={0.001} max={4}   step={0.001} fmt={v=>v.toFixed(3)} onChange={v=>setAdsrP(p=>({...p,a:v}))}/>
            <Sl label="decay"   unit="s" value={adsrP.d} min={0.001} max={4}   step={0.001} fmt={v=>v.toFixed(3)} onChange={v=>setAdsrP(p=>({...p,d:v}))}/>
            <Sl label="sustain"           value={adsrP.s} min={0}    max={1}   step={0.01}  fmt={v=>v.toFixed(2)} onChange={v=>setAdsrP(p=>({...p,s:v}))}/>
            <Sl label="release" unit="s" value={adsrP.r} min={0.05}  max={8}   step={0.05}  fmt={v=>v.toFixed(2)} onChange={v=>setAdsrP(p=>({...p,r:v}))}/>
          </>)}
          {S('Synthesizer — LFO',<>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:9}}>
              <span style={{fontSize:10,color:'rgba(232,227,211,0.7)',letterSpacing:'0.06em'}}>LFO</span>
              <button onClick={()=>setLfoP(p=>({...p,on:!p.on}))} style={{padding:'3px 10px',background:lfoP.on?'rgba(217,119,87,0.18)':'rgba(232,227,211,0.06)',border:lfoP.on?'1px solid rgba(217,119,87,0.5)':'1px solid rgba(232,227,211,0.14)',borderRadius:4,color:lfoP.on?'#d97757':'rgba(232,227,211,0.5)',fontFamily:"'IBM Plex Mono',monospace",fontSize:9,cursor:'pointer'}}>{lfoP.on?'ON':'OFF'}</button>
            </div>
            <SelRow label="target" value={lfoP.target} options={['filter','pitch','amp']} onChange={v=>setLfoP(p=>({...p,target:v}))}/>
            <SelRow label="shape"  value={lfoP.wave}   options={['sine','triangle','sawtooth','square']} onChange={v=>setLfoP(p=>({...p,wave:v}))}/>
            <Sl label="rate"  unit="Hz" value={lfoP.rate}  min={0.01} max={20}  step={0.01} fmt={v=>v.toFixed(2)} onChange={v=>setLfoP(p=>({...p,rate:v}))}/>
            <Sl label="depth"           value={lfoP.depth} min={0}    max={1}   step={0.01} fmt={v=>v.toFixed(2)} onChange={v=>setLfoP(p=>({...p,depth:v}))}/>
          </>)}
          {S('Pitch',<>
            <Sl label="center freq" unit="Hz" value={pitch.centerFreq} min={55}  max={2200} step={1}  fmt={v=>v.toFixed(0)} onChange={v=>setPitch(p=>({...p,centerFreq:v}))}/>
            <Sl label="spread"      unit="cents"  value={pitch.spread}     min={100} max={6000} step={10} fmt={v=>v.toFixed(0)} onChange={v=>setPitch(p=>({...p,spread:v}))}/>
            <SelRow label="scale" value={pitch.scale} options={Object.keys(SCALES)} onChange={v=>setPitch(p=>({...p,scale:v}))}/>
            <Sl label="voices" value={pitch.voiceCount} min={2} max={16} step={1} fmt={v=>v.toFixed(0)} onChange={v=>setPitch(p=>({...p,voiceCount:v}))}/>
          </>)}
          {S('Mix',<>
            <Sl label="volume" value={mix.volume} min={0} max={1} step={0.01} fmt={v=>v.toFixed(2)} onChange={v=>setMix(p=>({...p,volume:v}))}/>
            <Sl label="reverb" value={mix.reverb} min={0} max={1} step={0.01} fmt={v=>v.toFixed(2)} onChange={v=>setMix(p=>({...p,reverb:v}))}/>
          </>)}
          {S('Audio Source',<>
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
              <Chip label="synth" active={audioSrc==='synth'} onClick={switchSynth}/>
              <Chip label="file"  active={audioSrc==='file'}  onClick={()=>document.getElementById('ms-file').click()}/>
              <Chip label="tab"   active={audioSrc==='tab'}   onClick={startTab}/>
              <Chip label="mic"   active={audioSrc==='mic'}   onClick={startMic}/>
            </div>
            <input id="ms-file" type="file" accept="audio/*" style={{display:'none'}} onChange={e=>loadFile(e.target.files?.[0])}/>
            {audioStatus&&<div style={{fontSize:10,color:audioStatus.includes('error')||audioStatus.includes('failed')?'#d85353':'rgba(232,227,211,0.55)',marginBottom:8,fontStyle:'italic'}}>{audioStatus}</div>}
            {audioSrc!=='synth'&&<Sl label="reactivity" value={reactivity} min={0} max={3} step={0.01} fmt={v=>v.toFixed(2)} onChange={setReactivity}/>}
          </>)}
          <div style={{marginTop:14,fontSize:9,letterSpacing:'0.18em',textTransform:'uppercase',color:'rgba(232,227,211,0.22)',textAlign:'center',fontFamily:"'Fraunces',serif",fontStyle:'italic'}}>shape is the memory of motion</div>
        </div>
      </div>
    </div>
  );
}
