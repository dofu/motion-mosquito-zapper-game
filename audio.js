/* Sound: everything is generated with the Web Audio API, no audio files. */
/* ================= AUDIO ================= */
let AC=null, masterGain=null, buzzOsc=null, buzzGain=null, buzzVib=null;
function initAudio(){
  AC=new (window.AudioContext||window.webkitAudioContext)();
  masterGain=AC.createGain(); masterGain.gain.value=0.9;
  masterGain.connect(AC.destination);

  // ambient mosquito whine
  buzzOsc=AC.createOscillator(); buzzOsc.type='sawtooth'; buzzOsc.frequency.value=520;
  buzzVib=AC.createOscillator(); buzzVib.type='sine'; buzzVib.frequency.value=9;
  const vg=AC.createGain(); vg.gain.value=45;
  buzzVib.connect(vg).connect(buzzOsc.frequency);
  const bf=AC.createBiquadFilter(); bf.type='bandpass'; bf.frequency.value=700; bf.Q.value=2;
  buzzGain=AC.createGain(); buzzGain.gain.value=0;
  buzzOsc.connect(bf).connect(buzzGain).connect(masterGain);
  buzzOsc.start(); buzzVib.start();
}
function sfxZap(){
  if(!AC) return;
  const t=AC.currentTime;
  // crackle: filtered noise burst
  const dur=0.28;
  const buf=AC.createBuffer(1,AC.sampleRate*dur,AC.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<d.length;i++){
    const env=Math.pow(1-i/d.length,1.6);
    d[i]=(Math.random()*2-1)*env*(Math.random()<0.35?1:0.25);
  }
  const src=AC.createBufferSource(); src.buffer=buf;
  const f=AC.createBiquadFilter(); f.type='highpass'; f.frequency.value=1800;
  const g=AC.createGain(); g.gain.setValueAtTime(0.9,t);
  src.connect(f).connect(g).connect(masterGain); src.start();
  // low thump
  const o=AC.createOscillator(); o.type='square';
  o.frequency.setValueAtTime(220,t); o.frequency.exponentialRampToValueAtTime(60,t+0.15);
  const og=AC.createGain(); og.gain.setValueAtTime(0.35,t);
  og.gain.exponentialRampToValueAtTime(0.001,t+0.18);
  o.connect(og).connect(masterGain); o.start(t); o.stop(t+0.2);
}
function sfxCombo(n){
  if(!AC) return;
  const t=AC.currentTime;
  // pitch climbs with the chain, capped so it never gets shrill
  const root=440*Math.pow(2,Math.min(n-3,9)/12);
  const notes=[root, root*1.26, root*1.5];        // major triad, arpeggiated
  notes.forEach((f,i)=>{
    const o=AC.createOscillator();
    o.type = n>=8 ? 'sawtooth' : 'square';
    o.frequency.value=f;
    const g=AC.createGain();
    const st=t+i*0.045;
    const vol=Math.min(0.30, 0.13+n*0.018);
    g.gain.setValueAtTime(0,st);
    g.gain.linearRampToValueAtTime(vol,st+0.015);
    g.gain.exponentialRampToValueAtTime(0.001,st+0.34);
    o.connect(g).connect(masterGain); o.start(st); o.stop(st+0.38);
  });
  // 8+ earns a shimmer on top
  if(n>=8){
    const buf=AC.createBuffer(1,AC.sampleRate*0.45,AC.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2.2)*0.35;
    const s=AC.createBufferSource(); s.buffer=buf;
    const hf=AC.createBiquadFilter(); hf.type='highpass'; hf.frequency.value=5200;
    s.connect(hf).connect(masterGain); s.start(t+0.05);
  }
}
function sfxTick(){
  if(!AC) return;
  const t=AC.currentTime;
  const o=AC.createOscillator(); o.type='square'; o.frequency.value=880;
  const g=AC.createGain();
  g.gain.setValueAtTime(0.18,t);
  g.gain.exponentialRampToValueAtTime(0.001,t+0.12);
  o.connect(g).connect(masterGain); o.start(t); o.stop(t+0.14);
}
function sfxLevelUp(){
  if(!AC) return;
  const t=AC.currentTime;
  const notes=[523.25,659.25,783.99,1046.5,1318.5];
  notes.forEach((f,i)=>{
    const o=AC.createOscillator(); o.type='square'; o.frequency.value=f;
    const g=AC.createGain();
    const st=t+i*0.09;
    g.gain.setValueAtTime(0,st);
    g.gain.linearRampToValueAtTime(0.22,st+0.02);
    g.gain.exponentialRampToValueAtTime(0.001,st+0.5);
    o.connect(g).connect(masterGain); o.start(st); o.stop(st+0.55);
  });
  // sparkle noise
  const buf=AC.createBuffer(1,AC.sampleRate*0.5,AC.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2)*0.3;
  const s=AC.createBufferSource(); s.buffer=buf;
  const hf=AC.createBiquadFilter(); hf.type='highpass'; hf.frequency.value=4000;
  s.connect(hf).connect(masterGain); s.start(t+0.35);
}
