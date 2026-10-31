import test from 'node:test';
import assert from 'node:assert/strict';
import { AiPortraitLipSync } from '../dist/lip-sync-player.js';

test('portrait playback follows the audio clock, holds on pause, and rests after completion',async()=>{
  let update;const old={Image:globalThis.Image,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  globalThis.requestAnimationFrame=callback=>{update=callback;return 1;};globalThis.cancelAnimationFrame=()=>{};
  globalThis.Image=class{async decode(){}};
  const document = {
    defaultView: { devicePixelRatio: 1 },
    createElement() {
      return { ownerDocument: document, style: {}, dataset: {}, setAttribute() {}, remove() {},
        getContext() { return { clearRect() {}, drawImage() {} }; } };
    },
  };
  const frames={X:0,A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8};
  const mouth={frameGrid:{frameWidth:16,frameHeight:16,columns:3,rows:3},mouthSet:{frames},activeVersion:'one',versions:{one:{file:'mouths.png'}}};
  const manifest={assets:{portrait:{lipSync:{enabled:true,mouthAssetId:'mouths'}},mouths:mouth}};
  const track={schemaVersion:1,source:'rhubarb',text:'Hello',sourceFile:'voice.mp3',language:'en',duration:3,cues:[{start:0,end:1,shape:'X'},{start:1,end:2,shape:'D'},{start:2,end:3,shape:'A'}]};
  const line={prompt:'Hello',activeVersion:'one',versions:{one:{file:'voice.mp3',lipSyncTrack:track}}};
  let clock={seconds:1.5,playing:true};
  const player=new AiPortraitLipSync({manifest:()=>manifest,document});
  try{
    assert.equal(player.show('portrait'),true);await Promise.resolve();
    player.speak('one','Hello',line,()=>clock);update(1000);assert.equal(player.canvas.dataset.lipSyncShape,'D');
    clock={seconds:1.5,playing:false,paused:true};update(9000);assert.equal(player.canvas.dataset.lipSyncShape,'D');
    clock={seconds:2.2,playing:true};update(9050);assert.equal(player.canvas.dataset.lipSyncShape,'A');
    clock={seconds:0,playing:false};update(9100);assert.equal(player.canvas.dataset.lipSyncShape,'X');
    player.speak('two','Hello',undefined);update(9500);assert.equal(player.canvas.dataset.lipSyncSource,'text');
    update(12000);assert.equal(player.canvas.dataset.lipSyncShape,'X');
    player.stop();update(13000);assert.equal(player.canvas.dataset.lipSyncShape,'X');
    manifest.assets.portrait.lipSync.enabled=false;assert.equal(player.show('portrait'),false);
  }finally{player.destroy();Object.assign(globalThis,old);}
});
