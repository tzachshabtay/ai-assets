import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { estimateLipSync, lipSyncShapeAt, assertLipSyncTrack, selectedLipSyncTrack, createAiAssetVersion, LIP_SYNC_SHAPES } from '../../core/dist/index.js';
import { textLipSync } from '../dist/lip-sync.js';
import { handleLipSyncRequest } from '../dist/lip-sync-authoring.js';

test('text timing uses pronunciation, punctuation, rest, and deterministic speed', () => {
  const track = textLipSync('Maybe, five blue moons.');
  assertLipSyncTrack(track);
  for (const shape of ['A','G','F','X']) assert.ok(track.cues.some(cue=>cue.shape===shape),shape);
  assert.equal(lipSyncShapeAt(track,-1),'X');assert.equal(lipSyncShapeAt(track,track.duration),'X');
  for(const cue of track.cues)assert.equal(lipSyncShapeAt(track,(cue.start+cue.end)/2),cue.shape);
  const slow=textLipSync('Hello.',{wordsPerMinute:75}),fast=textLipSync('Hello.',{wordsPerMinute:150});
  assert.equal(slow.duration,fast.duration*2);
});
test('timing is bound to a specific selected recording and spoken text',()=>{
  const track={...estimateLipSync('Hello'),sourceFile:'a.mp3'};
  const asset={id:'line',kind:'voice-line',prompt:'Hello',voiceSettings:{text:'Hello'},activeVersion:'a',versions:{a:{file:'a.mp3',lipSyncTrack:track},b:{file:'b.mp3'}}};
  assert.equal(selectedLipSyncTrack(asset),track);
  assert.equal(selectedLipSyncTrack({...asset,activeVersion:'b'}),undefined);
  assert.equal(selectedLipSyncTrack({...asset,voiceSettings:{text:'Goodbye'}}),undefined);
  assert.equal(selectedLipSyncTrack({...asset,versions:{a:{file:'changed.mp3',lipSyncTrack:track}}}),undefined);
  const version=createAiAssetVersion(asset,{name:'c',file:'c.mp3',lipSyncTrack:track});assert.deepEqual(version.lipSyncTrack,track);
});
test('rejects overlapping, invalid and out of bounds cues',()=>{
  const base=estimateLipSync('hello');
  for(const cues of [[{start:1,end:0,shape:'A'}],[{start:0,end:1,shape:'bad'}],[{start:0,end:Infinity,shape:'X'}],[{start:0,end:.2,shape:'B'},{start:.1,end:.3,shape:'C'}]])assert.throws(()=>assertLipSyncTrack({...base,cues}));
});

test('mouth generation locks all pixels outside region and saves a reusable child asset',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'lip-sync-test-'));
  try{
    const source=await sharp({create:{width:32,height:32,channels:4,background:'#12345680'}}).png().toBuffer();
    await writeFile(path.join(root,'base.png'),source);
    const asset={id:'portrait',kind:'image',prompt:'A portrait',dimensions:{width:32,height:32},activeVersion:'base',versions:{base:{name:'base',file:'art/base.png',prompt:'A portrait',createdAt:new Date().toISOString()}}};
    const voice={id:'voice',kind:'voice',prompt:'A voice',activeVersion:'',versions:{}};
    const manifest={schemaVersion:1,assets:{portrait:asset,voice}};
    const manifestPath=path.join(root,'assets.json');await writeFile(manifestPath,JSON.stringify(manifest));
    const region={x:8,y:16,width:16,height:12};
    const options={manifestPath,assetsDir:root,publicPathPrefix:'art',provider:{async generate(request){
      assert.equal(request.count,3);assert.equal(request.references.length,1);assert.equal(request.asset.frameGrid,undefined);
      const image=await sharp({create:{width:96,height:96,channels:4,background:'#ff0000'}}).png().toBuffer();
      return Array.from({length:3},()=>({image,mimeType:'image/png',prompt:request.prompt}));
    }}};
    await handleLipSyncRequest(options,{action:'settings',assetId:'portrait',settings:{enabled:true,voiceAssetId:'voice',language:'en'}});
    const result=await handleLipSyncRequest(options,{action:'generate',assetId:'portrait',region});assert.equal(result.candidates.length,3);
    const candidate=result.candidates[0],pixels=await sharp(Buffer.from(candidate.dataUrl.split(',')[1],'base64')).raw().toBuffer();
    for(let frame=0;frame<9;frame++)for(let y=0;y<32;y++)for(let x=0;x<32;x++){
      const offset=((Math.floor(frame/3)*32+y)*96+(frame%3*32+x))*4;
      if(frame===0||x<8||x>=24||y<16||y>=28)assert.deepEqual([...pixels.subarray(offset,offset+4)],[18,52,86,128]);
    }
    const saved=await handleLipSyncRequest(options,{action:'save-mouths',assetId:'portrait',...candidate,...candidate.frameGrid});
    assert.equal(saved.manifest.assets.portrait.lipSync.mouthAssetId,'portrait.mouths');
    assert.equal(saved.manifest.assets.portrait.linkedAnimationAssets['lip-sync'].assetId,'portrait.mouths');
    for(const[s,i]of LIP_SYNC_SHAPES.map((s,i)=>[s,i]))assert.equal(saved.version.mouthSet.frames[s],i);
    await assert.rejects(()=>handleLipSyncRequest(options,{action:'save-mouths',assetId:'portrait',...candidate,...candidate.frameGrid,mouthSet:{...candidate.mouthSet,sourceVersion:'old'}}),/portrait changed/i);
    const disk=JSON.parse(await readFile(manifestPath,'utf8'));assert.equal(disk.assets.voice.prompt,'A voice');
  }finally{await rm(root,{recursive:true,force:true});}
});
