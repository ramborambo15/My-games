/* Rambo Arcade Game Boy Player — GPL-3.0-or-later. */
import { WasmBoy } from './wasmboy.js';

const $ = id => document.getElementById(id);
const memorySizes = { wasmBoyInternalState: 1024, wasmBoyPaletteMemory: 128, gameBoyMemory: 65536 };
function cartridgeRamSize(type) { return type>=1&&type<=3||type>=15&&type<=19?32768:type>=5&&type<=6?2048:type>=25&&type<=30?131072:0; }
const ui = { load: $('choose-game'), play: $('play'), sound: $('sound'), restart: $('restart'), save: $('quick-save'), restore: $('quick-load'), export: $('export-save'), import: $('import-save') };
let game = null, record = {}, busy = false, running = false, storage = null;
let soundOn = true, initialized = false, restartPending = false, closing = false;
const keysDown = new Set(), pointers = new Map();
const keyMap = { ArrowUp: 'UP', KeyW: 'UP', ArrowRight: 'RIGHT', KeyD: 'RIGHT', ArrowDown: 'DOWN', KeyS: 'DOWN', ArrowLeft: 'LEFT', KeyA: 'LEFT', KeyX: 'A', KeyZ: 'B', Enter: 'START', ShiftLeft: 'SELECT', ShiftRight: 'SELECT' };

function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function updatedAt(save) { return save ? new Date(save.date).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : null; }
function updateUI() {
  ui.load.disabled = busy;
  for (const name of ['play','restart','save','export','import']) ui[name].disabled = busy || !game;
  ui.save.disabled = busy || !game || !WasmBoy.isLoadedAndStarted();
  ui.restore.disabled = busy || !game || !record.quick;
  $('auto-info').textContent = record.auto ? `Saved ${updatedAt(record.auto)}` : game ? 'Saves every 20 seconds while playing' : 'Load a game to get started';
  $('quick-info').textContent = record.quick ? `Saved ${updatedAt(record.quick)}` : 'No quick save yet';
  $('play-status').textContent = busy ? 'WORKING' : !game ? 'READY' : running ? 'PLAYING' : 'PAUSED';
  ui.play.textContent = running ? 'Ⅱ Pause' : game ? '▶ Resume' : '▶ Play';
  $('power-light').classList.toggle('on', !!game);
  $('screen-overlay').hidden = !!game && running;
  if (game) { $('overlay-title').textContent = busy ? 'ONE MOMENT…' : 'PAUSED'; $('overlay-help').textContent = 'Tap Resume to keep playing'; }
  ui.restart.textContent = restartPending ? '↻ Confirm restart' : '↻ Restart';
}
function updateInput() {
  const pressed = new Set([...keysDown].map(key => keyMap[key]));
  for (const buttons of pointers.values()) buttons.forEach(button => pressed.add(button));
  document.querySelectorAll('[data-button],[data-pad]').forEach(button => button.classList.toggle('pressed', pressed.has(button.dataset.button || button.dataset.pad)));
  if (game && initialized) WasmBoy.setJoypadState(running && !busy ? Object.fromEntries([...pressed].map(button => [button, true])) : {});
}
function releaseInput() { keysDown.clear(); pointers.clear(); updateInput(); }
function openStorage() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open('rambo-pocket-saves',1);
    request.onupgradeneeded = () => request.result.createObjectStore('games');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other player tabs and try again.'));
  });
}
function dbAccess(mode, id, value) {
  if (!storage) return Promise.reject(new Error('Device storage is unavailable. Enable browser storage and reload the player.'));
  return new Promise((resolve,reject) => {
    const transaction = storage.transaction('games',mode);
    const request = mode === 'readonly' ? transaction.objectStore('games').get(id) : transaction.objectStore('games').put(value,id);
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('The save could not be stored.'));
  });
}
async function persist() { await dbAccess('readwrite',game.id,record); }
async function exclusive(action, { preserveInput = false } = {}) {
  if (busy) return;
  busy = true;
  if (preserveInput) updateInput(); else releaseInput();
  updateUI();
  try { await action(); }
  catch(error) { console.error(error); running = game ? WasmBoy.isPlaying() : false; message(error?.message || 'Something went wrong. Try loading the game again.',true); }
  finally { busy = false; updateInput(); updateUI(); }
}
async function capture(slot) {
  if (!game || !WasmBoy.isLoadedAndStarted()) return;
  const snapshot = await WasmBoy.saveState();
  // The emulator reuses memory objects and transfers buffers on restore. Keep our copies independent.
  const saved = copyState(snapshot);
  const nextRecord = { ...record, [slot]: saved };
  await dbAccess('readwrite',game.id,nextRecord);
  record = nextRecord;
  await WasmBoy.deleteState(snapshot);
}
async function keepPlaying(wasRunning) {
  if (wasRunning && !document.hidden) { await WasmBoy.play(); running = true; }
  else { await WasmBoy.pause(); running = false; }
}
function copyState(snapshot) {
  const saved=structuredClone(snapshot);
  for(const key of Object.keys(saved.wasmboyMemory))saved.wasmboyMemory[key]=new Uint8Array(saved.wasmboyMemory[key]);
  return saved;
}
function stashOnExit(snapshot) {
  if(!game||!WasmBoy.isLoadedAndStarted()||(!document.hidden&&!closing))return;
  try{
    const data={romHash:game.id,state:copyState(snapshot)};
    localStorage.setItem('rambo-pocket-latest',JSON.stringify(data,(_key,value)=>value instanceof Uint8Array?Array.from(value):value));
  }catch{ /* Periodic IndexedDB saves and exported backups remain available. */ }
}
async function saveProgress(slot = 'auto', resume = true) {
  const wasRunning = running;
  try { await capture(slot); }
  finally { await keepPlaying(resume && wasRunning); }
}
function validateROM(file,bytes) {
  if (!/\.(gb|gbc)$/i.test(file.name)) throw new Error('Choose a .gb or .gbc game file. Unzip compressed games first.');
  if (bytes.length < 32768 || bytes.length > 0x7e0400) throw new Error('This file is not a supported Game Boy cartridge (up to 4 MB).');
  let checksum = 0;
  for (let i=0x134;i<=0x14c;i++) checksum = (checksum-bytes[i]-1)&255;
  if (checksum !== bytes[0x14d]) throw new Error('The cartridge header is damaged or this isn’t a Game Boy game. Try another file.');
  const expectedSize = bytes[0x148] <= 7 ? 32768 * 2**bytes[0x148] : ({82:1179648,83:1310720,84:1572864})[bytes[0x148]];
  if (!expectedSize || bytes.length !== expectedSize) throw new Error('The game file has an unexpected size. Choose an uncompressed .gb or .gbc file.');
  if (![0,1,2,3,5,6,15,16,17,18,19,25,26,27,28,29,30].includes(bytes[0x147])) throw new Error('This game uses a special cartridge type that this player doesn’t support.');
}
async function loadGame(file) {
  if (!file) return;
  await exclusive(async () => {
    message('Checking cartridge…');
    if (file.size > 0x7e0400) throw new Error('This player supports cartridges up to 4 MB. Choose a smaller .gb or .gbc file.');
    const bytes = new Uint8Array(await file.arrayBuffer()); validateROM(file,bytes);
    const digest = await crypto.subtle.digest('SHA-256',bytes);
    const id = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2,'0')).join('');
    const nextRecord = await dbAccess('readonly',id) || {};
    if (game) await saveProgress('auto',false);
    await WasmBoy.config({ isGbcEnabled:true, isGbcColorizationEnabled:false, enableBootROMIfAvailable:false, disablePauseOnHidden:true, maxNumberOfAutoSaveStates:1, saveStateCallback:stashOnExit },$('screen'));
    game = null; running = false;
    message('Loading game…');
    await WasmBoy.loadROM(bytes); initialized = true;
    WasmBoy.disableDefaultJoypad();
    game = { id, name:file.name, ramSize:cartridgeRamSize(bytes[0x147]) }; record = nextRecord; restartPending = false;
    try{
      const pending=JSON.parse(localStorage.getItem('rambo-pocket-latest')||'null');
      if(pending?.romHash===id){
        const state=validateBackup({format:'rambo-pocket',version:1,emulator:'wasmboy-0.7.1',romHash:id,saves:{auto:pending.state}}).auto;
        if(!record.auto||state.date>record.auto.date){record.auto=state;await persist();}
        localStorage.removeItem('rambo-pocket-latest');
      }
    }catch{ /* Ignore an incomplete exit snapshot; durable saves are still valid. */ }
    $('game-title').textContent = file.name.replace(/\.(gb|gbc)$/i,'');
    $('console-mode').textContent = [0x80,0xc0].includes(bytes[0x143]) ? 'GAME BOY COLOR' : 'GAME BOY';
    const latest = [record.auto,record.quick].filter(Boolean).sort((a,b)=>b.date-a.date)[0];
    if (latest) { await WasmBoy.loadState(structuredClone(latest)); message('Saved progress found. Tap Resume to pick up where you left off.'); }
    else message('Game loaded. Tap Resume to play. Autosave will keep your progress.');
    setSound();
  });
}
function setSound() {
  const master = WasmBoy._getAudioChannels().master;
  if (soundOn) master.unmute(); else master.mute();
  ui.sound.textContent = soundOn ? '♫ Sound on' : '♫ Sound off';
  ui.sound.setAttribute('aria-pressed',String(soundOn));
}
function validateBackup(data) {
  if (data?.format !== 'rambo-pocket' || data.version !== 1 || data.emulator !== 'wasmboy-0.7.1' || data.romHash !== game.id) throw new Error('This save belongs to a different game or player version. Load the matching game first.');
  const result = {};
  for (const slot of ['auto','quick']) {
    const state = data.saves?.[slot]; if (!state) continue;
    if (!Number.isFinite(state.date) || !state.wasmboyMemory) throw new Error('This save file is incomplete.');
    const memory = {};
    for (const [key,size] of Object.entries({...memorySizes,cartridgeRam:game.ramSize})) {
      const bytes = state.wasmboyMemory[key];
      if (!Array.isArray(bytes) || bytes.length !== size || bytes.some(byte=>!Number.isInteger(byte)||byte<0||byte>255)) throw new Error('This save file has invalid game data.');
      memory[key] = new Uint8Array(bytes);
    }
    result[slot] = {date:state.date,isAuto:false,wasmboyMemory:memory};
  }
  if (!Object.keys(result).length) throw new Error('No saved progress was found in this file.');
  return result;
}
ui.load.addEventListener('click',()=>{$('rom-file').value='';$('rom-file').click();});
$('rom-file').addEventListener('change',event=>loadGame(event.target.files[0]));
ui.play.addEventListener('click',()=>exclusive(async()=>{
  if (!game) return;
  if (running) { await saveProgress('auto',false); message('Paused. Your latest progress is saved.'); }
  else { WasmBoy.resumeAudioContext(); await WasmBoy.play(); running=true; restartPending=false; message('Playing. Autosave runs every 20 seconds.'); }
}));
ui.sound.addEventListener('click',()=>{soundOn=!soundOn;setSound();if(soundOn)WasmBoy.resumeAudioContext();});
ui.save.addEventListener('click',()=>exclusive(async()=>{await saveProgress('quick');message('Quick save stored. Use Load quick save to return to this point.');}));
ui.restore.addEventListener('click',()=>exclusive(async()=>{
  const wasRunning=running;
  await WasmBoy.loadState(structuredClone(record.quick));
  restartPending=false; await keepPlaying(wasRunning); message('Quick save restored.');
}));
ui.restart.addEventListener('click',()=>exclusive(async()=>{
  if (!restartPending) {
    await saveProgress('auto',false); restartPending=true; ui.restart.textContent='↻ Confirm restart';
    message('Your progress is saved. Tap Confirm restart to start from the beginning, or Resume to carry on.'); return;
  }
  await WasmBoy.loadROM(new Uint8Array(await WasmBoy._getCartridgeInfo().then(info=>info.ROM)));
  WasmBoy.disableDefaultJoypad(); restartPending=false; running=false; ui.restart.textContent='↻ Restart';
  message('Game restarted. Resume to play from the beginning; your quick save is still available.');
}));
ui.export.addEventListener('click',()=>exclusive(async()=>{
  await saveProgress('auto');
  if (!record.auto && !record.quick) throw new Error('Play the game first so there’s progress to export.');
  const data={format:'rambo-pocket',version:1,emulator:'wasmboy-0.7.1',romHash:game.id,gameName:game.name,saves:record};
  const content=JSON.stringify(data,(_key,value)=>value instanceof Uint8Array?Array.from(value):value);
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=game.name.replace(/\.(gb|gbc)$/i,'')+'.rambo-save';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);message('Save exported. Keep the backup with your game file.');
}));
ui.import.addEventListener('click',()=>{$('save-file').value='';$('save-file').click();});
$('save-file').addEventListener('change',event=>exclusive(async()=>{
  const file=event.target.files[0];if(!file||!game)return;
  if(file.size>3000000)throw new Error('This save file is too large. Choose a Rambo Arcade save backup.');
  let data;try{data=JSON.parse(await file.text());}catch{throw new Error('This isn’t a valid Rambo Arcade save file.');}
  const imported=validateBackup(data);
  const latest=Object.values(imported).sort((a,b)=>b.date-a.date)[0];
  const wasRunning=running;
  await WasmBoy.loadState(structuredClone(latest));
  record=imported;await persist();restartPending=false;await keepPlaying(wasRunning);
  message('Save imported and restored. Your game is ready to continue.');
}));
$('fullscreen').addEventListener('click',async()=>{
  try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else if($('console').requestFullscreen)await $('console').requestFullscreen();
    else message('Fullscreen isn’t available in this browser. Rotate your phone for a wider view.');
  }catch{message('Fullscreen isn’t available here. You can keep playing in the page.');}
});
function padButtons(event) {
  const rect=$('dpad').getBoundingClientRect(), x=(event.clientX-rect.left)/rect.width, y=(event.clientY-rect.top)/rect.height;
  if(x<0||x>1||y<0||y>1)return [];
  return [x<.34?'LEFT':x>.66?'RIGHT':null,y<.34?'UP':y>.66?'DOWN':null].filter(Boolean);
}
$('dpad').addEventListener('pointerdown',event=>{
  if(event.button!==0)return;event.preventDefault();$('dpad').setPointerCapture(event.pointerId);pointers.set(event.pointerId,padButtons(event));updateInput();
});
$('dpad').addEventListener('pointermove',event=>{if(pointers.has(event.pointerId)){pointers.set(event.pointerId,padButtons(event));updateInput();}});
document.querySelectorAll('[data-button]').forEach(button=>{
  button.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();button.setPointerCapture(event.pointerId);pointers.set(event.pointerId,[button.dataset.button]);updateInput();});
  // Keyboard and assistive-technology clicks have no pointerdown event.
  button.addEventListener('click',event=>{if(event.detail===0){pointers.set('accessible',[button.dataset.button]);updateInput();setTimeout(()=>{pointers.delete('accessible');updateInput();},100);}});
});
document.querySelectorAll('[data-pad]').forEach(button=>button.addEventListener('click',event=>{if(event.detail===0){pointers.set('accessible-pad',[button.dataset.pad]);updateInput();setTimeout(()=>{pointers.delete('accessible-pad');updateInput();},100);}}));
for(const type of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,event=>{pointers.delete(event.pointerId);updateInput();});
window.addEventListener('keydown',event=>{
  if(event.target.closest('input,select,textarea')||event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.code==='KeyP'&&game&&!event.repeat){event.preventDefault();ui.play.click();return;}
  if(!keyMap[event.code]||!game)return;
  // Keep native keyboard activation available when a toolbar control is focused.
  if(event.code==='Enter'&&event.target.closest('button:not([data-button]):not([data-pad])'))return;
  event.preventDefault();keysDown.add(event.code);updateInput();
});
window.addEventListener('keyup',event=>{keysDown.delete(event.code);updateInput();});
window.addEventListener('blur',releaseInput);
window.addEventListener('pagehide',()=>{closing=true;releaseInput();});
window.addEventListener('pageshow',()=>{closing=false;});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){releaseInput();if(game&&running&&!busy)exclusive(async()=>{await saveProgress('auto',false);message('Paused and saved while you were away. Tap Resume to continue.');});}
});
setInterval(()=>{if(game&&running&&!busy&&!document.hidden)exclusive(async()=>{await saveProgress('auto');}, { preserveInput:true });},20000);
// Dropping a ROM is optional; the same picker works on computers and phones.
document.addEventListener('dragover',event=>{event.preventDefault();});
document.addEventListener('drop',event=>{event.preventDefault();if(!busy)loadGame(event.dataTransfer.files[0]);});
try { storage=await openStorage(); }
catch(error){message('Saving is unavailable in this browser. Enable browser storage and reload to use the player.',true);ui.load.disabled=true;console.error(error);}
if(storage)updateUI();
setSound();
