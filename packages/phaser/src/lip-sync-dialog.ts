import { LIP_SYNC_SHAPES, LIP_SYNC_LABELS, selectedLipSyncTrack, type AiAssetManifest, type AiLipSyncTrack, type AiMouthSet, type AiAssetFrameGrid, type AiPortraitEyePose, type AiPortraitEyes } from '@ai-game-assets/core';
import type { AiAssetDebugClient } from './debug-client.js';
import { openFrameTouchUpEditor, startGeneratingStatusAnimation, stopStatusAnimation } from './designer-support.js';
import { createVoiceTakePlayer } from './voice-take-player.js';
import { AiPortraitLipSync } from './lip-sync-player.js';

type Candidate = { dataUrl: string; mouthSet: AiMouthSet; frameGrid: AiAssetFrameGrid; prompt?: string };
const drafts = new Map<string, Candidate[]>();

/** Portrait-only authoring. The ordinary speaking animation is never replaced. */
export function openLipSyncDialog(options: {
  root: HTMLElement; manifest: AiAssetManifest; assetId: string; client: AiAssetDebugClient;
  resolveAssetUrl(file: string): string; onManifest(manifest: AiAssetManifest): void;
}) {
  let manifest = options.manifest, busy = false, disposed = false, candidate: Candidate | undefined;
  let previewManifest: AiAssetManifest | undefined;
  let sheet: HTMLImageElement | undefined, track: AiLipSyncTrack | undefined;
  let player: ReturnType<typeof createVoiceTakePlayer> | undefined;
  let raf = 0;
  const portrait = () => manifest.assets[options.assetId]!;
  const doc = options.root.ownerDocument;
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const el = doc.createElement(tag); if (text) el.textContent = text; return el; };
  const modal = make('div'); modal.className = 'ai-game-assets-designer__modal'; modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-label','Portrait lip sync');
  const card = make('div'); card.className = 'ai-game-assets-designer__modal-card ai-game-assets-designer__lip-sync'; card.style.cssText = 'width:min(1080px,94vw);max-height:92vh;overflow:auto;display:grid;gap:14px';
  const previousFocus = doc.activeElement as HTMLElement | null;
  const status = make('p'); status.setAttribute('role','status');
  status.style.cssText = 'position:sticky;top:0;z-index:1;background:#20232c;padding:8px;border-radius:6px;margin:0';
  const progress = make('progress'); progress.hidden = true; progress.style.width = '100%';
  const btn = (label: string, action: () => void) => { const b = make('button',label); b.type = 'button'; b.onclick = action; return b; };
  const field = (label: string, input: HTMLElement) => { const el = make('label',label + ' '); el.append(input); return el; };
  const row = (...children: HTMLElement[]) => { const el = make('div'); el.style.cssText = 'display:flex;gap:12px;align-items:center;flex-wrap:wrap'; el.append(...children); return el; };
  const publish = (next?: AiAssetManifest) => { if (next) { manifest = next; previewManifest=undefined; if (!disposed) options.onManifest(next); } };
  const run = async (action: () => Promise<void>) => {
    if (busy || disposed) return;
    busy = true; card.setAttribute('aria-busy','true');
    for (const control of card.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('button,input,select')) control.disabled = true;
    try { await action(); } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    finally { busy = false; card.removeAttribute('aria-busy'); stopStatusAnimation(status); for (const control of card.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('button,input,select')) control.disabled = false; }
  };
  const enabled = make('input'); enabled.type = 'checkbox'; enabled.checked = portrait().lipSync?.enabled ?? false;
  const voice = make('select'); voice.setAttribute('aria-label','Portrait voice'); voice.append(make('option','Choose a voice'));
  voice.options[0]!.value = '';
  for (const asset of Object.values(manifest.assets).filter(a => a.kind === 'voice')) { const option = make('option',asset.id.replace(/^voice\./,'')); option.value = asset.id; voice.append(option); }
  voice.value = portrait().lipSync?.voiceAssetId ?? '';
  const language = make('input'); language.value = portrait().lipSync?.language ?? 'en'; language.size = 5; language.setAttribute('aria-label','Language code');
  const wpm = make('input'); wpm.type = 'number'; wpm.min = '40'; wpm.max = '400'; wpm.value = String(portrait().lipSync?.wordsPerMinute ?? 150); wpm.style.width = '80px';
  async function saveSettings() {
    const settings = { ...portrait().lipSync, enabled: enabled.checked, voiceAssetId: voice.value, language: language.value.trim() || 'en', wordsPerMinute: Number(wpm.value) || 150, ...layerSettings() };
    publish((await options.client.lipSync({ action: 'settings', assetId: options.assetId, settings })).manifest);
    populateLines(); status.textContent = 'Portrait settings saved.';
  }
  const settings = row(field('Enabled',enabled),field('Voice',voice),field('Language',language),field('Text speed',wpm),btn('Save settings',() => void run(saveSettings)));
  const intro = make('p','Enable lip sync for this portrait, select its voice, then create mouth shapes. Audio is analyzed locally; unvoiced lines use text. Other portraits and in-world animations are unchanged.');
  const base = make('img'); base.src = options.resolveAssetUrl(portrait().versions[portrait().activeVersion]!.file); base.draggable = false; base.alt = 'Portrait base image'; base.style.cssText = 'width:100%;display:block;pointer-events:none';
  const stage = make('div'); stage.style.cssText = 'position:relative;width:256px;max-width:100%;touch-action:none;background:#252730'; stage.append(base);
  const regionBox = make('div'); regionBox.style.cssText = 'position:absolute;border:2px solid #d7b85c;box-sizing:border-box;pointer-events:none'; stage.append(regionBox);
  const size = { width: portrait().dimensions?.width ?? 256, height: portrait().dimensions?.height ?? 256 };
  let region = manifest.assets[portrait().lipSync?.mouthAssetId ?? '']?.mouthSet?.editRegion ?? { x: Math.round(size.width*.3), y: Math.round(size.height*.48), width: Math.round(size.width*.4), height: Math.round(size.height*.3) };
  const regionInputs = (['x','y','width','height'] as const).map(key => {
    const input = make('input'); input.type = 'number'; input.value = String(region[key]); input.style.width = '65px'; input.min = key === 'x' || key === 'y' ? '0' : '1';
    input.oninput = () => { region = { ...region, [key]: Math.round(Number(input.value)) }; showRegion(false); };
    return { key, input, label: field(key,input) };
  });
  const showRegion = (syncInputs = true) => {
    regionBox.style.left = `${region.x/size.width*100}%`; regionBox.style.top = `${region.y/size.height*100}%`;
    regionBox.style.width = `${region.width/size.width*100}%`; regionBox.style.height = `${region.height/size.height*100}%`;
    if (syncInputs) for (const entry of regionInputs) entry.input.value = String(region[entry.key]);
  };
  let drag: { x: number; y: number; pointer: number } | undefined;
  const position = (event: PointerEvent) => { const r = stage.getBoundingClientRect(); return { x: Math.max(0,Math.min(size.width,Math.round((event.clientX-r.left)/r.width*size.width))), y: Math.max(0,Math.min(size.height,Math.round((event.clientY-r.top)/r.height*size.height))) }; };
  stage.onpointerdown = event => { if (busy) return; event.preventDefault(); drag = { ...position(event), pointer:event.pointerId }; stage.setPointerCapture(event.pointerId); };
  stage.onpointermove = event => { if (!drag || event.pointerId !== drag.pointer) return; const p=position(event); region={ x:Math.min(p.x,drag.x),y:Math.min(p.y,drag.y),width:Math.max(1,Math.abs(p.x-drag.x)),height:Math.max(1,Math.abs(p.y-drag.y)) }; showRegion(); };
  stage.onpointerup = stage.onpointercancel = () => { drag=undefined; };
  const regionHelp = make('p','Drag a rectangle around the lips and jaw. Pixels outside it remain identical to the base portrait. Include enough space for an open mouth.');
  const generated = make('div'); generated.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px';
  const poses = make('div'); poses.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px';
  const layered=make('input');layered.type='checkbox';layered.checked=portrait().lipSync?.layered??false;
  const eyeAsset=make('select');eyeAsset.setAttribute('aria-label','Eye artwork');
  const noEyes=make('option','No eye artwork');noEyes.value='';eyeAsset.append(noEyes);
  for(const a of Object.values(manifest.assets).filter(a=>a.frameGrid?.frameWidth===size.width&&a.frameGrid?.frameHeight===size.height&&!a.mouthSet)){
    const option=make('option',a.id);option.value=a.id;eyeAsset.append(option);
  }
  eyeAsset.value=portrait().lipSync?.eyes?.assetId??'';
  const blink=make('input'),gaze=make('input');blink.type=gaze.type='checkbox';
  blink.checked=portrait().lipSync?.eyes?.blink!==false;gaze.checked=portrait().lipSync?.eyes?.gaze!==false;
  const eyeRegion=portrait().lipSync?.eyes?.region??{x:Math.round(size.width*.25),y:Math.round(size.height*.35),width:Math.round(size.width*.5),height:Math.round(size.height*.12)};
  const eyeBounds=(['x','y','width','height'] as const).map(key=>{
    const input=make('input');input.type='number';input.min=key==='x'||key==='y'?'0':'1';input.value=String(eyeRegion[key]);input.style.width='65px';input.setAttribute('aria-label',`Eye region ${key}`);
    return {key,input,label:field(key,input)};
  });
  const eyePoses=['open','half','closed','left','right'] as const;
  const eyeFrames=eyePoses.map((pose,index)=>{
    const input=make('input');input.type='number';input.min='1';input.value=String((portrait().lipSync?.eyes?.frames[pose]??index)+1);input.style.width='60px';input.setAttribute('aria-label',`Eye ${pose} frame`);
    return {pose,input,label:field(pose,input)};
  });
  function layerSettings(){
    const eyes:AiPortraitEyes|undefined=eyeAsset.value?{...portrait().lipSync?.eyes,assetId:eyeAsset.value,region:Object.fromEntries(eyeBounds.map(({key,input})=>[key,Number(input.value)])) as AiPortraitEyes['region'],
      frames:Object.fromEntries(eyeFrames.map(({pose,input})=>[pose,Number(input.value)-1])) as AiPortraitEyes['frames'],blink:blink.checked,gaze:gaze.checked}:undefined;
    return {layered:layered.checked,eyes};
  }
  const renderer=new AiPortraitLipSync({document:doc,size:224,resolveAssetUrl:options.resolveAssetUrl,manifest:()=>{
    if(previewManifest)return previewManifest;
    const current=portrait(),id=current.lipSync?.mouthAssetId??`${current.id}.mouths`;
    return previewManifest={...manifest,assets:{...manifest.assets,[current.id]:{...current,lipSync:{...current.lipSync!,...layerSettings(),mouthAssetId:id}},
      ...(candidate?{[id]:{...manifest.assets[id]!,id,kind:'spritesheet' as const,frameGrid:candidate.frameGrid,mouthSet:candidate.mouthSet,activeVersion:'preview',versions:{preview:{name:'preview',file:candidate.dataUrl,prompt:'Preview',createdAt:'',mouthSet:candidate.mouthSet}}}}:{})}};
  }});
  const preview=renderer.canvas;preview.style.background='#252730';
  const eyePreview=make('select');eyePreview.setAttribute('aria-label','Preview eye pose');
  for(const pose of ['automatic',...eyePoses]){const option=make('option',pose==='automatic'?'Automatic blink and gaze':pose);option.value=pose;eyePreview.append(option);}
  eyePreview.onchange=()=>renderer.previewEyePose(eyePreview.value==='automatic'?undefined:eyePreview.value as AiPortraitEyePose);
  for(const input of [layered,eyeAsset,blink,gaze,...eyeBounds.map(x=>x.input),...eyeFrames.map(x=>x.input)])input.addEventListener('change',()=>{previewManifest=undefined;renderer.show(options.assetId);renderer.refresh();});
  const layerPanel=make('details');layerPanel.open=layered.checked;
  layerPanel.append(make('summary','Independent face layers'),make('p','Keep the base face fixed. The mouth/jaw region is replaced by speech; the eye region blinks and looks around on a separate clock. Eye sheets use full-size portrait cells, so all layers share the same anchor.'),
    row(field('Use independent layers',layered),field('Eye artwork',eyeAsset)),row(field('Blink',blink),field('Look around',gaze)),row(...eyeBounds.map(x=>x.label)),row(...eyeFrames.map(x=>x.label)),
    btn('Save face layers',()=>void run(saveSettings)));

  const shapeLabel = make('span','Rest');
  function draw(canvas: HTMLCanvasElement, frame: number) {
    if (!sheet || !candidate) return;
    const g=candidate.frameGrid, ctx=canvas.getContext('2d')!;
    ctx.clearRect(0,0,canvas.width,canvas.height); ctx.imageSmoothingEnabled=true;
    const scale=Math.min(canvas.width/g.frameWidth,canvas.height/g.frameHeight), width=g.frameWidth*scale,height=g.frameHeight*scale;
    ctx.drawImage(sheet,(g.margin??0)+(frame%g.columns)*(g.frameWidth+(g.spacing??0)),(g.margin??0)+Math.floor(frame/g.columns)*(g.frameHeight+(g.spacing??0)),g.frameWidth,g.frameHeight,(canvas.width-width)/2,(canvas.height-height)/2,width,height);
  }
  async function choose(next: Candidate) {
    const image = new Image(); image.crossOrigin='anonymous'; image.src=next.dataUrl; await image.decode();
    candidate=next; sheet=image; previewManifest=undefined; renderPoses(); renderer.show(options.assetId); renderer.refresh();
  }
  function renderPoses() {
    poses.replaceChildren(); if (!candidate) return;
    for (const shape of LIP_SYNC_SHAPES) {
      const tile=make('div'), canvas=make('canvas'); canvas.width=160;canvas.height=160;canvas.style.cssText='width:100%;max-height:160px;object-fit:contain;background:#252730';
      const mapping=make('select'); mapping.setAttribute('aria-label',`${LIP_SYNC_LABELS[shape]} frame`);
      for(let i=0;i<(candidate.frameGrid.frameCount??candidate.frameGrid.columns*candidate.frameGrid.rows);i++){const option=make('option',`Frame ${i+1}`);option.value=String(i);mapping.append(option);}
      mapping.value=String(candidate.mouthSet.frames[shape]); mapping.onchange=()=>{ if (busy || !candidate)return;candidate.mouthSet.frames[shape]=Number(mapping.value);previewManifest=undefined;draw(canvas,Number(mapping.value)); };
      draw(canvas,candidate.mouthSet.frames[shape]);
      const edit=btn('Touch up',()=>{
        if(busy||!candidate)return;
        const current=candidate, frame=current.mouthSet.frames[shape], g=current.frameGrid;
        const crop=make('canvas');crop.width=g.frameWidth;crop.height=g.frameHeight;draw(crop,frame);
        void openFrameTouchUpEditor({root:options.root,asset:portrait(),title:LIP_SYNC_LABELS[shape],frameSrc:crop.toDataURL(),displaySize:{width:256,height:256},
          onSave:async dataUrl=>{
            const edited=new Image();edited.src=dataUrl;await edited.decode();
            const whole=make('canvas');whole.width=sheet!.naturalWidth;whole.height=sheet!.naturalHeight;
            const ctx=whole.getContext('2d')!;ctx.drawImage(sheet!,0,0);const x=frame%g.columns*g.frameWidth,y=Math.floor(frame/g.columns)*g.frameHeight;
            ctx.clearRect(x,y,g.frameWidth,g.frameHeight);ctx.drawImage(edited,x,y,g.frameWidth,g.frameHeight);
            await choose({...current,dataUrl:whole.toDataURL()});status.textContent='Touch-up ready. Save mouth set to apply it.';
          }});
      });
      const poseUpload=make('input');poseUpload.type='file';poseUpload.accept='image/png,image/webp,image/jpeg';poseUpload.hidden=true;
      poseUpload.onchange=()=>void run(async()=>{
        const file=poseUpload.files?.[0],current=candidate;if(!file||!current)return;
        const url=URL.createObjectURL(file);
        try {
          const image=new Image();image.src=url;await image.decode();const g=current.frameGrid;
          if(image.width!==g.frameWidth||image.height!==g.frameHeight)throw new Error(`Use a ${g.frameWidth} × ${g.frameHeight} portrait frame so its anchor matches the other poses.`);
          const whole=make('canvas');whole.width=sheet!.naturalWidth;whole.height=sheet!.naturalHeight;const ctx=whole.getContext('2d')!;ctx.drawImage(sheet!,0,0);
          const frame=current.mouthSet.frames[shape],x=frame%g.columns*g.frameWidth,y=Math.floor(frame/g.columns)*g.frameHeight;
          ctx.clearRect(x,y,g.frameWidth,g.frameHeight);ctx.drawImage(image,x,y);
          await choose({...current,dataUrl:whole.toDataURL()});status.textContent='Pose uploaded. Save mouth set to apply it.';
        } finally { URL.revokeObjectURL(url); }
      });
      tile.append(canvas,make('div',LIP_SYNC_LABELS[shape]),mapping,row(edit,btn('Upload pose',()=>{if(!busy)poseUpload.click();})),poseUpload);poses.append(tile);
    }
  }
  function renderCandidates(list: Candidate[]) {
    generated.replaceChildren();list.forEach((item,index)=>{
      const tile=make('div'),image=make('img');image.src=item.dataUrl;image.alt=`Mouth set option ${index+1}`;image.style.width='100%';
      tile.append(image,btn(`Preview option ${index+1}`,()=>void run(async()=>{await choose(structuredClone(item));status.textContent='Previewing this mouth set. Save mouth set to use it.';})));generated.append(tile);
    });
  }
  const generate=btn('Generate 3 mouth sets',()=>void run(async()=>{
    region = Object.fromEntries(regionInputs.map(({key,input})=>[key,Math.round(Number(input.value))])) as typeof region;
    await saveSettings();startGeneratingStatusAnimation(status,'Generating 3 mouth sets');
    const result=await options.client.lipSync({action:'generate',assetId:options.assetId,region});
    const list=result.candidates??[];drafts.set(options.assetId,list);renderCandidates(list);
    status.textContent='Choose a set to inspect all nine mouth poses, then save it.';
  }));
  const upload=make('input');upload.type='file';upload.accept='image/png,image/webp,image/jpeg';upload.hidden=true;
  const columns=make('input'), rows=make('input');for(const input of[columns,rows]){input.type='number';input.min='1';input.value='3';input.style.width='55px';}
  upload.onchange=()=>void run(async()=>{
    const file=upload.files?.[0];if(!file)return;
    const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
    const image=new Image();image.src=dataUrl;await image.decode();const cols=Number(columns.value),rs=Number(rows.value);
    if(cols*rs<9||image.width%cols||image.height%rs)throw new Error('The sheet needs at least nine evenly sized cells.');
    await choose({dataUrl,frameGrid:{frameWidth:image.width/cols,frameHeight:image.height/rs,columns:cols,rows:rs,frameCount:cols*rs},mouthSet:{sourceAssetId:options.assetId,sourceVersion:portrait().activeVersion,frames:Object.fromEntries(LIP_SYNC_SHAPES.map((s,i)=>[s,i])) as AiMouthSet['frames']}});
    status.textContent='Map the uploaded frames below, then save the mouth set.';
  });
  const save=btn('Save mouth set',()=>void run(async()=>{
    if(!candidate)throw new Error('Choose or upload a mouth set first.');await saveSettings();
    const dataUrl=candidate.dataUrl.startsWith('data:')?candidate.dataUrl:await fetch(candidate.dataUrl).then(async response=>{
      if(!response.ok)throw new Error('Could not load the selected mouth sheet.');
      const blob=await response.blob();return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
    });
    publish((await options.client.lipSync({action:'save-mouths',assetId:options.assetId,dataUrl,mouthSet:candidate.mouthSet,prompt:candidate.prompt,...candidate.frameGrid})).manifest);
    status.textContent='Mouth set saved and selected for this portrait.';
  }));
  const line=make('select');line.setAttribute('aria-label','Preview voice line');line.style.maxWidth='100%';
  const take=make('select');take.setAttribute('aria-label','Preview recording');
  const script=make('blockquote');const transport=make('div');const cues=make('div');cues.style.cssText='max-height:220px;overflow:auto';
  function populateLines() {
    const previous=line.value;line.replaceChildren();
    for(const asset of Object.values(manifest.assets).filter(a=>a.kind==='voice-line'&&(a.voiceSettings?.voiceAssetId??a.versions[a.activeVersion]?.voiceSettings?.voiceAssetId)===voice.value)){
      const option=make('option',asset.voiceSettings?.text??asset.prompt);option.value=asset.id;line.append(option);
    }
    if([...line.options].some(o=>o.value===previous))line.value=previous;
    populateTakes();
  }
  function populateTakes(){take.replaceChildren();const asset=manifest.assets[line.value];if(!asset)return;
    const textOption=make('option','Text only (estimate)');textOption.value='';take.append(textOption);
    for(const[name,version]of Object.entries(asset.versions)){const option=make('option',`${name===asset.activeVersion?'★ ':''}${name}`);option.value=name;take.append(option);}
    take.value=asset.activeVersion;
    void loadLine();
  }
  let lineRevision=0;
  async function loadLine(){
    const revision=++lineRevision;player?.dispose();player=undefined;transport.replaceChildren();track=undefined;
    const asset=manifest.assets[line.value];if(!asset)return;
    const version=asset.versions[take.value],text=version?.voiceSettings?.text??asset.voiceSettings?.text??asset.prompt;script.textContent=text;
    track=selectedLipSyncTrack({...asset,activeVersion:take.value});
    if(version?.file){
      player=createVoiceTakePlayer({src:options.resolveAssetUrl(version.file),durationSeconds:version.durationSeconds,playback:{...asset.audioPlayback,...version.audioPlayback},
        onTrim:async(start,end)=>{publish(await options.client.trimVoiceLineVersion({assetId:asset.id,versionName:take.value,trimStartSeconds:start,trimEndSeconds:end}));}});
      transport.append(player.root);
      if(!track)status.textContent='This recording has no current timing. Analyze it below.';
    }else{
      try{const result=await options.client.lipSync({action:'text',assetId:asset.id,text,settings:portrait().lipSync});if(revision!==lineRevision)return;track=result.track;}
      catch(error){status.textContent=String(error);}
      transport.append(btn('Preview text speech',()=>{renderer.speak(Symbol(),text);}));
    }
    if(revision!==lineRevision)return;
    renderer.stop();renderer.show(options.assetId);
    if(version?.file) renderer.speak(revision,text,{...asset,activeVersion:take.value},()=>({seconds:player?.audio.currentTime??0,playing:!!player&&!player.audio.paused&&!player.audio.ended,paused:!!player&&player.audio.paused&&player.audio.currentTime>0&&!player.audio.ended}));
    renderCues();
  }
  function renderCues(){cues.replaceChildren();if(!track)return;
    track.cues.forEach((cue,index)=>{
      const select=make('select');for(const shape of LIP_SYNC_SHAPES){const option=make('option',LIP_SYNC_LABELS[shape]);option.value=shape;select.append(option);}select.value=cue.shape;
      select.onchange=()=>{cue.shape=select.value as typeof cue.shape;};
      const start=make('input'),end=make('input');for(const input of[start,end]){input.type='number';input.step='.01';input.min='0';input.style.width='80px';}
      start.value=cue.start.toFixed(2);end.value=cue.end.toFixed(2);start.oninput=()=>{cue.start=Number(start.value);};end.oninput=()=>{cue.end=Number(end.value);};
      select.setAttribute('aria-label',`Cue ${index+1} shape`);start.setAttribute('aria-label',`Cue ${index+1} start`);end.setAttribute('aria-label',`Cue ${index+1} end`);
      cues.append(row(make('span',String(index+1)),select,start,end));
    });
  }
  line.onchange=populateTakes;take.onchange=()=>void loadLine();
  const analyze=btn('Analyze this take',()=>void run(async()=>{if(!take.value){await loadLine();status.textContent='Text timing estimated. Choose a recording to analyze audio.';return;}status.textContent='Analyzing recording locally…';publish((await options.client.lipSync({action:'analyze',assetId:line.value,versionName:take.value})).manifest);await loadLine();status.textContent='Timing is ready.';}));
  const mode=make('select');for(const[value,label]of[['missing','Missing or outdated'],['all','All selected recordings']]){const option=make('option',label);option.value=value!;mode.append(option);}
  const analyzeAll=btn('Analyze voice lines',()=>void run(async()=>{
    await saveSettings();const ids=[...line.options].map(o=>o.value).filter(id=>mode.value==='all'||!selectedLipSyncTrack(manifest.assets[id]));
    progress.hidden=false;progress.max=ids.length||1;progress.value=0;const failures:string[]=[];
    for(const id of ids){status.textContent=`Analyzing ${progress.value+1} of ${ids.length}…`;
      try{publish((await options.client.lipSync({action:'analyze',assetId:id})).manifest);}catch(error){failures.push(`${id}: ${String(error)}`);}progress.value++;
    }
    await loadLine();status.textContent=failures.length?`${ids.length-failures.length}/${ids.length} analyzed. ${failures.join('; ')}`:`All ${ids.length} lines analyzed. New generated or recorded takes will be analyzed automatically.`;
  }));
  const saveCues=btn('Save timing edits',()=>void run(async()=>{if(!track)return;if(!take.value&&manifest.assets[line.value]?.activeVersion)throw new Error('This is an estimated text preview. Choose a recording to edit its saved timing.');publish((await options.client.lipSync({action:'save-track',assetId:line.value,versionName:take.value||undefined,track})).manifest);status.textContent='Timing saved.';}));
  const details=make('details');details.append(make('summary','Edit mouth cues'),cues,saveCues);
  const dispose=()=>{disposed=true;player?.dispose();renderer.destroy();cancelAnimationFrame(raf);stopStatusAnimation(status);modal.remove();if(previousFocus?.isConnected)previousFocus.focus();};
  const close=btn('Close',()=>{if(busy){status.textContent='Please wait for the current save or analysis to finish.';return;}dispose();});
  card.append(make('h2','Portrait lip sync'),status,intro,settings,make('h3','1 · Mouth artwork'),row(stage,regionHelp),row(...regionInputs.map(i=>i.label)),row(generate,field('Sheet columns',columns),field('Rows',rows),btn('Upload mouth sheet',()=>{if(!busy)upload.click();}),upload),generated,poses,save,
    layerPanel,make('h3','2 · Speech timing'),row(line,take),script,row(preview,shapeLabel,eyePreview),transport,row(analyze,mode,analyzeAll),progress,details,row(close));
  modal.append(card);options.root.append(modal);showRegion();populateLines();
  const mouth=manifest.assets[portrait().lipSync?.mouthAssetId??''];const version=mouth?.versions[mouth.activeVersion];
  if(mouth?.mouthSet&&mouth.frameGrid&&version)void choose({dataUrl:options.resolveAssetUrl(version.file),mouthSet:structuredClone(version.mouthSet??mouth.mouthSet),frameGrid:version.mouthSet?.frameGrid??mouth.frameGrid}).catch(e=>{status.textContent=String(e);});
  renderCandidates(drafts.get(options.assetId)??[]);
  const tick=()=>{if(disposed)return;const shape=(preview.dataset.lipSyncShape??'X') as keyof typeof LIP_SYNC_LABELS;shapeLabel.textContent=LIP_SYNC_LABELS[shape];raf=requestAnimationFrame(tick);};tick();
  modal.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.click();}
    if(event.key==='Tab'){const focusable=[...modal.querySelectorAll<HTMLElement>('button:not(:disabled),input:not([hidden]),select,summary')].filter(el=>el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first?.focus();}}
  });enabled.focus();
  return dispose;
}
