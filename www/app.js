const STORE_KEY='ncs.workspace.v1', SESSION_KEY='ncs.session.v1';
const LANG_MAP={lua:'lua',luau:'lua',js:'javascript',mjs:'javascript',ts:'typescript',py:'python',html:'html',htm:'html',css:'css',json:'json',md:'markdown',cpp:'cpp',cc:'cpp',c:'c',h:'c',java:'java',rs:'rust',go:'go',sh:'shell',bash:'shell',yml:'yaml',yaml:'yaml',xml:'xml',txt:'plaintext'};
const LANG_ICON={lua:'🌙',javascript:'🟨',typescript:'🔷',python:'🐍',html:'🌐',css:'🎨',json:'📦',markdown:'📝',cpp:'⚙️',c:'⚙️',java:'☕',rust:'🦀',go:'🐹',shell:'💻',yaml:'📋',xml:'📄',plaintext:'📃'};
let workspace=loadWS(), session=loadSession(), editor=null, dirty=new Map();
function loadWS(){try{const r=localStorage.getItem(STORE_KEY);if(r)return JSON.parse(r);}catch{}return {files:[{id:'w_'+Date.now(),name:'welcome.lua',content:'-- Welcome to Null Code Studio\n-- Tap the palette button for commands, the menu button for files.\n\nlocal function greet(name)\n  print("Hello, " .. name .. "!")\nend\n\ngreet("Null Code Studio")\n',lang:'lua'}]};}
function saveWS(){try{localStorage.setItem(STORE_KEY,JSON.stringify(workspace));}catch{}}
function loadSession(){try{const r=localStorage.getItem(SESSION_KEY);if(r)return JSON.parse(r);}catch{}return {openIds:[],activeId:null};}
function saveSession(){try{localStorage.setItem(SESSION_KEY,JSON.stringify(session));}catch{}}
const $=s=>document.querySelector(s);
const uid=()=>'f_'+Math.random().toString(36).slice(2,10);
const langFromName=n=>LANG_MAP[n.split('.').pop().toLowerCase()]||'plaintext';
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(m,ms=1800){const el=$('#toast');el.textContent=m;el.hidden=false;el.style.animation='none';void el.offsetWidth;el.style.animation='';clearTimeout(toast._t);toast._t=setTimeout(()=>{el.hidden=true;},ms);}

require.config({paths:{vs:'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs'}});
require(['vs/editor/editor.main'],()=>{
  monaco.editor.defineTheme('ncs-dark',{base:'vs-dark',inherit:true,rules:[],colors:{'editor.background':'#1e1e1e','editorGutter.background':'#1e1e1e','editorLineNumber.foreground':'#5a5a5a','editorLineNumber.activeForeground':'#c6c6c6','editor.selectionBackground':'#264f78','editor.lineHighlightBackground':'#2a2d2e','editorCursor.foreground':'#aeafad'}});
  editor=monaco.editor.create($('#editor'),{value:'',language:'lua',theme:'ncs-dark',automaticLayout:true,fontSize:14,lineHeight:20,fontFamily:"'JetBrains Mono','Fira Code',ui-monospace,Menlo,Consolas,monospace",minimap:{enabled:false},wordWrap:'on',lineNumbers:'on',scrollBeyondLastLine:false,smoothScrolling:true,cursorBlinking:'smooth',contextmenu:true,quickSuggestions:false,padding:{top:12,bottom:12},lineNumbersMinChars:3,glyphMargin:false,folding:true,tabSize:2,insertSpaces:true,mouseWheelZoom:true,scrollbar:{vertical:'auto',horizontal:'auto',verticalScrollbarSize:8,horizontalScrollbarSize:8,useShadows:false}});
  editor.onDidChangeModelContent(()=>{if(!session.activeId)return;const f=workspace.files.find(x=>x.id===session.activeId);if(!f)return;const v=editor.getValue();if(f.content!==v){f.content=v;if(!dirty.has(f.id)){dirty.set(f.id,true);renderTabs();updateTitle();}saveWS();}});
  editor.onDidChangeCursorPosition(e=>{$('#sbPos').textContent='Ln '+e.position.lineNumber+', Col '+e.position.column;});
  const ed=$('#editor');let lastY=0,lastTop=0;
  ed.addEventListener('touchstart',e=>{if(e.touches.length===2){lastY=(e.touches[0].clientY+e.touches[1].clientY)/2;lastTop=editor.getScrollTop();}},{passive:true});
  ed.addEventListener('touchmove',e=>{if(e.touches.length===2){const y=(e.touches[0].clientY+e.touches[1].clientY)/2;editor.setScrollTop(lastTop+(lastY-y)*2.2);e.preventDefault();}},{passive:false});
  boot();
});

function boot(){
  if(session.openIds.length===0&&workspace.files.length>0){session.openIds=[workspace.files[0].id];session.activeId=workspace.files[0].id;}
  session.openIds=session.openIds.filter(id=>workspace.files.some(f=>f.id===id));
  if(!workspace.files.some(f=>f.id===session.activeId))session.activeId=session.openIds[0]||null;
  renderTabs();renderTree();
  if(session.activeId)activate(session.activeId);else showWelcome(true);
  wireUI();updateTitle();saveSession();
}

function activate(id){
  const f=workspace.files.find(x=>x.id===id);if(!f)return;
  session.activeId=id;if(!session.openIds.includes(id))session.openIds.push(id);
  showWelcome(false);
  const m=monaco.editor.createModel(f.content,f.lang||langFromName(f.name));
  const old=editor.getModel();editor.setModel(m);if(old)old.dispose();
  editor.focus();renderTabs();renderTree();
  $('#sbLang').textContent=prettyLang(f.lang||langFromName(f.name));
  updateTitle();saveSession();
}
function closeTab(id){
  session.openIds=session.openIds.filter(x=>x!==id);
  if(session.activeId===id){session.activeId=session.openIds[session.openIds.length-1]||null;if(session.activeId)activate(session.activeId);else{editor.setModel(null);showWelcome(true);}}
  renderTabs();saveSession();
}
function newFile(){const n=prompt('File name','script.lua');if(!n)return;const f={id:uid(),name:n,content:'',lang:langFromName(n)};workspace.files.push(f);saveWS();activate(f.id);closeSidebar();toast('Created '+n);}
function deleteFile(id){if(!confirm('Delete this file?'))return;workspace.files=workspace.files.filter(f=>f.id!==id);dirty.delete(id);saveWS();closeTab(id);renderTree();toast('Deleted');}
function saveCurrent(){if(!session.activeId)return;saveWS();dirty.delete(session.activeId);renderTabs();updateTitle();toast('Saved');}

function renderTabs(){
  const el=$('#tabs');el.innerHTML='';
  for(const id of session.openIds){
    const f=workspace.files.find(x=>x.id===id);if(!f)continue;
    const t=document.createElement('div');
    t.className='tab'+(id===session.activeId?' active':'');
    t.innerHTML='<span class="t-name">'+esc(f.name)+'</span>'+(dirty.get(id)?'<span class="t-dot">●</span>':'')+'<button class="t-close">✕</button>';
    t.addEventListener('click',e=>{if(e.target.classList.contains('t-close'))closeTab(id);else activate(id);});
    el.appendChild(t);
  }
}
function renderTree(){
  const el=$('#fileTree');el.innerHTML='';
  if(workspace.files.length===0){el.innerHTML='<div class="file-empty">No files.<br>Tap + to create one.</div>';return;}
  for(const f of workspace.files){
    const lang=f.lang||langFromName(f.name);
    const icon=LANG_ICON[lang]||'📄';
    const item=document.createElement('div');
    item.className='file-item'+(f.id===session.activeId?' active':'');
    item.innerHTML='<span class="f-icon">'+icon+'</span><span class="f-name">'+esc(f.name)+'</span><button class="f-del">✕</button>';
    item.addEventListener('click',e=>{if(e.target.classList.contains('f-del')){deleteFile(f.id);return;}activate(f.id);closeSidebar();});
    el.appendChild(item);
  }
}
function updateTitle(){
  const f=workspace.files.find(x=>x.id===session.activeId);
  const name=f?f.name:'No file';
  $('#tbFile').textContent=name;
  $('#tbDirty').hidden=!dirty.get(session.activeId);
  document.title=(dirty.get(session.activeId)?'● ':'')+name+' — Null Code Studio';
}
function showWelcome(v){$('#welcome').classList.toggle('hidden',!v);}
function prettyLang(l){const m={javascript:'JavaScript',typescript:'TypeScript',lua:'Lua',python:'Python',html:'HTML',css:'CSS',json:'JSON',markdown:'Markdown',cpp:'C++',c:'C',java:'Java',rust:'Rust',go:'Go',shell:'Shell',yaml:'YAML',xml:'XML',plaintext:'Plain Text'};return m[l]||l;}

function openSidebar(){$('#sidebar').classList.add('open');$('#scrim').hidden=false;}
function closeSidebar(){$('#sidebar').classList.remove('open');$('#scrim').hidden=true;}

const COMMANDS=[
  {id:'new',label:'New File',key:'',run:newFile},
  {id:'save',label:'Save File',key:'',run:saveCurrent},
  {id:'files',label:'Show Explorer',key:'',run:openSidebar},
  {id:'import',label:'Import from Device',key:'',run:()=>$('#fileInput').click()},
  {id:'export',label:'Export to Documents',key:'',run:exportToDocuments},
  {id:'format',label:'Format Document',key:'',run:()=>editor.getAction('editor.action.formatDocument').run()},
  {id:'find',label:'Find',key:'',run:()=>editor.getAction('actions.find').run()},
  {id:'replace',label:'Find & Replace',key:'',run:()=>editor.getAction('editor.action.startFindReplaceAction').run()},
  {id:'gotoline',label:'Go to Line',key:'',run:()=>editor.getAction('editor.action.gotoLine').run()},
  {id:'comment',label:'Toggle Line Comment',key:'',run:()=>editor.getAction('editor.action.commentLine').run()},
  {id:'fontup',label:'Increase Font Size',key:'',run:()=>setFont(editor.getOption(monaco.editor.EditorOption.fontSize)+1)},
  {id:'fontdown',label:'Decrease Font Size',key:'',run:()=>setFont(Math.max(10,editor.getOption(monaco.editor.EditorOption.fontSize)-1))},
  {id:'wordwrap',label:'Toggle Word Wrap',key:'',run:toggleWordWrap},
  {id:'about',label:'About Null Code Studio',key:'',run:()=>alert('Null Code Studio\nA mobile-first code editor.\n\nBuilt with Monaco (the engine behind VS Code).')}
];
function setFont(n){editor.updateOptions({fontSize:n,lineHeight:Math.round(n*1.5)});toast('Font size: '+n);}
function toggleWordWrap(){const c=editor.getOption(monaco.editor.EditorOption.wordWrap);const nx=c==='on'?'off':'on';editor.updateOptions({wordWrap:nx});toast('Word wrap: '+nx);}
function openPalette(){const p=$('#palette');p.hidden=false;const i=$('#paletteInput');i.value='';renderPalette('');setTimeout(()=>i.focus(),50);}
function closePalette(){$('#palette').hidden=true;}
function renderPalette(q){
  const l=$('#paletteList');l.innerHTML='';
  const f=COMMANDS.filter(c=>c.label.toLowerCase().includes(q.toLowerCase()));
  if(f.length===0){l.innerHTML='<div class="palette-item" style="color:#6a6a6a">No commands match</div>';return;}
  f.forEach((c,i)=>{
    const el=document.createElement('div');
    el.className='palette-item'+(i===0?' selected':'');
    el.innerHTML='<span>'+esc(c.label)+'</span>'+(c.key?'<span class="p-key">'+c.key+'</span>':'');
    el.addEventListener('click',()=>{closePalette();setTimeout(()=>c.run(),30);});
    l.appendChild(el);
  });
}

function importFromDevice(file){
  const r=new FileReader();
  r.onload=()=>{const id=uid();workspace.files.push({id:id,name:file.name,content:r.result,lang:langFromName(file.name)});saveWS();activate(id);toast('Imported '+file.name);};
  r.readAsText(file);
}
async function exportToDocuments(){
  if(!session.activeId){toast('No file open');return;}
  const f=workspace.files.find(x=>x.id===session.activeId);if(!f)return;
  try{
    const Filesystem=Capacitor.Plugins.Filesystem,Directory=Capacitor.Plugins.Directory,Encoding=Capacitor.Plugins.Encoding;
    await Filesystem.writeFile({path:f.name,data:f.content,directory:Directory.Documents,encoding:Encoding.UTF8,recursive:true});
    toast('Exported to Documents/'+f.name);
  }catch(e){
    const b=new Blob([f.content],{type:'text/plain'});
    const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=f.name;a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    toast('Downloaded '+f.name);
  }
}

function wireUI(){
  $('#openSidebar').addEventListener('click',openSidebar);
  $('#closeSidebar').addEventListener('click',closeSidebar);
  $('#scrim').addEventListener('click',closeSidebar);
  $('#newFileBtn').addEventListener('click',newFile);
  $('#importBtn').addEventListener('click',()=>$('#fileInput').click());
  $('#exportBtn').addEventListener('click',exportToDocuments);
  $('#saveFile').addEventListener('click',saveCurrent);
  $('#openPalette').addEventListener('click',openPalette);
  $('#fileInput').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];if(f)importFromDevice(f);e.target.value='';});
  $('#paletteInput').addEventListener('input',e=>renderPalette(e.target.value));
  $('#paletteInput').addEventListener('keydown',e=>{if(e.key==='Enter'){const f=$('#paletteList .palette-item.selected')||$('#paletteList .palette-item');if(f)f.click();}if(e.key==='Escape')closePalette();});
  $('#palette').addEventListener('click',e=>{if(e.target.id==='palette')closePalette();});
  document.querySelectorAll('.w-btn').forEach(b=>{b.addEventListener('click',()=>{const a=b.dataset.action;if(a==='new')newFile();if(a==='open')$('#fileInput').click();if(a==='files')openSidebar();});});
  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'){if(!$('#palette').hidden)closePalette();else if($('#sidebar').classList.contains('open'))closeSidebar();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveCurrent();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette();}
  });
}
