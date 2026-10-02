import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
const { chromium } = await import(process.env.VTT_PLAYWRIGHT_MODULE ?? 'playwright');
const artifacts = process.env.VTT_QA_ARTIFACTS ?? await mkdtemp(path.join(tmpdir(), 'vtt-grid-anchors-'));
await mkdir(artifacts, { recursive: true });
const fixtures = await mkdtemp(path.join(tmpdir(), 'vtt-grid-map-'));
const liveMap = path.join(fixtures, 'kan-09-live-map.png');
const reviewMap = path.join(fixtures, 'kan-09-review-map.png');
// Deterministic PNG fixture with 50px grid lines; no image tooling dependency.
const width=1000,height=800,pixels=Buffer.alloc(height*(width*4+1));
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const offset=y*(width*4+1)+1+x*4,color=x%50===0||y%50===0?136:51;
  pixels[offset]=color;pixels[offset+1]=color;pixels[offset+2]=color;pixels[offset+3]=255;
}
const chunk=(type,data)=>{
  const body=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;
  for(const byte of body){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([length,body,checksum]);
};
const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
const image=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
await writeFile(liveMap,image);await writeFile(reviewMap,image);
const BASE = process.env.VTT_QA_URL ?? 'http://127.0.0.1:5293';
const browser = await chromium.launch({headless:true});
const ctx = await browser.newContext({viewport:{width:1366,height:768}});
const pctx = await browser.newContext({viewport:{width:1160,height:800}});
const gm = await ctx.newPage(), player = await pctx.newPage();
const errors=[], commands=[], traffic=[];
let rejectGrid=false, rejectMap=false, holdGrid=false, held=null, rejectHeld=null;
for(const p of [gm,player]) p.on('pageerror',e=>errors.push(e.message));
await gm.routeWebSocket(url=>url.pathname.startsWith('/socket.io'), ws=>{
  const server=ws.connectToServer();
  ws.onMessage(message=>{
    if(typeof message==='string' && message.startsWith('42')){
      const [event,payload]=JSON.parse(message.slice(2));
      if(event==='message') traffic.push(payload);
      if(event==='message'&&payload.type==='command'){
        commands.push(payload.command);
        if((rejectGrid&&payload.command.type==='scene.setGrid')||(rejectMap&&payload.command.type==='scene.setMap')){
          rejectGrid=false; rejectMap=false;
          ws.send(`42${JSON.stringify(['event',{type:'rejected',clientCommandId:payload.clientCommandId,code:'invalid',message:'QA save rejected'}])}`);
          return;
        }
        if(holdGrid&&payload.command.type==='scene.setGrid'){
          holdGrid=false; held=()=>server.send(message); rejectHeld=()=>ws.send(`42${JSON.stringify(['event',{type:'rejected',clientCommandId:payload.clientCommandId,code:'invalid',message:'QA stale Apply'}])}`); return;
        }
      }
    }
    server.send(message);
  });
});
const mark = name=>console.log('PASS '+name);
const dialog=gm.locator('dialog.grid-editor-modal[open]');
const svg=dialog.locator('.map-grid-canvas');
const apply=dialog.getByRole('button',{name:'Apply grid',exact:true});
const cell=dialog.getByRole('spinbutton',{name:'Cell size (px)',includeHidden:true});
const offx=dialog.getByRole('spinbutton',{name:'Offset X (px)',includeHidden:true});
const values=async()=>({cell:Number(await cell.inputValue()),x:Number(await offx.inputValue()),y:Number(await dialog.getByRole('spinbutton',{name:'Offset Y (px)',includeHidden:true}).inputValue())});
const settle=async()=>gm.evaluate(()=>new Promise(resolve=>globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(resolve))));
const hoverPoint=async(point)=>{await svg.scrollIntoViewIfNeeded();const p=await screen(point);await gm.mouse.move(p.x,p.y);await settle();};
const adv=async()=>{const b=dialog.getByRole('button',{name:'Advanced',exact:true});if(await b.getAttribute('aria-expanded')==='false')await b.click();};
const open=async()=>{const manage=gm.getByRole('tab',{name:'Manage'});if(await manage.getAttribute('aria-selected')!=='true')await manage.click();await gm.getByRole('button',{name:'Adjust grid',exact:true}).click();await dialog.waitFor();};
const screen=async(point)=>svg.evaluate((el,p)=>{const m=el.getScreenCTM();return{x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f};},point);
const clickPoint=async(point,freeform=true)=>{
  await svg.scrollIntoViewIfNeeded();
  const p=await screen(point);
  if(freeform)await gm.keyboard.down('Shift');
  try {await gm.mouse.click(p.x,p.y);} finally {if(freeform)await gm.keyboard.up('Shift');}
};
const draw=async(a,b,freeform=true)=>{
  await dialog.getByRole('button',{name:'Start over',exact:true}).click();
  await clickPoint(a,freeform); await clickPoint(b,freeform);
};
const anchorPoint=async(anchor)=>svg.locator(`[data-anchor="${anchor}"] .grid-anchor-dot`).evaluate(el=>({x:Number(el.getAttribute('cx')),y:Number(el.getAttribute('cy'))}));
const closeAdvanced=async()=>{const b=dialog.getByRole('button',{name:'Advanced',exact:true});if(await b.getAttribute('aria-expanded')==='true')await b.click();};
const gridCommands=()=>commands.filter(c=>c.type==='scene.setGrid');
const creds=async()=>gm.evaluate(()=>JSON.parse(globalThis.localStorage.getItem(`vtt.credentials.${globalThis.location.pathname.split('/').at(-1)}`)));
const gridCount=()=>gridCommands().length;
try{
  await gm.goto(BASE+'/signin');await gm.getByRole('button',{name:'Continue as guest'}).click();
  await gm.getByLabel('Room name').fill('KAN09 sample QA');await gm.getByLabel('Your name').fill('Sample GM');
  await gm.getByRole('button',{name:'Create room',exact:true}).click();await gm.waitForURL(/\/r\//);
  const room=await creds();
  await player.goto(BASE+'/join/'+room.inviteCode);await player.getByLabel('Your name').fill('Sample Player');
  await player.getByRole('button',{name:'Join',exact:true}).click();await player.waitForURL(/\/r\//);
  assert.equal(await player.getByRole('button',{name:'Adjust grid'}).count(),0);
  await gm.getByRole('tab',{name:'Manage'}).click();
  await open();await adv();const emptyMapDraft=await values();
  await clickPoint({x:120,y:120},false);await hoverPoint({x:270,y:200});
  assert.equal((await values()).cell,150);assert.equal(await apply.isDisabled(),true);
  await gm.evaluate(()=>globalThis.window.dispatchEvent(new Event('blur')));await settle();
  assert.deepEqual(await values(),emptyMapDraft);assert.equal(gridCount(),0);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  mark('Missing-map fallback displays temporary geometry and restores confirmed values without a render loop or grid command');
  await gm.getByRole('button',{name:'From library',exact:true}).click();
  await gm.getByRole('dialog',{name:'Choose a map'}).getByRole('button',{name:'The Broken Span'}).click();
  await gm.getByRole('dialog',{name:'Choose a map'}).waitFor({state:'hidden'});
  assert.equal(await dialog.count(),0);
  mark('Saved-grid placement skips setup; players have no grid editor');
  // Add a token through the real command API by opening an independent socket using the GM credential.
  const {io}=await import('socket.io-client');
  const control=io(BASE,{transports:['websocket'],auth:{roomId:room.roomId,guestToken:room.guestToken}});
  let state;
  control.on('event',m=>{if(m.type==='welcome')state=m.state;});
  await new Promise(r=>control.once('connect',r));
  while(!state)await new Promise(r=>setTimeout(r,20));
  const command=async(c)=>{
    const id='qa'+Math.random();
    const reply=new Promise(resolve=>{const listener=m=>{if(m.clientCommandId===id){control.off('event',listener);resolve(m);}};control.on('event',listener);});
    control.emit('message',{type:'command',clientCommandId:id,command:c});
    return reply;
  };
  assert.equal((await command({type:'token.create',name:'Marker',ownerId:null,position:{x:320,y:240},size:1,rotation:0,color:'#ff0000',imageUrl:null,hidden:false,stats:{hp:null,maxHp:null,ac:null}})).type,'ack');
  await player.getByRole('tab',{name:'Tokens'}).click();await player.getByText('Marker',{exact:true}).waitFor();
  const before=await player.locator('.board-canvas').screenshot();
  await open();
  assert.equal(await dialog.getByText('Confidence: manual').count(),0);
  assert.equal(await cell.isVisible(),false);
  assert.equal(await dialog.getByLabel('Distance per square').inputValue(),'5');
  await dialog.getByRole('button',{name:'3×3',exact:true}).click();
  const a={x:425.5,y:315.75}, b={x:635.875,y:420.25};
  const original=await values(), initialTraffic=traffic.length;
  await clickPoint(a);
  assert.match(await dialog.locator('.map-grid-status').innerText(),/Step 2/);
  assert.notDeepEqual(await values(),original);assert.equal(await apply.isDisabled(),true);
  await hoverPoint(b);
  const live=await values();assert.equal(live.cell,70);
  assert.ok(Object.values(live).every(n=>Number.isInteger(n*2)));assert.equal(traffic.length,initialTraffic);
  assert.equal(await svg.locator('.is-provisional').count(),1);
  assert.equal(await apply.isDisabled(),true);
  assert.ok(before.equals(await player.locator('.board-canvas').screenshot()));
  await new Promise(r=>setTimeout(r,350));
  await gm.evaluate(()=>globalThis.window.dispatchEvent(new Event('blur')));
  await settle();assert.deepEqual(await values(),original);
  assert.equal(await svg.locator('.is-provisional').count(),0);
  const pendingA=await anchorPoint('A');
  assert.ok(Math.abs(pendingA.x-a.x)<0.001&&Math.abs(pendingA.y-a.y)<0.001);
  assert.match(await dialog.locator('.map-grid-status').innerText(),/Step 2/);
  await clickPoint(b);await adv();
  let v=await values();assert.ok(Math.abs(v.cell-70.125)<0.001,JSON.stringify(v));
  assert.equal(gridCount(),0);assert.equal(traffic.length,initialTraffic);
  const during=await player.locator('.board-canvas').screenshot();assert.ok(before.equals(during),'Player pixels changed during draft');
  mark('Live placement fields show snapped geometry without enabling Apply or changing traffic/player pixels; blur restores the draft and retains A');

  await draw(a,{x:a.x+210.9,y:a.y+100},false);
  assert.deepEqual(await values(),{cell:70.5,x:2.5,y:34});
  await dialog.getByRole('button',{name:'Select A',exact:true}).click();
  await clickPoint({x:a.x+20.13,y:a.y+10.17},false);
  assert.deepEqual(await values(),{cell:70.5,x:22.5,y:44});
  await dialog.getByRole('button',{name:'Select A',exact:true}).click();
  await clickPoint({x:445.6375,y:326.24},true);
  const freeOffsets=await values();
  assert.ok(Math.abs(freeOffsets.x-22.6375)<0.001);
  assert.ok(Math.abs(freeOffsets.y-44.24)<0.001);
  await draw(a,{x:a.x+210.9,y:a.y+100},false);
  mark('X/Y offsets snap to exact 0.5px during placement and A repositioning; Shift preserves fractional offsets');
  const confirmedMove=await values(), fixedA=await anchorPoint('A'), fixedB=await anchorPoint('B');
  await dialog.getByRole('button',{name:'Select A',exact:true}).click();
  await hoverPoint({x:a.x+20.13,y:a.y+10.17});
  assert.deepEqual(await values(),{cell:70.5,x:22.5,y:44});
  assert.deepEqual(await anchorPoint('A'),fixedA);assert.deepEqual(await anchorPoint('B'),fixedB);
  await dialog.getByRole('button',{name:'Fit map',exact:true}).click();
  assert.deepEqual(await values(),confirmedMove);
  assert.equal(await dialog.getByRole('button',{name:'Select A',exact:true}).getAttribute('aria-pressed'),'true');
  await hoverPoint({x:a.x+20.13,y:a.y+10.17});await clickPoint({x:a.x+20.13,y:a.y+10.17},false);
  assert.deepEqual(await values(),{cell:70.5,x:22.5,y:44});
  await dialog.getByRole('button',{name:'Select B',exact:true}).click();
  await hoverPoint({x:(await anchorPoint('A')).x+240,y:(await anchorPoint('A')).y+100});
  assert.equal((await values()).cell,80);
  await gm.evaluate(()=>globalThis.window.dispatchEvent(new Event('blur')));await settle();
  assert.deepEqual(await values(),{cell:70.5,x:22.5,y:44});
  await hoverPoint({x:(await anchorPoint('A')).x+240,y:(await anchorPoint('A')).y+100});
  await dialog.getByRole('button',{name:'Start over',exact:true}).click();
  assert.deepEqual(await values(),{cell:70.5,x:22.5,y:44});
  assert.equal(await svg.locator('[data-anchor]').count(),0);
  await draw(a,{x:a.x+210.9,y:a.y+100},false);
  mark('A/B live reposition readouts match snapped geometry; navigation, blur and Start over restore confirmed values, and click confirms locally');
  await dialog.getByRole('button',{name:'Select B',exact:true}).click();
  await clickPoint({x:a.x+212.9,y:a.y+100},false);
  assert.equal((await values()).cell,71);
  await dialog.getByRole('button',{name:'Select B',exact:true}).click();
  await svg.scrollIntoViewIfNeeded();const free=await screen(b);await gm.mouse.move(free.x,free.y);
  const snappedPath=await svg.locator('path').getAttribute('d'),beforeFree=await values();
  await gm.keyboard.down('Shift');
  await gm.evaluate(()=>new Promise(resolve=>globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(resolve))));
  assert.notEqual(await svg.locator('path').getAttribute('d'),snappedPath);
  assert.notDeepEqual(await values(),beforeFree);
  assert.ok(Math.abs((await values()).cell-70.125)<0.001);
  await gm.mouse.down();await gm.mouse.up();await gm.keyboard.up('Shift');
  assert.ok(Math.abs((await values()).cell-70.125)<0.001);
  await draw(a,b);
  mark('Placement and B resizing snap to exact 0.5px cell sizes; Shift changes preview and preserves freeform fractions');
  await closeAdvanced();
  await dialog.getByRole('button',{name:'Select A',exact:true}).click();
  await clickPoint({x:a.x+20,y:a.y+10});
  let refined=await values();assert.ok(Math.abs(refined.cell-v.cell)<0.001);
  assert.ok(Math.abs(refined.x-((v.x+20)%v.cell))<0.001);
  assert.equal(await dialog.getByRole('button',{name:'Select A',exact:true}).getAttribute('aria-pressed'),'false');
  const anchorBefore=await anchorPoint('A'), cornerBefore=await anchorPoint('B');
  await dialog.getByRole('button',{name:'Select B',exact:true}).click();
  await clickPoint({x:cornerBefore.x+30,y:cornerBefore.y+15});
  refined=await values();assert.ok(Math.abs(refined.cell-v.cell-10)<0.001);
  assert.deepEqual(await anchorPoint('A'),anchorBefore);
  await clickPoint(await anchorPoint('A'));
  assert.equal(await dialog.getByRole('button',{name:'Select A',exact:true}).getAttribute('aria-pressed'),'true');
  await clickPoint(await anchorPoint('B'));
  assert.equal(await dialog.getByRole('button',{name:'Select B',exact:true}).getAttribute('aria-pressed'),'true');
  // A zero-sized candidate is invalid and selection remains available for retry.
  await dialog.getByRole('button',{name:'Select A',exact:true}).click();
  await dialog.getByRole('button',{name:'Select B',exact:true}).click();
  const nearA=await anchorPoint('A');
  // Use a degenerate vertical corner away from the A hit region to make the edge constraint zero.
  await draw({x:0,y:300},{x:200,y:450});
  await dialog.getByRole('button',{name:'Select B',exact:true}).click();
  const lastValid=await values();await clickPoint({x:-100,y:50});
  assert.deepEqual(await values(),lastValid);
  assert.equal(await dialog.getByRole('button',{name:'Select B',exact:true}).getAttribute('aria-pressed'),'true');
  await clickPoint({x:250,y:500});
  assert.equal(await dialog.getByRole('button',{name:'Select B',exact:true}).getAttribute('aria-pressed'),'false');
  assert.ok(nearA.x>0);
  mark('Visible handles and labeled controls select and switch anchors; A translates, B resizes, invalid candidates retain geometry and retry');

  await draw(a,b,false);v=await values();
  const move=dialog.getByRole('button',{name:'Select A',exact:true});
  await move.focus();await gm.keyboard.press('ArrowRight');
  const moved=await values();assert.ok(Math.abs(moved.x-v.x-1)<0.001);
  await gm.keyboard.press('Shift+ArrowDown');
  assert.ok(Math.abs((await values()).y-v.y-10)<0.001);
  const resize=dialog.getByRole('button',{name:'Select B',exact:true});
  await resize.focus();const keyboardA=await anchorPoint('A');
  for(const [key,change] of [['ArrowRight',0.5],['ArrowLeft',0],['ArrowDown',0.5],['ArrowUp',0]]){
    await gm.keyboard.press(key);await settle();const resized=await values();
    assert.equal(resized.cell,v.cell+change);
    assert.deepEqual(await anchorPoint('A'),keyboardA);
    assert.equal(Number(await svg.locator('.grid-sample > rect').getAttribute('width'))/3,resized.cell);
    assert.ok(Math.abs((keyboardA.x-resized.x)/resized.cell-Math.round((keyboardA.x-resized.x)/resized.cell))<0.001);
    assert.ok(Math.abs((keyboardA.y-resized.y)/resized.cell-Math.round((keyboardA.y-resized.y)/resized.cell))<0.001);
  }
  await gm.keyboard.press('Enter');await settle();
  const lockedKeyboard=await values(),lockedPath=await svg.locator('path').getAttribute('d');
  assert.equal(await resize.getAttribute('aria-pressed'),'false');
  assert.equal(await svg.evaluate(el=>globalThis.document.activeElement===el),true);
  await hoverPoint({x:a.x+350,y:a.y+220});
  assert.deepEqual(await values(),lockedKeyboard);assert.equal(await svg.locator('path').getAttribute('d'),lockedPath);
  assert.equal(await svg.locator('.is-provisional').count(),0);assert.equal(gridCount(),0);
  await resize.click();await dialog.getByRole('button',{name:'Pan',exact:true}).click();
  await svg.focus();await gm.keyboard.press('Enter');
  assert.equal(await resize.getAttribute('aria-pressed'),'false');assert.deepEqual(await values(),lockedKeyboard);
  await dialog.getByRole('button',{name:'Pan',exact:true}).click();
  mark('B keyboard nudges use 0.5px cell steps in all four directions; offsets match the grid with A fixed and control Enter locks placement');
  await svg.locator('[data-anchor="A"]').focus();await gm.keyboard.press('ArrowLeft');
  await gm.keyboard.press('Enter');await settle();
  assert.equal(await move.getAttribute('aria-pressed'),'false');
  await svg.locator('[data-anchor="B"]').focus();await gm.keyboard.press('ArrowDown');
  assert.equal((await values()).cell,v.cell+0.5);
  assert.equal(await resize.getAttribute('aria-pressed'),'true');
  await gm.keyboard.press('Enter');await settle();
  assert.equal(await resize.getAttribute('aria-pressed'),'false');
  const handleConfirmed=await values();await hoverPoint(b);assert.deepEqual(await values(),handleConfirmed);
  mark('Focused A/B handle arrows select the adjusted anchor; Enter confirms, clears selection and transfers focus to the map');

  await resize.focus();await gm.keyboard.press('Shift+ArrowRight');await settle();
  const fractionalKeyboard=await values();
  assert.ok(Math.abs(fractionalKeyboard.cell-handleConfirmed.cell-10/3)<0.001);
  await gm.keyboard.press('Enter');await settle();
  assert.equal(await resize.getAttribute('aria-pressed'),'false');
  await hoverPoint({x:a.x+400,y:a.y+100});assert.deepEqual(await values(),fractionalKeyboard);
  mark('Shift B arrows retain freeform 10px sample movement; Enter and subsequent hover preserve fractional geometry without resnapping');

  await draw(a,b,false);await resize.click();await hoverPoint(a);await gm.keyboard.press('Enter');await settle();
  assert.equal(await resize.getAttribute('aria-pressed'),'true');assert.equal(gridCount(),0);
  await hoverPoint({x:a.x+240,y:a.y+100});const hoveredB=await values();
  await svg.focus();await gm.keyboard.press('Enter');await settle();
  assert.deepEqual(await values(),hoveredB);assert.equal(await resize.getAttribute('aria-pressed'),'false');
  await move.click();await hoverPoint({x:a.x+30,y:a.y+20});const hoveredA=await values();
  await gm.keyboard.press('Enter');await settle();
  assert.deepEqual(await values(),hoveredA);assert.equal(await move.getAttribute('aria-pressed'),'false');
  await hoverPoint(b);assert.deepEqual(await values(),hoveredA);assert.equal(gridCount(),0);
  await dialog.getByRole('button',{name:'Start over',exact:true}).click();
  await clickPoint(a,false);await hoverPoint({x:a.x+225,y:a.y+100});
  const pendingHover=await values();await svg.focus();await gm.keyboard.press('Enter');await settle();
  assert.deepEqual(await values(),pendingHover);assert.match(await dialog.locator('.map-grid-status').innerText(),/Sample placed/);
  await hoverPoint(b);assert.deepEqual(await values(),pendingHover);assert.equal(gridCount(),0);
  mark('Map/control Enter confirms valid pending B and A/B hover previews locally; invalid B remains selected for retry and Enter emits no save command');

  const beforeFocusedEnter=await values();
  for(const panEnabled of [false,true]){
    if(panEnabled)await dialog.getByRole('button',{name:'Pan',exact:true}).click();
    for(const anchor of ['A','B']){
      for(const target of [dialog.getByRole('button',{name:`Select ${anchor}`,exact:true}),svg.locator(`[data-anchor="${anchor}"]`)]){
        await target.focus();await gm.keyboard.press('Enter');await settle();
        assert.equal(await dialog.getByRole('button',{name:`Select ${anchor}`,exact:true}).getAttribute('aria-pressed'),'false');
        assert.equal(await svg.evaluate(el=>globalThis.document.activeElement===el),true);
        await hoverPoint(b);assert.deepEqual(await values(),beforeFocusedEnter);assert.equal(gridCount(),0);
      }
    }
    if(panEnabled)await dialog.getByRole('button',{name:'Pan',exact:true}).click();
  }
  mark('Enter on focused unselected A/B handles and controls confirms without selecting, including Pan mode');

  for(const count of [1,3,5]){
    await dialog.getByRole('button',{name:count===1?'1 square':`${count}×${count}`,exact:true}).click();
    for(const [sx,sy] of [[1,1],[-1,1],[1,-1],[-1,-1]]){
      await dialog.getByRole('button',{name:'Start over',exact:true}).click();
      await clickPoint({x:700,y:600},false);await hoverPoint({x:700+sx*100*count,y:600+sy*100*count});
      assert.equal((await values()).cell,100);
      await gm.keyboard.press(sx>0?'ArrowRight':'ArrowLeft');await settle();
      assert.equal((await values()).cell,100.5);
      const keyboardCandidate=await values();
      await gm.evaluate(()=>globalThis.window.dispatchEvent(new Event('blur')));await settle();
      await svg.focus();await gm.keyboard.press('Enter');await settle();
      assert.deepEqual(await values(),keyboardCandidate);
      assert.deepEqual(await anchorPoint('A'),{x:700,y:600});
      assert.equal(await svg.locator('.is-provisional').count(),0);assert.equal(gridCount(),0);
    }
  }
  mark('Pending B arrows adjust the visible hover candidate at all counts/quadrants; interruption and Enter retain the adjusted geometry');

  // A 70px seed must remain 70px wide when reinterpreted as three cells.
  await adv();await cell.fill('70');await offx.fill('0');
  await dialog.getByRole('spinbutton',{name:'Offset Y (px)',includeHidden:true}).fill('0');
  await dialog.getByRole('button',{name:'1 square',exact:true}).click();
  await clickPoint({x:500,y:400},false);await settle();
  const countBounds=await anchorPoint('B');
  await dialog.getByRole('button',{name:'3×3',exact:true}).click();
  await dialog.getByRole('button',{name:'Pan',exact:true}).click();
  await svg.focus();await gm.keyboard.press('Enter');await settle();
  assert.equal((await values()).cell,70/3);assert.deepEqual(await anchorPoint('B'),countBounds);
  assert.match(await dialog.locator('.map-grid-status').innerText(),/Sample placed/);
  await dialog.getByRole('button',{name:'Pan',exact:true}).click();
  mark('Pending count reinterpretation preserves exact bounds and fractional spacing through Enter, including Pan mode');

  // A Shift-placed A alone does not opt the later default B confirmation out of snapping.
  await dialog.getByRole('button',{name:'Start over',exact:true}).click();
  await clickPoint({x:425.125,y:315.25},true);await settle();
  assert.ok(Object.values(await values()).every(n=>Number.isInteger(n*2)));
  const defaultSeed=await values();await gm.keyboard.press('Enter');await settle();
  assert.deepEqual(await values(),defaultSeed);

  const stable=await values();
  await dialog.getByRole('button',{name:'Start over',exact:true}).click();
  await svg.focus();await gm.keyboard.press('Enter');await settle();
  assert.match(await dialog.locator('.map-grid-status').innerText(),/Step 2/);
  assert.notDeepEqual(await values(),stable);
  const seededSide=Number(await svg.locator('.is-provisional > rect').getAttribute('width'));
  await gm.keyboard.press('ArrowRight');await gm.keyboard.press('Shift+ArrowDown');await settle();
  assert.notEqual((await values()).cell,stable.cell);
  const keyboardPreview=await values();
  await gm.keyboard.press('Enter');
  assert.match(await dialog.locator('.map-grid-status').innerText(),/Sample placed/);
  assert.equal((await values()).cell,(seededSide+1.5+10)/3);
  assert.deepEqual(await values(),keyboardPreview);
  const placedCell=(await values()).cell;
  const bounds=await anchorPoint('B');
  await dialog.getByRole('button',{name:'5×5',exact:true}).click();
  assert.deepEqual(await anchorPoint('B'),bounds);
  assert.ok(Math.abs((await values()).cell-placedCell*3/5)<0.001);
  await dialog.getByRole('button',{name:'3×3',exact:true}).click();
  mark('Keyboard-only Enter/arrows/Enter placement and sample count reinterpretation preserve bounds');

  await adv();await draw(a,b,false);
  const confirmedNumeric=await values();
  await dialog.getByRole('button',{name:'Select B',exact:true}).click();
  await hoverPoint({x:a.x+240,y:a.y+100});
  assert.equal((await values()).cell,80);
  assert.equal(await dialog.getByText('Temporary preview values. Click the map or press Enter to confirm placement.',{exact:true}).isVisible(),true);
  await cell.focus();assert.deepEqual(await values(),confirmedNumeric);
  assert.equal(await svg.locator('.is-provisional').count(),0);
  await cell.fill('');
  const hoverWhileTyping=async()=>{
    const p=await screen(b);
    await svg.evaluate((el,p)=>el.dispatchEvent(new globalThis.PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:p.x,clientY:p.y})),p);
    await settle();
  };
  await hoverWhileTyping();assert.equal(await cell.inputValue(),'');assert.equal(await apply.isDisabled(),true);
  await cell.pressSequentially('1e');await hoverWhileTyping();await gm.keyboard.press('Shift');
  assert.equal(await apply.isDisabled(),true);
  await cell.pressSequentially('2');assert.equal(await cell.inputValue(),'1e2');
  await cell.fill('80.25');await offx.fill('2.125');
  const offy=dialog.getByRole('spinbutton',{name:'Offset Y (px)',includeHidden:true});await offy.fill('3.375');
  await hoverWhileTyping();await gm.keyboard.press('Shift');
  assert.deepEqual(await values(),{cell:80.25,x:2.125,y:3.375});
  await svg.focus();await hoverPoint(b);
  assert.deepEqual(await values(),{cell:80.25,x:2.125,y:3.375});
  assert.equal(await svg.locator('[data-anchor]').count(),0);
  await draw(a,b,false);
  const beforeNudge=await values();
  await dialog.getByRole('button',{name:'Select B',exact:true}).click();await hoverPoint({x:a.x+240,y:a.y+100});
  const nudge=dialog.getByRole('button',{name:'Cell size (px): increase by 1 pixels',exact:true});
  await nudge.focus();assert.deepEqual(await values(),beforeNudge);
  await hoverWhileTyping();assert.deepEqual(await values(),beforeNudge);
  await nudge.click();await settle();assert.equal((await values()).cell,beforeNudge.cell+1);
  assert.equal(await svg.locator('[data-anchor]').count(),0);
  await draw(a,b,false);await closeAdvanced();
  mark('Numeric fields and nudges restore confirmed values and take precedence; empty/fractional typing survives pointer and modifier previews');

  const kept=await anchorPoint('A');
  await dialog.getByLabel('Distance per square').fill('10');
  await dialog.getByLabel('Distance unit').fill('m');
  await adv();
  await dialog.getByRole('slider',{name:/Thickness/}).focus();await gm.keyboard.press('ArrowRight');
  assert.deepEqual(await anchorPoint('A'),kept);
  await dialog.getByLabel('Distance per square').fill('5');await dialog.getByLabel('Distance unit').fill('ft');
  await closeAdvanced();
  mark('Unit and style edits preserve anchors');

  const centerA={x:1475.5,y:750.75},centerB={x:1685.875,y:850.25};
  await draw(centerA,centerB);
  await dialog.getByRole('button',{name:'Zoom in',exact:true}).click();
  await draw(centerA,centerB);v=await values();assert.ok(Math.abs(v.cell-70.125)<0.001,JSON.stringify(v));
  mark('Equivalent image coordinates produce the same fractional grid after zoom');
  await dialog.getByRole('button',{name:'Zoom in',exact:true}).click();
  const panValues=await values(),viewBefore=await svg.getAttribute('viewBox');
  await svg.scrollIntoViewIfNeeded();
  const center=await screen({x:1672,y:941});
  await gm.mouse.move(center.x,center.y);await gm.mouse.down();await gm.mouse.move(center.x+30,center.y+20);await gm.mouse.up();
  assert.notEqual(await svg.getAttribute('viewBox'),viewBefore);assert.deepEqual(await values(),panValues);
  for(const mode of ['Pan','Space','Middle']){
    if(mode==='Pan')await dialog.getByRole('button',{name:'Pan',exact:true}).click();
    if(mode==='Space'){await svg.focus();await gm.keyboard.down('Space');}
    const startView=await svg.getAttribute('viewBox');
    await svg.scrollIntoViewIfNeeded();const c=await screen({x:1672,y:941});
    await gm.mouse.move(c.x,c.y);await gm.mouse.down({button:mode==='Middle'?'middle':'left'});
    await gm.mouse.move(c.x-20,c.y-10);await gm.mouse.up({button:mode==='Middle'?'middle':'left'});
    assert.notEqual(await svg.getAttribute('viewBox'),startView);assert.deepEqual(await values(),panValues);
    if(mode==='Pan')await dialog.getByRole('button',{name:'Pan',exact:true}).click();
    if(mode==='Space')await gm.keyboard.up('Space');
  }
  await dialog.getByRole('button',{name:'Fit map',exact:true}).click();
  assert.deepEqual(await values(),panValues);
  mark('Swipes, Pan, Space-drag, middle-button navigation and Fit map preserve finalized geometry');

  for(const interruption of ['cancel','lost capture','leave','blur','wheel','resize']){
    await dialog.getByRole('button',{name:'Start over',exact:true}).click();
    const draft=await values();await clickPoint(a,false);const savedA=await anchorPoint('A');
    await svg.scrollIntoViewIfNeeded();let p=await screen(b);await gm.mouse.move(p.x,p.y);await gm.mouse.down();
    if(interruption==='cancel')await svg.evaluate(el=>el.dispatchEvent(new globalThis.PointerEvent('pointercancel',{bubbles:true,pointerId:1})));
    if(interruption==='lost capture')await svg.evaluate(el=>{if(!el.hasPointerCapture(1))throw new Error('No capture to lose');el.releasePointerCapture(1);});
    if(interruption==='leave'){const box=await svg.boundingBox();await gm.mouse.move(box.x+box.width+10,box.y+20);}
    if(interruption==='blur')await gm.evaluate(()=>globalThis.window.dispatchEvent(new Event('blur')));
    if(interruption==='wheel')await gm.mouse.wheel(0,-50);
    if(interruption==='resize'){
      await gm.setViewportSize({width:1320,height:768});
      await gm.evaluate(()=>new Promise(resolve=>globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(resolve))));
    }
    await gm.mouse.up();
    assert.match(await dialog.locator('.map-grid-status').innerText(),/Step 2/);
    assert.deepEqual(await anchorPoint('A'),savedA);assert.deepEqual(await values(),draft);
    await dialog.getByRole('button',{name:'Fit map',exact:true}).click();
    await clickPoint(b);assert.match(await dialog.locator('.map-grid-status').innerText(),/Sample placed/);
    await gm.setViewportSize({width:1366,height:768});
    mark(`Pending A survives ${interruption}; interrupted release cannot place B and next click retries`);
  }
  // A >6px excursion remains a swipe even when the pointer returns before release.
  await dialog.getByRole('button',{name:'Start over',exact:true}).click();
  await svg.scrollIntoViewIfNeeded();const p=await screen(a);
  await gm.mouse.move(p.x,p.y);await gm.mouse.down();await gm.mouse.move(p.x+8,p.y);await gm.mouse.move(p.x,p.y);await gm.mouse.up();
  assert.match(await dialog.locator('.map-grid-status').innerText(),/Step 1/);
  await gm.mouse.move(p.x,p.y);await gm.mouse.down();await gm.mouse.move(p.x+4,p.y);await gm.mouse.up();
  assert.match(await dialog.locator('.map-grid-status').innerText(),/Step 2/);
  await clickPoint(b);
  const retained=await values(), retainedView=await svg.getAttribute('viewBox');
  await dialog.getByRole('button',{name:'Start over',exact:true}).click();
  assert.deepEqual(await values(),retained);assert.equal(await svg.getAttribute('viewBox'),retainedView);
  assert.equal(await dialog.getByRole('button',{name:'3×3',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await svg.locator('[data-anchor]').count(),0);
  await draw(a,b);
  mark('Movement threshold is permanent for a gesture; Start over retains draft, count and camera');
  await adv();
  const savedCell=await cell.inputValue();const lastPath=await svg.locator('path').getAttribute('d');await cell.fill('');
  assert.equal(await apply.isDisabled(),true);assert.equal(await svg.locator('path').getAttribute('d'),lastPath);
  await cell.fill(savedCell);
  await draw(a,b,false);await resize.click();await gm.keyboard.press('ArrowRight');await gm.keyboard.press('Enter');await settle();
  const submitDraft=await values();
  await dialog.getByRole('button',{name:'Select B',exact:true}).click();await hoverPoint({x:a.x+255,y:a.y+120});
  assert.notDeepEqual(await values(),submitDraft);
  rejectGrid=true;await apply.click();await dialog.getByText('QA save rejected').waitFor();
  const submitted=gridCommands().at(-1).grid;
  assert.deepEqual({cell:submitted.cellSize,x:submitted.offsetX,y:submitted.offsetY},submitDraft);
  assert.deepEqual(await values(),submitDraft);
  assert.equal(await dialog.isVisible(),true);
  const submittedCell=await cell.inputValue();
  mark('Invalid typing keeps last valid grid; Apply submits only confirmed geometry during a live preview and rejection retains it');
  await apply.click();await dialog.waitFor({state:'hidden'});
  assert.equal(gridCount(),2);
  const after=await player.locator('.board-canvas').screenshot();assert.ok(!after.equals(before));
  mark('One successful Apply broadcasts the accepted grid');
  await open();await adv();assert.equal(await cell.inputValue(),submittedCell);
  const acceptedCount=gridCount();
  for(const method of ['Cancel','Escape','Close','Backdrop']){
    await cell.fill('80');
    if(method==='Escape')await gm.keyboard.press('Escape');
    else if(method==='Backdrop')await gm.mouse.click(2,2);
    else await dialog.getByRole('button',{name:method,exact:true}).click();
    await dialog.waitFor({state:'hidden'});assert.equal(gridCount(),acceptedCount);
    await open();await adv();assert.equal(await cell.inputValue(),submittedCell);
  }
  mark('Cancel, Escape, Close and backdrop discard drafts without commands');
  await cell.fill('85');holdGrid=true;const beforeHold=gridCount();await apply.click();
  await dialog.getByRole('button',{name:'Applying…',exact:true}).waitFor();
  await dialog.locator('form').evaluate(el=>{el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await gm.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true);assert.equal(gridCount(),beforeHold+1);
  held();await dialog.waitFor({state:'hidden'});await open();await adv();assert.equal(await cell.inputValue(),'85');
  mark('Repeated submissions send one command; controls lock until Apply finishes');
  // Replacing the map invalidates the draft; a late rejection cannot attach to the new scene.
  await cell.fill('90');holdGrid=true;await apply.click();
  await dialog.getByRole('button',{name:'Applying…',exact:true}).waitFor();
  await command({type:'scene.setMap',map:{url:'/img/hero-map.webp',width:3344,height:1882},grid:{cellSize:100,offsetX:0,offsetY:0,unitsPerCell:10,unitLabel:'m'}});
  await gm.waitForFunction(()=>globalThis.document.querySelector('.grid-scale input')?.value==='10');await adv();await cell.waitFor();assert.equal(await cell.inputValue(),'100');
  assert.equal(await dialog.getByLabel('Distance per square').inputValue(),'10');
  assert.equal(await dialog.getByLabel('Distance unit').inputValue(),'m');
  assert.equal(await svg.locator('[data-anchor]').count(),0);
  rejectHeld();await dialog.getByRole('button',{name:'Apply grid',exact:true}).waitFor();
  assert.equal(await cell.inputValue(),'100');assert.equal(await dialog.getByText('QA save rejected').count(),0);
  mark('Map and accepted-grid changes reset geometry and scale and ignore stale Apply errors');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  // Fresh successful room upload opens setup, and rejection does not.
  rejectMap=true;await gm.getByLabel('Upload battle map').setInputFiles(liveMap);
  await gm.getByText('QA save rejected').waitFor();assert.equal(await dialog.count(),0);
  await gm.getByLabel('Upload battle map').setInputFiles(reviewMap);
  await gm.getByRole('dialog',{name:'Set up grid',exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Set up later',exact:true}).click();
  assert.equal(await dialog.count(),0);mark('Room upload auto-opens only after successful placement; Set up later closes it');
  control.disconnect();
  // Library upload opens the same editor. Default-valued explicit grids can save.
  const playerBeforeLibrary=await player.locator('.board-canvas').screenshot();
  const library=await ctx.newPage();library.on('pageerror',e=>errors.push(e.message));await library.goto(BASE+'/library');
  await library.locator('input[type=file]').setInputFiles(liveMap);
  const ld=library.getByRole('dialog',{name:'Set up grid',exact:true});await ld.waitFor();
  assert.equal(await ld.getByRole('button',{name:'Save grid',exact:true}).isDisabled(),false);
  let patches=0;library.on('request',r=>{if(r.method()==='PATCH'&&r.url().includes('/api/library/'))patches++;});
  await ld.getByRole('button',{name:'Save grid',exact:true}).click();await ld.waitFor({state:'hidden'});assert.equal(patches,1);
  mark('Library upload auto-opens shared editor and saves an explicit default grid');
  await library.locator('input[type=file]').setInputFiles(reviewMap);await ld.waitFor();
  await ld.getByRole('button',{name:'Set up later',exact:true}).click();
  // Save failures preserve completed anchors and allow retry.
  await library.locator('.asset-card').filter({hasText:'kan 09 review map'}).getByRole('button',{name:'Edit grid',exact:true}).click();
  const edit=library.locator('dialog.grid-editor-modal[open]');
  const ls=edit.locator('.map-grid-canvas');
  const lclick=async(point)=>{await ls.scrollIntoViewIfNeeded();const p=await ls.evaluate((el,p)=>{const m=el.getScreenCTM();return{x:m.a*p.x+m.e,y:m.d*p.y+m.f};},point);await library.mouse.click(p.x,p.y);};
  const lhover=async(point)=>{await ls.scrollIntoViewIfNeeded();const p=await ls.evaluate((el,p)=>{const m=el.getScreenCTM();return{x:m.a*p.x+m.e,y:m.d*p.y+m.f};},point);await library.mouse.move(p.x,p.y);await library.evaluate(()=>new Promise(resolve=>globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(resolve))));};
  const libraryCell=edit.getByRole('spinbutton',{name:'Cell size (px)',includeHidden:true});
  const libraryX=edit.getByRole('spinbutton',{name:'Offset X (px)',includeHidden:true});
  const libraryY=edit.getByRole('spinbutton',{name:'Offset Y (px)',includeHidden:true});
  const lvalues=async()=>({cell:Number(await libraryCell.inputValue()),x:Number(await libraryX.inputValue()),y:Number(await libraryY.inputValue())});
  await edit.getByRole('button',{name:'Advanced',exact:true}).click();
  const libraryOriginal=await lvalues(), patchesBeforePreview=patches;
  await lclick({x:150,y:150});await lhover({x:260,y:220});
  assert.deepEqual(await lvalues(),{cell:110,x:40,y:40});assert.equal(patches,patchesBeforePreview);
  await library.evaluate(()=>globalThis.window.dispatchEvent(new Event('blur')));
  await library.evaluate(()=>new Promise(resolve=>globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(resolve))));
  assert.deepEqual(await lvalues(),libraryOriginal);
  await lclick({x:260,y:220});
  assert.ok(Math.abs(Number(await libraryCell.inputValue())-110)<0.001);
  await edit.getByRole('button',{name:'Select A',exact:true}).click();await lhover({x:170,y:160});
  assert.deepEqual(await lvalues(),{cell:110,x:60,y:50});assert.equal(patches,patchesBeforePreview);
  await libraryX.focus();assert.deepEqual(await lvalues(),{cell:110,x:40,y:40});
  await lhover({x:180,y:170});assert.deepEqual(await lvalues(),{cell:110,x:40,y:40});
  assert.equal(await ls.locator('.is-provisional').count(),0);
  mark('Library live placement/reposition fields remain local; blur and numeric focus restore saved draft values and typing focus suppresses hover');
  await edit.getByRole('button',{name:'Select A',exact:true}).click();await lclick({x:170,y:160});
  await edit.getByRole('button',{name:'Select B',exact:true}).click();await lclick({x:300,y:240});
  assert.ok(Math.abs(Number(await libraryCell.inputValue())-130)<0.001);
  const libraryB=edit.getByRole('button',{name:'Select B',exact:true});
  await libraryB.click();await library.keyboard.press('ArrowRight');
  assert.equal(Number(await libraryCell.inputValue()),130.5);
  await library.keyboard.press('Enter');
  assert.equal(await libraryB.getAttribute('aria-pressed'),'false');
  const lockedLibrary=await lvalues();await lhover({x:350,y:280});assert.deepEqual(await lvalues(),lockedLibrary);
  assert.equal(patches,patchesBeforePreview);
  mark('Library B keyboard adjustment snaps each cell; Enter deselects before moving toward Save grid and sends no PATCH');
  const libraryDraft=await libraryCell.inputValue();
  const confirmedLibrary=await lvalues();let requestedLibraryGrid;
  await edit.getByRole('button',{name:'Select B',exact:true}).click();await lhover({x:330,y:280});
  assert.notDeepEqual(await lvalues(),confirmedLibrary);
  await library.route('**/api/library/*',async route=>{
    if(route.request().method()==='PATCH'){
      requestedLibraryGrid=route.request().postDataJSON().grid;
      await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'QA library save failed'})});
    }else await route.continue();
  });
  await edit.getByRole('button',{name:'Save grid',exact:true}).click();await edit.getByText('QA library save failed').waitFor();
  assert.deepEqual({cell:requestedLibraryGrid.cellSize,x:requestedLibraryGrid.offsetX,y:requestedLibraryGrid.offsetY},confirmedLibrary);
  assert.deepEqual(await lvalues(),confirmedLibrary);
  assert.equal(await edit.isVisible(),true);assert.equal(await libraryCell.inputValue(),libraryDraft);assert.equal(await ls.locator('.grid-anchor-dot').count(),2);await library.unroute('**/api/library/*');
  let releaseLibrary;
  await library.route('**/api/library/*',async route=>{
    if(route.request().method()==='PATCH')await new Promise(resolve=>{releaseLibrary=resolve;});
    await route.continue();
  });
  const beforeLibrarySubmit=patches;
  await edit.getByRole('button',{name:'Save grid',exact:true}).click();
  await edit.getByRole('button',{name:'Saving…',exact:true}).waitFor();
  assert.equal(await edit.getByRole('button',{name:'Start over',exact:true}).isDisabled(),true);
  assert.equal(await edit.getByRole('button',{name:'Select A',exact:true}).isDisabled(),true);
  assert.equal(await edit.getByLabel('Distance per square').isDisabled(),true);
  await edit.locator('form').evaluate(el=>{
    el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  });
  await library.keyboard.press('Escape');assert.equal(await edit.isVisible(),true);
  assert.equal(patches,beforeLibrarySubmit+1);
  releaseLibrary();await edit.waitFor({state:'hidden'});await library.unroute('**/api/library/*');
  mark('Library saves confirmed geometry during a live preview; failure retains anchors/draft for retry and pending saves block duplicates/dismissal');
  const afterLibrary=await player.locator('.board-canvas').screenshot();
  assert.ok(playerBeforeLibrary.equals(afterLibrary),'Library editing changed the existing player room');
  const acceptedLibraryPatches=patches;
  for(const method of ['Cancel','Escape','Close','Backdrop']){
    await library.locator('.asset-card').filter({hasText:'kan 09 review map'}).getByRole('button',{name:'Edit grid',exact:true}).click();
    const editing=library.locator('dialog.grid-editor-modal[open]');
    await editing.getByRole('button',{name:'Advanced',exact:true}).click();
    const numeric=editing.getByRole('spinbutton',{name:'Cell size (px)',includeHidden:true});
    assert.equal(await numeric.inputValue(),libraryDraft);await numeric.fill('150');
    if(method==='Escape')await library.keyboard.press('Escape');
    else if(method==='Backdrop')await library.mouse.click(2,2);
    else await editing.getByRole('button',{name:method,exact:true}).click();
    await editing.waitFor({state:'hidden'});assert.equal(patches,acceptedLibraryPatches);
  }
  mark('All library dismissal paths preserve saved metadata; library edits leave existing player grid/token pixels unchanged');
  // An upload started before opening an existing map editor can replace its target
  // while a save is pending. Old responses must not lock, unlock or close the new editor.
  for(const rejectOld of [false,true]){
    let releaseUpload,releaseOld,releaseNew;
    const uploadReady=new Promise(resolve=>{releaseUpload=resolve;});
    const oldReady=new Promise(resolve=>{releaseOld=resolve;});
    const newReady=new Promise(resolve=>{releaseNew=resolve;});
    let notifyUpload,notifyOld,notifyNew;
    const uploadSeen=new Promise(resolve=>{notifyUpload=resolve;});
    const oldSeen=new Promise(resolve=>{notifyOld=resolve;});
    const newSeen=new Promise(resolve=>{notifyNew=resolve;});
    let oldRequest=true;
    await library.route('**/api/library**',async route=>{
      if(route.request().method()==='POST'){
        const response=await route.fetch();notifyUpload();await uploadReady;await route.fulfill({response});
      }else if(route.request().method()==='PATCH'){
        if(oldRequest){
          oldRequest=false;notifyOld();await oldReady;
          if(rejectOld){await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'QA obsolete save'})});return;}
        }else {notifyNew();await newReady;}
        await route.continue();
      }else await route.continue();
    });
    await library.locator('input[type=file]').setInputFiles({name:`late-${rejectOld}.png`,mimeType:'image/png',buffer:await readFile(liveMap)});
    await uploadSeen;
    await library.locator('.asset-card').filter({hasText:'kan 09 live map'}).getByRole('button',{name:'Edit grid',exact:true}).click();
    await edit.getByRole('button',{name:'Advanced',exact:true}).click();await libraryCell.fill(rejectOld?'81':'80');
    await edit.getByRole('button',{name:'Save grid',exact:true}).click();await oldSeen;
    releaseUpload();await ld.waitFor();await library.evaluate(()=>new Promise(resolve=>globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(resolve))));
    assert.equal(await edit.getByRole('button',{name:'Start over',exact:true}).isDisabled(),false);
    assert.equal(await libraryCell.inputValue(),'70');assert.equal(await ls.locator('.grid-anchor-dot').count(),0);
    if(!rejectOld){
      // Reopening the original asset is a new editor even though its ID matches.
      await edit.getByRole('button',{name:'Set up later',exact:true}).click();
      await library.locator('.asset-card').filter({hasText:'kan 09 live map'}).getByRole('button',{name:'Edit grid',exact:true}).click();
      await edit.getByRole('button',{name:'Advanced',exact:true}).click();await libraryCell.fill('82');
    }
    const currentDraft=await lvalues();
    await edit.getByRole('button',{name:'Save grid',exact:true}).click();await newSeen;
    const obsoleteResponse=library.waitForResponse(r=>r.request().method()==='PATCH');
    releaseOld();await obsoleteResponse;
    await library.evaluate(()=>new Promise(resolve=>globalThis.requestAnimationFrame(()=>globalThis.requestAnimationFrame(resolve))));
    assert.equal(await edit.getByRole('button',{name:'Saving…',exact:true}).isVisible(),true);
    assert.equal(await edit.getByRole('button',{name:'Start over',exact:true}).isDisabled(),true);
    assert.deepEqual(await lvalues(),currentDraft);
    assert.equal(await edit.getByText('QA obsolete save').count(),0);
    await library.keyboard.press('Escape');assert.equal(await edit.isVisible(),true);
    releaseNew();await edit.waitFor({state:'hidden'});await library.unroute('**/api/library**');
  }
  mark('Delayed upload resets library editor and its save lock; obsolete success/rejection cannot unlock or dismiss a newer save, including the same asset');
  // Place saved and unconfigured copies through the actual room picker.
  await library.locator('input[type=file]').setInputFiles({name:'unconfigured.png',mimeType:'image/png',buffer:await readFile(liveMap)});
  await ld.waitFor();await ld.getByRole('button',{name:'Set up later',exact:true}).click();
  await gm.getByRole('button',{name:'From library',exact:true}).click();
  await gm.getByRole('dialog',{name:'Choose a map'}).getByRole('button',{name:'kan 09 live map',exact:true}).click();
  await gm.getByRole('dialog',{name:'Choose a map'}).waitFor({state:'hidden'});assert.equal(await dialog.count(),0);
  await gm.getByRole('button',{name:'From library',exact:true}).click();
  await gm.getByRole('dialog',{name:'Choose a map'}).getByRole('button',{name:'unconfigured',exact:true}).click();
  await gm.getByRole('dialog',{name:'Set up grid',exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Set up later',exact:true}).click();
  mark('Saved library placement skips setup; unconfigured placement opens it');
  await library.close();
  // Touch taps, swipes and pinches at compact and desktop sizes.
  await open();
  for(const width of [320,390,1366]){
    await gm.setViewportSize({width,height:width===1366?768:700});
    const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);
    await dialog.getByRole('button',{name:'Fit map',exact:true}).click();
    await dialog.getByRole('button',{name:'Start over',exact:true}).click();
    await svg.scrollIntoViewIfNeeded();
    const a=await screen({x:100,y:100}),b=await screen({x:300,y:250});
    const cdp=await ctx.newCDPSession(gm);
    const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({...p,id:p.id??i+1}))});
    await touch('touchStart',[a]);await touch('touchEnd',[]);
    assert.match(await dialog.locator('.map-grid-status').innerText(),/Step 2/);
    const unchanged=await values();
    await touch('touchStart',[b]);await settle();assert.notDeepEqual(await values(),unchanged);await touch('touchEnd',[]);
    assert.equal(await svg.locator('.grid-anchor-dot').count(),2);
    const tapped=await values();
    await dialog.getByRole('button',{name:'Select B',exact:true}).click();
    await svg.scrollIntoViewIfNeeded();const reposition=await screen({x:400,y:300});
    await touch('touchStart',[reposition]);await touch('touchEnd',[]);
    assert.ok(Math.abs((await values()).cell-tapped.cell-100)<0.01);
    await dialog.getByRole('button',{name:'Zoom in',exact:true}).click();
    await dialog.getByRole('button',{name:'Start over',exact:true}).click();
    await svg.scrollIntoViewIfNeeded();
    const middle=await screen({x:500,y:400}), oldView=await svg.getAttribute('viewBox');
    await touch('touchStart',[middle]);await touch('touchMove',[{x:middle.x+25,y:middle.y+10}]);await touch('touchEnd',[]);
    assert.notEqual(await svg.getAttribute('viewBox'),oldView);
    assert.match(await dialog.locator('.map-grid-status').innerText(),/Step 1/);
    const rect=await svg.boundingBox(),mid={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
    const mapMid=await svg.evaluate((el,p)=>{const m=el.getScreenCTM().inverse();return{x:m.a*p.x+m.e,y:m.d*p.y+m.f};},mid);
    const left={x:mid.x-30,y:mid.y,id:1},right={x:mid.x+30,y:mid.y,id:2};
    await touch('touchStart',[left]);await touch('touchStart',[left,right]);
    // Zoom far enough that neither axis is forced to the image center by camera limits.
    const leftEnd={x:mid.x-56,y:mid.y+5,id:1},rightEnd={x:mid.x+76,y:mid.y+5,id:2};
    await touch('touchMove',[leftEnd,rightEnd]);
    const attached=await screen(mapMid);
    assert.ok(Math.abs(attached.x-(mid.x+10))<1 && Math.abs(attached.y-(mid.y+5))<1,JSON.stringify({attached,mid}));
    await touch('touchEnd',[leftEnd]);await touch('touchEnd',[]);
    assert.match(await dialog.locator('.map-grid-status').innerText(),/Step 1/);
    await dialog.getByRole('button',{name:'Fit map',exact:true}).click();
    await svg.scrollIntoViewIfNeeded();const finalA=await screen({x:200,y:200});
    await touch('touchStart',[finalA]);await touch('touchEnd',[]);
    assert.match(await dialog.locator('.map-grid-status').innerText(),/Step 2/);
    await cdp.detach();
    await dialog.getByRole('button',{name:'Start over',exact:true}).click();
    await dialog.getByRole('button',{name:'Select A',exact:true}).scrollIntoViewIfNeeded();
    await apply.scrollIntoViewIfNeeded();assert.equal(await apply.isVisible(),true);
    assert.equal(await dialog.getByRole('button',{name:'Cancel',exact:true}).isVisible(),true);
    await gm.screenshot({path:path.join(artifacts,`kan09-${width}.png`)});
    mark(`Touch taps, repositioning, swipes, midpoint-attached pinch and save controls work at ${width}px`);
  }
  assert.deepEqual(errors,[]);mark('No browser page errors');
  console.log('Artifacts: '+artifacts);
} catch(error) {await gm.screenshot({path:path.join(artifacts,'kan09-failure.png')});console.log((await gm.locator('body').innerText()).slice(-6000));throw error;} finally {await browser.close();}
