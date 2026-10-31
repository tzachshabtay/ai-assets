import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { selectedLipSyncTrack } from '@ai-game-assets/core';
import { createAiAssetDevServer } from '../dist/server.js';

test('generated and uploaded voice takes get timing, and promotion binds it to the saved file',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'lip-sync-server-')), previous=process.env.RHUBARB_PATH;
  const wav=Buffer.alloc(44+3200*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(6400,40);
  // Different samples prevent this test's fake timing from reusing real cached audio.
  for(let i=44;i<wav.length;i+=2)wav.writeInt16LE(3000*Math.sin(i/20),i);
  const text=`Hello test ${path.basename(root)}`;
  const voice={id:'voice',kind:'voice',prompt:'voice',activeVersion:'',versions:{},voiceSettings:{voiceId:'test'}};
  const line={id:'line',kind:'voice-line',prompt:text,activeVersion:'',versions:{},voiceSettings:{voiceAssetId:'voice',text}};
  const portrait={id:'portrait',kind:'image',prompt:'portrait',dimensions:{width:16,height:16},activeVersion:'',versions:{},lipSync:{enabled:true,voiceAssetId:'voice',language:'en'}};
  const manifestPath=path.join(root,'assets.json');await writeFile(manifestPath,JSON.stringify({schemaVersion:1,assets:{voice,line,portrait}}));
  const executable=path.join(root,'analyzer');await writeFile(executable,'#!/usr/bin/env node\nconsole.log(JSON.stringify({metadata:{duration:0.2},mouthCues:[{start:0,end:0.1,value:"B"},{start:0.1,end:0.2,value:"X"}]}));\n');await chmod(executable,0o755);process.env.RHUBARB_PATH=executable;
  const server=createAiAssetDevServer({manifestPath,assetsDir:root,publicPathPrefix:'art',port:0,
    audioProvider:{async generate(request,onOption){const option={image:wav,mimeType:'audio/wav',prompt:request.asset.prompt,voiceSettings:request.asset.voiceSettings};void onOption?.(option,0);return[option];}}});
  try{
    await server.listen();const port=server.server.address().port;
    const post=async(action,body)=>{const response=await fetch(`http://127.0.0.1:${port}/__ai-assets/${action}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;};
    const generated=await post('generate',{assetId:'line',count:1});assert.equal(generated.options[0].lipSyncTrack.source,'rhubarb');
    const selected=await post('save',{assetId:'line',versionName:'generated',activate:true,...generated.options[0]});
    assert.equal(selected.version.lipSyncTrack.sourceFile,selected.file);assert.equal(selected.version.lipSyncTrack.text,text);
    const recorded=await post('save',{assetId:'line',versionName:'recorded',activate:true,prompt:text,voiceSettings:line.voiceSettings,dataUrl:`data:audio/wav;base64,${wav.toString('base64')}`});
    assert.equal(recorded.version.lipSyncTrack.sourceFile,recorded.file);assert.equal(recorded.version.lipSyncTrack.source,'rhubarb');
    assert.ok(recorded.asset.versions.generated);assert.ok(recorded.asset.versions.recorded);
    const changedText = `Changed words ${path.basename(root)}`;
    const edited = await post('update-voice-line', { assetId: 'line', text: changedText });
    assert.equal(selectedLipSyncTrack(edited.manifest.assets.line), undefined, 'old timing is invalid after text edits');
    const regenerated = await post('generate', { assetId: 'line', count: 1 });
    assert.equal(regenerated.options[0].lipSyncTrack.text, changedText);
    const promoted = await post('save', { assetId: 'line', versionName: 'regenerated', activate: true, ...regenerated.options[0] });
    assert.equal(selectedLipSyncTrack(promoted.asset).text, changedText);
    const rerecorded = await post('save', { assetId: 'line', versionName: 'rerecorded', activate: true,
      prompt: changedText, voiceSettings: edited.manifest.assets.line.voiceSettings, dataUrl: `data:audio/wav;base64,${wav.toString('base64')}` });
    assert.equal(selectedLipSyncTrack(rerecorded.asset).text, changedText);
    assert.equal(selectedLipSyncTrack(rerecorded.asset).sourceFile, rerecorded.file);
    assert.equal(rerecorded.asset.versions.recorded.lipSyncTrack.text, text, 'old takes retain their own timing');
  }finally{await server.close();if(previous)process.env.RHUBARB_PATH=previous;else delete process.env.RHUBARB_PATH;await rm(root,{recursive:true,force:true});}
});
