import test from 'node:test';
import assert from 'node:assert/strict';
import { drawPortraitLayers, PortraitEyeMotion } from '../dist/portrait-layers.js';
import { AiPortraitLipSync } from '../dist/lip-sync-player.js';

const eyeSettings={assetId:'eyes',region:{x:11,y:9,width:22,height:8},frames:{open:0,half:1,closed:2,left:3,right:4},blink:true,gaze:true};
test('composition replaces mouth and eye regions at their own registered coordinates, including sheet margins',()=>{
  const calls=[],ctx={clearRect(...a){calls.push(['clear',...a]);},drawImage(...a){calls.push(['draw',...a]);}};
  const canvas={width:0,height:0,getContext(){return ctx;}};
  const grid={frameWidth:80,frameHeight:96,columns:3,rows:3,margin:2,spacing:4};
  const mouthSet={editRegion:{x:20,y:55,width:35,height:29}};
  assert.equal(drawPortraitLayers(canvas,{mouth:'mouth',grid,mouthSet,frame:4,base:'base',layered:true,eyes:{image:'eyes',grid,settings:eyeSettings,pose:'closed'}}),true);
  assert.equal(canvas.width,80);assert.equal(canvas.height,96);
  assert.deepEqual(calls,[['clear',0,0,80,96],['draw','base',0,0,80,96],['clear',20,55,35,29],['draw','mouth',106,157,35,29,20,55,35,29],['clear',11,9,22,8],['draw','eyes',181,11,22,8,11,9,22,8]]);
  calls.length=0;
  assert.equal(drawPortraitLayers(canvas,{mouth:'mouth',grid,mouthSet,frame:4,base:'base',layered:false}),false);
  assert.deepEqual(calls,[['clear',0,0,80,96],['draw','mouth',86,102,80,96,0,0,80,96]]);
});
test('independent eye clock blinks, reopens, looks around, and freezes on pause',()=>{
  const eyes=new PortraitEyeMotion(()=>0);eyes.reset();const poses=[];
  for(let i=0;i<110;i++)poses.push(eyes.update(.05,eyeSettings));
  assert.ok(poses.includes('half'));assert.ok(poses.includes('closed'));assert.ok(poses.includes('left'));
  assert.equal(poses.at(-1),'open');
  const before=eyes.update(0,eyeSettings);for(let i=0;i<100;i++)assert.equal(eyes.update(0,eyeSettings),before);
  for(let i=0;i<200;i++)assert.equal(eyes.update(.05,{...eyeSettings,blink:false,gaze:false}),'open');
});
test('layered renderer keeps mouth on the audio cue while its eyes blink, including after speech ends',async()=>{
  let update;const old={Image:globalThis.Image,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  globalThis.requestAnimationFrame=callback=>{update=callback;return 1;};globalThis.cancelAnimationFrame=()=>{};
  globalThis.Image=class{async decode(){}};
  const doc={createElement(){return {ownerDocument:doc,style:{},dataset:{},setAttribute(){},remove(){},getContext(){return {clearRect(){},drawImage(){}};}};}};
  const grid={frameWidth:80,frameHeight:96,columns:3,rows:3};
  const mouthSet={frames:{X:0,A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8},editRegion:{x:20,y:55,width:35,height:29}};
  const manifest={assets:{portrait:{lipSync:{enabled:true,layered:true,mouthAssetId:'mouths',eyes:eyeSettings},activeVersion:'one',versions:{one:{file:'base.png'}}},mouths:{frameGrid:grid,mouthSet,activeVersion:'one',versions:{one:{file:'mouths.png'}}},eyes:{frameGrid:grid,activeVersion:'one',versions:{one:{file:'eyes.png'}}}}};
  const track={schemaVersion:1,source:'manual',text:'Hello',sourceFile:'voice.mp3',language:'en',duration:10,cues:[{start:0,end:10,shape:'D'}]};
  const line={prompt:'Hello',activeVersion:'one',versions:{one:{file:'voice.mp3',lipSyncTrack:track}}};
  let clock={seconds:1,playing:true},paused=false;
  const player=new AiPortraitLipSync({manifest:()=>manifest,document:doc,random:()=>0,paused:()=>paused});
  try{
    player.show('portrait');await Promise.resolve();player.speak('one','Hello',line,()=>clock);
    const poses=new Set();for(let i=1;i<90;i++){update(i*50);assert.equal(player.canvas.dataset.lipSyncShape,'D');poses.add(player.canvas.dataset.eyePose);}
    assert.ok(poses.has('closed'));assert.ok(poses.has('left'));
    clock={seconds:0,playing:false};update(4500);assert.equal(player.canvas.dataset.lipSyncShape,'X');
    assert.match(player.canvas.dataset.portraitLayers,/base mouth eyes/);
    paused=true;const eye=player.canvas.dataset.eyePose;update(10000);assert.equal(player.canvas.dataset.eyePose,eye);
    player.previewEyePose('closed');update(10050);assert.equal(player.canvas.dataset.eyePose,'closed');assert.equal(player.canvas.dataset.lipSyncShape,'X');
  }finally{player.destroy();Object.assign(globalThis,old);}
});
