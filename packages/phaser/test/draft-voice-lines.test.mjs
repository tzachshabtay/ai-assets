import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAiAssetDevServer } from '../../dev/dist/server.js';
import { readManifest, writeManifest } from '../../dev/dist/asset-store.js';
import { AiAssetDebugClient } from '../dist/debug-client.js';
import { regenerateAndPromoteVoiceLines } from '../dist/voice-line-regeneration.js';

const line = (id,text) => ({id,kind:'voice-line',prompt:'Natural conversational delivery.',activeVersion:'',versions:{},voiceSettings:{voiceAssetId:'hero',text,direction:''}});

test('batch promotions keep browser-only lines, generate them, and retain failed drafts and existing takes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'draft-voices-'));let server;
 try {
  const manifestPath=join(dir,'assets.json'),modulePath=join(dir,'assets.ts');
  const original={schemaVersion:1,assets:{hero:{id:'hero',kind:'voice',prompt:'Hero',voiceSettings:{voiceId:'fake-voice'},activeVersion:'',versions:{},linkedAnimationAssets:{first:{assetId:'first',label:'First'}}},first:line('first','First')}};
  original.assets.first.activeVersion='old';original.assets.first.versions.old={name:'old',file:'old.wav',prompt:'Natural conversational delivery.',createdAt:'2026-11-02T00:00:00Z'};
  await writeManifest(manifestPath,original);
  const draft=structuredClone(original);
  for(const id of ['well','failed']) {draft.assets[id]=line(id,id==='well'?'A stone well.':'fail');draft.assets.hero.linkedAnimationAssets[id]={assetId:id,label:id};}
  const calls=[];
  server=createAiAssetDevServer({manifestPath,manifestModulePath:modulePath,assetsDir:dir,port:0,audioProvider:{async generate({asset}){
   calls.push(asset.id);if(asset.id==='failed')throw new Error('Test provider failure');
   return [{image:Buffer.from('test audio'),mimeType:'audio/wav',prompt:'Natural conversational delivery.'}];
  }}});
  await server.listen();const client=new AiAssetDebugClient(`http://127.0.0.1:${server.server.address().port}`);
  const result=await regenerateAndPromoteVoiceLines({manifest:draft,voiceAssetId:'hero',client,versionName:id=>`new-${id}`});
  assert.deepEqual(calls,['first','well','failed'],result.failures.map(f=>f.error.message).join('; '));assert.equal(result.promoted.length,2);
  assert.equal(result.failures.length,1);assert.match(result.failures[0].error.message,/Test provider failure/);
  assert.equal(result.manifest.assets.failed.voiceSettings.text,'fail');
  assert.equal(result.manifest.assets.hero.linkedAnimationAssets.failed.assetId,'failed');
  const saved=await readManifest(manifestPath);
  assert.equal(saved.assets.well.voiceSettings.text,'A stone well.');
  assert.equal(saved.assets.well.activeVersion,'new-well');
  assert.equal(saved.assets.hero.linkedAnimationAssets.well.assetId,'well');
  assert.deepEqual(saved.assets.first.versions.old,original.assets.first.versions.old);
  assert.equal(saved.assets.failed,undefined,'An unpaid failed draft does not overwrite the saved catalog');
  assert.equal(original.assets.well,undefined,'Caller-owned draft and saved state stay separate');
  // Direct recording works without an earlier generation request, too.
  await client.save({assetId:'recorded',versionName:'take',dataUrl:'data:audio/wav;base64,dGFrZQ==',prompt:'Natural conversational delivery.',voiceSettings:{voiceAssetId:'hero',text:'Recorded first.'},activate:true});
  assert.equal((await readManifest(manifestPath)).assets.recorded.activeVersion,'take');
  const before=calls.length;
  await assert.rejects(client.generate({assetId:'unknown'}),/requires text and a voice asset/);
  await assert.rejects(client.generate({assetId:'bad-voice',voiceSettings:{voiceAssetId:'missing',text:'Hello'}}),/Unknown or non-voice/);
  assert.equal(calls.length,before,'Invalid draft definitions never reach a paid provider');
 }finally{await server?.close();await rm(dir,{recursive:true,force:true});}
});
