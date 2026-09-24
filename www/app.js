/* ==========================================================
   Null Code Studio
   ========================================================== */

const STORE_KEY='ncs.workspace.v1';
const SESSION_KEY='ncs.session.v1';
const PREFS_KEY='ncs.prefs.v1';
const RECENT_KEY='ncs.recent.v1';

const LANG_MAP={lua:'lua',luau:'lua',js:'javascript',mjs:'javascript',ts:'typescript',py:'python',html:'html',htm:'html',css:'css',json:'json',md:'markdown',cpp:'cpp',cc:'cpp',c:'c',h:'c',java:'java',rs:'rust',go:'go',sh:'shell',bash:'shell',yml:'yaml',yaml:'yaml',xml:'xml',txt:'plaintext'};
const LANG_ICON={lua:'L',javascript:'JS',typescript:'TS',python:'Py',html:'<',css:'#',json:'{}',markdown:'M',cpp:'C+',c:'C',java:'Jv',rust:'Rs',go:'Go',shell:'$',yaml:'Y',xml:'X',plaintext:'·'};
const LANG_COLOR={lua:'#4b8f8f',javascript:'#f1e05a',typescript:'#3178c6',python:'#3572A5',html:'#e34c26',css:'#563d7c',json:'#cbcb41',markdown:'#083fa1',cpp:'#f34b7d',c:'#555',java:'#b07219',rust:'#dea584',go:'#00ADD8',shell:'#89e051',yaml:'#cb171e',xml:'#0060ac',plaintext:'#888'};

const DEFAULT_PREFS={fontSize:14,tabSize:2,insertSpaces:true,wordWrap:true,minimap:false,lineNumbers:true,smoothCursor:true,highlightLine:true};

let workspace=loadJSON(STORE_KEY,()=>({files:[seedFile()]}));
let session=loadJSON(SESSION_KEY,()=>({openIds:[],activeId:null}));
let prefs={...DEFAULT_PREFS,...loadJSON(PREFS_KEY,()=>({}))};
let recent=loadJSON(RECENT_KEY,()=>[]);
let editor=null;
let dirty=new Map();
let activeView='explorer';
let searchTimer=null;

function loadJSON(key,fallback){try{const r=localStorage.getItem(key);if(r)return JSON.parse(r);}catch{}return fallback();}
function saveJSON(key,val){try{localStorage.setItem(key,JSON.stringify(val));}catch{}}
function seedFile(){return{id:'w_'+Date.now(),name:'welcome.lua',content:'-- Welcome to Null Code Studio\n-- Tap the palette icon or use the command palette to explore.\n\nlocal function greet(name)\n  print("Hello, " .. name .. "!")\nend\n\ngreet("Null Code Studio")\n',lang:'lua'};}
function saveWorkspace(){saveJSON(STORE_KEY,workspace);}
function saveSession(){saveJSON(SESSION_KEY,session);}
function savePrefs(){saveJSON(PREFS_KEY,prefs);}
function saveRecent(){saveJSON(RECENT_KEY,recent);}
function pushRecent(id){recent=recent.filter(x=>x!==id);recent.unshift(id);recent=recent.slice(0,8);saveRecent();}

const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const uid=()=>'f_'+Math.random().toString(36).slice(2,10);
const langFromName=n=>LANG_MAP[(n.split('.').pop()||'').toLowerCase()]||'plaintext';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function toast(m,ms=1800){
  const el=$('#toast');el.textContent=m;el.hidden=false;
  el.style.animation='none';void el.offsetWidth;el.style.animation='';
  clearTimeout(toast._t);toast._t=setTimeout(()=>{el.hidden=true;},ms);
}

/* ============ Monaco ============ */
require.config({paths:{vs:'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs'}});
require(['vs/editor/editor.main'],()=>{
  monaco.editor.defineTheme('ncs-dark',{base:'vs-dark',inherit:true,rules:[],
    colors:{
      'editor.background':'#1e1e1e',
      'editorGutter.background':'#1e1e1e',
      'editorLineNumber.foreground':'#858585',
      'editorLineNumber.activeForeground':'#c6c6c6',
      'editor.selectionBackground':'#264f78',
      'editor.lineHighlightBackground':'#2a2d2e',
      'editorCursor.foreground':'#aeafad',
      'editorIndentGuide.background1':'#404040',
      'editorIndentGuide.activeBackground1':'#707070',
      'editorWidget.background':'#252526',
      'editorWidget.border':'#454545',
      'editorSuggestWidget.background':'#252526',
      'editorHoverWidget.background':'#252526'
    }});

  editor=monaco.editor.create($('#editor'),{
    value:'',language:'lua',theme:'ncs-dark',
    automaticLayout:true,
    fontSize:prefs.fontSize,
    lineHeight:Math.round(prefs.fontSize*1.45),
    fontFamily:"'JetBrains Mono','Fira Code',ui-monospace,Menlo,Consolas,monospace",
    fontLigatures:true,
    minimap:{enabled:prefs.minimap},
    wordWrap:prefs.wordWrap?'on':'off',
    lineNumbers:prefs.lineNumbers?'on':'off',
    scrollBeyondLastLine:false,
    smoothScrolling:true,
    cursorBlinking:prefs.smoothCursor?'smooth':'blink',
    cursorSmoothCaretAnimation:'on',
    renderLineHighlight:prefs.highlightLine?'all':'none',
    contextmenu:true,
    quickSuggestions:false,
    suggestOnTriggerCharacters:false,
    padding:{top:10,bottom:10},
    lineNumbersMinChars:3,
    glyphMargin:false,
    folding:true,
    renderWhitespace:'selection',
    tabSize:prefs.tabSize,
    insertSpaces:prefs.insertSpaces,
    mouseWheelZoom:true,
    scrollbar:{vertical:'auto',horizontal:'auto',verticalScrollbarSize:10,horizontalScrollbarSize:10,useShadows:false}
  });

  editor.onDidChangeModelContent(()=>{
    if(!session.activeId)return;
    const f=workspace.files.find(x=>x.id===session.activeId);if(!f)return;
    const v=editor.getValue();
    if(f.content!==v){
      f.content=v;
      if(!dirty.has(f.id)){dirty.set(f.id,true);renderTabs();updateTitle();}
      saveWorkspace();
      updateStatusSize();
    }
  });
  editor.onDidChangeCursorPosition(e=>{
    $('#sbPos').textContent='Ln '+e.position.lineNumber+', Col '+e.position.column;
  });

  const ed=$('#editor');let lastY=0,lastTop=0;
  ed.addEventListener('touchstart',e=>{if(e.touches.length===2){lastY=(e.touches[0].clientY+e.touches[1].clientY)/2;lastTop=editor.getScrollTop();}},{passive:true});
  ed.addEventListener('touchmove',e=>{if(e.touches.length===2){const y=(e.touches[0].clientY+e.touches[1].clientY)/2;editor.setScrollTop(lastTop+(lastY-y)*2.2);e.preventDefault();}},{passive:false});

  boot();
});

/* ============ Boot ============ */
function boot(){
  if(session.openIds.length===0&&workspace.files.length>0){session.openIds=[workspace.files[0].id];session.activeId=workspace.files[0].id;}
  session.openIds=session.openIds.filter(id=>workspace.files.some(f=>f.id===id));
  if(!workspace.files.some(f=>f.id===session.activeId))session.activeId=session.openIds[0]||null;
  applyPrefsToUI();
  renderTabs();renderTree();renderRecent();
  if(session.activeId)activate(session.activeId);else showWelcome(true);
  wireUI();updateTitle();saveSession();
}

/* ============ Tabs ============ */
function renderTabs(){
  const el=$('#tabs');el.innerHTML='';
  for(const id of session.openIds){
    const f=workspace.files.find(x=>x.id===id);if(!f)continue;
    const lang=f.lang||langFromName(f.name);
    const icon=LANG_ICON[lang]||'·';
    const color=LANG_COLOR[lang]||'#888';
    const t=document.createElement('div');
    t.className='tab'+(id===session.activeId?' active':'');
    t.innerHTML=`<span class="t-icon" style="color:${color}">${esc(icon)}</span><span class="t-name">${esc(f.name)}</span><span class="t-dirty${dirty.get(id)?'':' hidden'}"></span><button class="t-close">×</button>`;
    t.addEventListener('click',e=>{if(e.target.classList.contains('t-close'))closeTab(id);else activate(id);});
    el.appendChild(t);
  }
}

/* ============ File tree ============ */
function renderTree(){
  const el=$('#fileTree');el.innerHTML='';
  if(workspace.files.length===0){el.innerHTML='<div class="file-empty">No files in workspace.<br>Tap the + icon to create one.</div>';return;}
  for(const f of workspace.files){
    const lang=f.lang||langFromName(f.name);
    const icon=LANG_ICON[lang]||'·';
    const color=LANG_COLOR[lang]||'#888';
    const item=document.createElement('div');
    item.className='file-item'+(f.id===session.activeId?' active':'');
    item.innerHTML=`<span class="f-icon" style="color:${color}">${esc(icon)}</span><span class="f-name">${esc(f.name)}</span><button class="f-del" title="Delete">×</button>`;
    item.addEventListener('click',e=>{if(e.target.classList.contains('f-del')){deleteFile(f.id);return;}activate(f.id);if(innerWidth<760)closeSidebar();});
    el.appendChild(item);
  }
}

/* ============ Recent ============ */
function renderRecent(){
  const el=$('#recentList');el.innerHTML='';
  const valid=recent.filter(id=>workspace.files.some(f=>f.id===id)).slice(0,6);
  if(valid.length===0){el.innerHTML='<div class="recent-empty">No recent files</div>';return;}
  for(const id of valid){
    const f=workspace.files.find(x=>x.id===id);
    const item=document.createElement('div');
    item.className='recent-item';item.textContent=f.name;
    item.addEventListener('click',()=>activate(id));
    el.appendChild(item);
  }
}

/* ============ Activate / close ============ */
function activate(id){
  const f=workspace.files.find(x=>x.id===id);if(!f)return;
  session.activeId=id;if(!session.openIds.includes(id))session.openIds.push(id);
  showWelcome(false);
  const m=monaco.editor.createModel(f.content,f.lang||langFromName(f.name));
  const old=editor.getModel();editor.setModel(m);if(old)old.dispose();
  editor.updateOptions({tabSize:prefs.tabSize,insertSpaces:prefs.insertSpaces});
  editor.focus();
  renderTabs();renderTree();renderBreadcrumbs(f);
  const lang=f.lang||langFromName(f.name);
  $('#sbLang').textContent=prettyLang(lang);
  $('#sbIndent').textContent=(prefs.insertSpaces?'Spaces: ':'Tab Size: ')+prefs.tabSize;
  updateTitle();updateStatusSize();pushRecent(id);renderRecent();saveSession();
}
function closeTab(id){
  session.openIds=session.openIds.filter(x=>x!==id);
  if(session.activeId===id){
    session.activeId=session.openIds[session.openIds.length-1]||null;
    if(session.activeId)activate(session.activeId);else{editor.setModel(null);showWelcome(true);renderBreadcrumbs(null);}
  }
  renderTabs();saveSession();
}
function renderBreadcrumbs(f){
  const el=$('#breadcrumbs');
  if(!f){el.innerHTML='';return;}
  const parts=f.name.split(/[\\/]/);
  el.innerHTML=parts.map((p,i)=>`<span class="bc-item${i===parts.length-1?' active':''}">${esc(p)}</span>`).join('<span class="bc-sep">›</span>');
}
function showWelcome(v){
  $('#welcome').classList.toggle('hidden',!v);
  if(v)renderRecent();
}
function updateTitle(){
  const f=workspace.files.find(x=>x.id===session.activeId);
  const name=f?f.name:'Null Code Studio';
  $('#titleCenter').textContent=(dirty.get(session.activeId)?'● ':'')+name+' — Null Code Studio';
}
function updateStatusSize(){
  const f=workspace.files.find(x=>x.id===session.activeId);
  if(!f){$('#sbSize').textContent='0 B';return;}
  const b=new Blob([f.content]).size;
  $('#sbSize').textContent=b<1024?b+' B':(b/1024).toFixed(1)+' KB';
}

/* ============ File ops ============ */
function newFile(){
  const n=prompt('File name','script.lua');if(!n)return;
  const f={id:uid(),name:n,content:'',lang:langFromName(n)};
  workspace.files.push(f);saveWorkspace();activate(f.id);
  if(innerWidth<760)closeSidebar();toast('Created '+n);
}
function deleteFile(id){
  if(!confirm('Delete this file?'))return;
  workspace.files=workspace.files.filter(f=>f.id!==id);
  dirty.delete(id);recent=recent.filter(x=>x!==id);saveRecent();
  saveWorkspace();closeTab(id);renderTree();renderRecent();toast('Deleted');
}
function saveCurrent(){
  if(!session.activeId){toast('No file open');return;}
  saveWorkspace();dirty.delete(session.activeId);
  renderTabs();updateTitle();toast('Saved');
}
function importFromDevice(file){
  const r=new FileReader();
  r.onload=()=>{
    const id=uid();
    workspace.files.push({id,name:file.name,content:r.result,lang:langFromName(file.name)});
    saveWorkspace();activate(id);toast('Imported '+file.name);
  };
  r.readAsText(file);
}
async function exportToDocuments(){
  if(!session.activeId){toast('No file open');return;}
  const f=workspace.files.find(x=>x.id===session.activeId);if(!f)return;
  try{
    const FS=Capacitor.Plugins.Filesystem,Dir=Capacitor.Plugins.Directory,Enc=Capacitor.Plugins.Encoding;
    await FS.writeFile({path:f.name,data:f.content,directory:Dir.Documents,encoding:Enc.UTF8,recursive:true});
    toast('Exported to Documents/'+f.name);
  }catch(e){
    const b=new Blob([f.content],{type:'text/plain'});
    const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=f.name;a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    toast('Downloaded '+f.name);
  }
}

/* ============ Sidebar ============ */
function openSidebar(){const sb=$('#sidebar');sb.classList.add('open');sb.setAttribute('aria-hidden','false');$('#scrim').hidden=false;}
function closeSidebar(){const sb=$('#sidebar');sb.classList.remove('open');sb.setAttribute('aria-hidden','true');$('#scrim').hidden=true;}
function toggleSidebar(){const sb=$('#sidebar');sb.classList.contains('open')?closeSidebar():openSidebar();}
function switchView(view){
  activeView=view;
  $$('.activity-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $$('.panel-view').forEach(p=>{p.hidden=p.dataset.view!==view;});
  if(view==='search')setTimeout(()=>$('#searchInput').focus(),50);
}

/* ============ Search ============ */
function runSearch(){
  const q=$('#searchInput').value;
  const caseSensitive=$('#searchCase').checked;
  const useRegex=$('#searchRegex').checked;
  const out=$('#searchResults');
  if(!q.trim()){out.innerHTML='<div class="empty-note">Type to search across your workspace.</div>';return;}
  let re;
  try{re=new RegExp(useRegex?q:escRe(q),caseSensitive?'g':'gi');}
  catch(e){out.innerHTML='<div class="empty-note">Invalid regex.</div>';return;}
  out.innerHTML='';
  let totalHits=0;
  for(const f of workspace.files){
    const lines=f.content.split('\n');
    const hits=[];
    lines.forEach((line,idx)=>{
      re.lastIndex=0;
      if(re.test(line)){
        const highlighted=esc(line).replace(new RegExp(useRegex?q:escRe(q),caseSensitive?'g':'gi'),m=>`<mark>${esc(m)}</mark>`);
        hits.push({line:idx+1,text:highlighted});
      }
    });
    if(hits.length===0)continue;
    totalHits+=hits.length;
    const hdr=document.createElement('div');
    hdr.className='search-file-header';
    hdr.innerHTML=`<span>${esc(f.name)}</span><span class="count">${hits.length}</span>`;
    out.appendChild(hdr);
    for(const h of hits.slice(0,25)){
      const el=document.createElement('div');
      el.className='search-hit';
      el.innerHTML=`<span class="line-num">${h.line}</span>${h.text}`;
      el.addEventListener('click',()=>{
        activate(f.id);
        setTimeout(()=>{
          editor.revealLineInCenter(h.line);
          editor.setPosition({lineNumber:h.line,column:1});
          editor.focus();
        },80);
        if(innerWidth<760)closeSidebar();
      });
      out.appendChild(el);
    }
  }
  if(totalHits===0)out.innerHTML='<div class="empty-note">No results found.</div>';
}

/* ============ Prefs ============ */
function applyPrefsToUI(){
  if(!editor)return;
  editor.updateOptions({
    fontSize:prefs.fontSize,
    lineHeight:Math.round(prefs.fontSize*1.45),
    minimap:{enabled:prefs.minimap},
    wordWrap:prefs.wordWrap?'on':'off',
    lineNumbers:prefs.lineNumbers?'on':'off',
    cursorBlinking:prefs.smoothCursor?'smooth':'blink',
    renderLineHighlight:prefs.highlightLine?'all':'none',
    tabSize:prefs.tabSize,
    insertSpaces:prefs.insertSpaces
  });
  $('#setFontVal').textContent=prefs.fontSize;
  $('#setTabVal').textContent=prefs.tabSize;
  $('#setSpaces').checked=prefs.insertSpaces;
  $('#setWrap').checked=prefs.wordWrap;
  $('#setMinimap').checked=prefs.minimap;
  $('#setLineNums').checked=prefs.lineNumbers;
  $('#setSmooth').checked=prefs.smoothCursor;
  $('#setHL').checked=prefs.highlightLine;
}
function updatePref(k,v){prefs[k]=v;savePrefs();applyPrefsToUI();}

/* ============ Command palette ============ */
const COMMANDS=[
  {cat:'File',id:'new',label:'New File',key:'Ctrl+N',run:newFile},
  {cat:'File',id:'save',label:'Save File',key:'Ctrl+S',run:saveCurrent},
  {cat:'File',id:'import',label:'Import from Device',run:()=>$('#fileInput').click()},
  {cat:'File',id:'export',label:'Export to Documents',run:exportToDocuments},
  {cat:'File',id:'close',label:'Close Current Tab',run:()=>{if(session.activeId)closeTab(session.activeId);}},
  {cat:'File',id:'closeall',label:'Close All Tabs',run:()=>{session.openIds=[];session.activeId=null;editor.setModel(null);renderTabs();showWelcome(true);saveSession();}},
  {cat:'View',id:'toggle',label:'Toggle Sidebar',key:'Ctrl+B',run:toggleSidebar},
  {cat:'View',id:'explorer',label:'Show Explorer',run:()=>{openSidebar();switchView('explorer');}},
  {cat:'View',id:'search',label:'Show Search',run:()=>{openSidebar();switchView('search');}},
  {cat:'View',id:'settings',label:'Show Settings',run:()=>{openSidebar();switchView('settings');}},
  {cat:'View',id:'wrap',label:'Toggle Word Wrap',run:()=>updatePref('wordWrap',!prefs.wordWrap)},
  {cat:'View',id:'minimap',label:'Toggle Minimap',run:()=>updatePref('minimap',!prefs.minimap)},
  {cat:'View',id:'ln',label:'Toggle Line Numbers',run:()=>updatePref('lineNumbers',!prefs.lineNumbers)},
  {cat:'View',id:'fontup',label:'Increase Font Size',run:()=>updatePref('fontSize',Math.min(28,prefs.fontSize+1))},
  {cat:'View',id:'fontdown',label:'Decrease Font Size',run:()=>updatePref('fontSize',Math.max(10,prefs.fontSize-1))},
  {cat:'Edit',id:'find',label:'Find',key:'Ctrl+F',run:()=>{openSidebar();switchView('search');setTimeout(()=>editor.getAction('actions.find').run(),100);}},
  {cat:'Edit',id:'replace',label:'Find & Replace',key:'Ctrl+H',run:()=>editor.getAction('editor.action.startFindReplaceAction').run()},
  {cat:'Edit',id:'gotoline',label:'Go to Line',key:'Ctrl+G',run:()=>editor.getAction('editor.action.gotoLine').run()},
  {cat:'Edit',id:'comment',label:'Toggle Line Comment',key:'Ctrl+/',run:()=>editor.getAction('editor.action.commentLine').run()},
  {cat:'Edit',id:'indent',label:'Format Document',run:()=>editor.getAction('editor.action.formatDocument').run()},
  {cat:'Edit',id:'upper',label:'Transform to UPPERCASE',run:()=>{
    const sel=editor.getSelection();const text=editor.getModel().getValueInRange(sel);
    if(text)editor.executeEdits('upper',[{range:sel,text:text.toUpperCase()}]);
  }},
  {cat:'Edit',id:'lower',label:'Transform to lowercase',run:()=>{
    const sel=editor.getSelection();const text=editor.getModel().getValueInRange(sel);
    if(text)editor.executeEdits('lower',[{range:sel,text:text.toLowerCase()}]);
  }},
  {cat:'Help',id:'shortcuts',label:'Keyboard Shortcuts',run:()=>{$('#shortcutsModal').hidden=false;}},
  {cat:'Help',id:'about',label:'About Null Code Studio',run:()=>alert('Null Code Studio\nA mobile-first code editor.\n\nBuilt with Monaco (the engine behind VS Code).')}
];

function openPalette(){const p=$('#palette');p.hidden=false;const i=$('#paletteInput');i.value='';renderPalette('');setTimeout(()=>i.focus(),50);}
function closePalette(){$('#palette').hidden=true;}
function renderPalette(q){
  const l=$('#paletteList');l.innerHTML='';
  const ql=q.toLowerCase();
  const filtered=COMMANDS.filter(c=>c.label.toLowerCase().includes(ql)||c.cat.toLowerCase().includes(ql));
  if(filtered.length===0){l.innerHTML='<div class="palette-empty">No commands match</div>';return;}
  filtered.forEach((c,i)=>{
    const el=document.createElement('div');
    el.className='palette-item'+(i===0?' selected':'');
    el.innerHTML=`<span class="p-cat">${esc(c.cat)}</span><span class="p-label">${esc(c.label)}</span>${c.key?`<span class="p-key">${esc(c.key)}</span>`:''}`;
    el.addEventListener('click',()=>{closePalette();setTimeout(()=>c.run(),20);});
    l.appendChild(el);
  });
}

/* ============ UI wiring ============ */

/* ============ Top menu (File / Edit / View / Run) ============ */
const MENUS = {
  file: [
    {label:'New File', key:'Ctrl+N', run:newFile},
    {label:'Import from Device', run:()=>$('#fileInput').click()},
    {label:'Export to Documents', run:exportToDocuments},
    {sep:true},
    {label:'Save', key:'Ctrl+S', run:saveCurrent},
    {label:'Close Tab', run:()=>{if(session.activeId)closeTab(session.activeId);}},
    {label:'Close All Tabs', run:()=>{session.openIds=[];session.activeId=null;editor.setModel(null);renderTabs();showWelcome(true);saveSession();}},
    {sep:true},
    {label:'Reset Workspace', run:()=>{const b=$('#resetWs');if(b)b.click();}}
  ],
  edit: [
    {label:'Find', key:'Ctrl+F', run:()=>{openSidebar();switchView('search');}},
    {label:'Find & Replace', key:'Ctrl+H', run:()=>editor.getAction('editor.action.startFindReplaceAction').run()},
    {label:'Go to Line', key:'Ctrl+G', run:()=>editor.getAction('editor.action.gotoLine').run()},
    {sep:true},
    {label:'Toggle Line Comment', key:'Ctrl+/', run:()=>editor.getAction('editor.action.commentLine').run()},
    {label:'Format Document', run:()=>editor.getAction('editor.action.formatDocument').run()},
    {sep:true},
    {label:'Transform to UPPERCASE', run:()=>{const s=editor.getSelection();const t=editor.getModel().getValueInRange(s);if(t)editor.executeEdits('u',[{range:s,text:t.toUpperCase()}]);}},
    {label:'Transform to lowercase', run:()=>{const s=editor.getSelection();const t=editor.getModel().getValueInRange(s);if(t)editor.executeEdits('l',[{range:s,text:t.toLowerCase()}]);}}
  ],
  view: [
    {label:'Toggle Sidebar', key:'Ctrl+B', run:toggleSidebar},
    {label:'Show Explorer', run:()=>{openSidebar();switchView('explorer');}},
    {label:'Show Search', run:()=>{openSidebar();switchView('search');}},
    {label:'Show Settings', run:()=>{openSidebar();switchView('settings');}},
    {sep:true},
    {label:'Command Palette', key:'Ctrl+K', run:openPalette},
    {sep:true},
    {label:'Toggle Word Wrap', run:()=>updatePref('wordWrap',!prefs.wordWrap)},
    {label:'Toggle Minimap', run:()=>updatePref('minimap',!prefs.minimap)},
    {label:'Toggle Line Numbers', run:()=>updatePref('lineNumbers',!prefs.lineNumbers)},
    {sep:true},
    {label:'Increase Font Size', run:()=>updatePref('fontSize',Math.min(28,prefs.fontSize+1))},
    {label:'Decrease Font Size', run:()=>updatePref('fontSize',Math.max(10,prefs.fontSize-1))}
  ],
  run: [
    {label:'No run configuration', disabled:true},
    {label:'Coming in a future update', disabled:true}
  ]
};

function openTopMenu(name, anchor){
  const dd=$('#menuDropdown');const list=$('#menuDropdownList');
  if(!dd||!list)return;
  list.innerHTML='';
  const items=MENUS[name]||[];
  for(const it of items){
    if(it.sep){const s=document.createElement('div');s.className='menu-sep';list.appendChild(s);continue;}
    const el=document.createElement('div');
    el.className='menu-entry'+(it.disabled?' disabled':'');
    el.innerHTML='<span>'+esc(it.label)+'</span>'+(it.key?'<span class="m-key">'+esc(it.key)+'</span>':'');
    if(!it.disabled)el.addEventListener('click',()=>{closeTopMenu();setTimeout(()=>it.run(),20);});
    list.appendChild(el);
  }
  const rect=anchor.getBoundingClientRect();
  dd.style.left=Math.max(4,rect.left)+'px';
  dd.style.top=(rect.bottom+1)+'px';
  dd.hidden=false;
  $('.menu-item').forEach(m=>m.classList.toggle('open',m===anchor));
}
function closeTopMenu(){
  const dd=$('#menuDropdown');
  if(dd)dd.hidden=true;
  $('.menu-item').forEach(m=>m.classList.remove('open'));
}
function wireMenus(){
  $('.menu-item').forEach(m=>{
    m.addEventListener('click',e=>{
      e.stopPropagation();
      const name=m.dataset.menu;
      if(m.classList.contains('open'))closeTopMenu();
      else openTopMenu(name,m);
    });
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('.menu-item')&&!e.target.closest('#menuDropdown'))closeTopMenu();
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape')closeTopMenu();
  });
}

function wireUI(){
  wireMenus();
  $('#toggleSidebar').addEventListener('click',toggleSidebar);
  $('#closeSidebar')?.addEventListener('click',closeSidebar);
  $('#scrim').addEventListener('click',closeSidebar);
  $('#newFileBtn').addEventListener('click',newFile);
  $('#importBtn').addEventListener('click',()=>$('#fileInput').click());
  $('#exportBtn').addEventListener('click',exportToDocuments);
  $('#saveBtn').addEventListener('click',saveCurrent);
  $('#cmdBtn').addEventListener('click',openPalette);
  $('#moreBtn').addEventListener('click',()=>{$('#shortcutsModal').hidden=false;});
  $('#closeShortcuts').addEventListener('click',()=>{$('#shortcutsModal').hidden=true;});
  $('#doneShortcuts').addEventListener('click',()=>{$('#shortcutsModal').hidden=true;});
  $('#shortcutsModal').addEventListener('click',e=>{if(e.target.id==='shortcutsModal')$('#shortcutsModal').hidden=true;});

  $$('.activity-item').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));

  // Search
  $('#searchInput').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(runSearch,140);});
  $('#searchCase').addEventListener('change',runSearch);
  $('#searchRegex').addEventListener('change',runSearch);
  $('#clearSearchBtn').addEventListener('click',()=>{$('#searchInput').value='';runSearch();});

  // Settings steppers
  $$('[data-step]').forEach(b=>b.addEventListener('click',()=>{
    const d=parseInt(b.dataset.step,10);
    updatePref('fontSize',Math.max(10,Math.min(28,prefs.fontSize+d)));
  }));
  $$('[data-tab]').forEach(b=>b.addEventListener('click',()=>{
    const d=parseInt(b.dataset.tab,10);
    updatePref('tabSize',Math.max(1,Math.min(8,prefs.tabSize+d)));
  }));
  $('#setSpaces').addEventListener('change',e=>updatePref('insertSpaces',e.target.checked));
  $('#setWrap').addEventListener('change',e=>updatePref('wordWrap',e.target.checked));
  $('#setMinimap').addEventListener('change',e=>updatePref('minimap',e.target.checked));
  $('#setLineNums').addEventListener('change',e=>updatePref('lineNumbers',e.target.checked));
  $('#setSmooth').addEventListener('change',e=>updatePref('smoothCursor',e.target.checked));
  $('#setHL').addEventListener('change',e=>updatePref('highlightLine',e.target.checked));
  $('#resetWs').addEventListener('click',()=>{
    if(!confirm('Reset workspace? All files will be deleted.'))return;
    workspace={files:[seedFile()]};
    session={openIds:[],activeId:null};
    recent=[];dirty.clear();
    saveWorkspace();saveSession();saveRecent();
    boot();toast('Workspace reset');
  });

  $('#fileInput').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];if(f)importFromDevice(f);e.target.value='';});
  $('#paletteInput').addEventListener('input',e=>renderPalette(e.target.value));
  $('#paletteInput').addEventListener('keydown',e=>{
    if(e.key==='Enter'){const f=$('#paletteList .palette-item.selected')||$('#paletteList .palette-item');if(f)f.click();}
    if(e.key==='Escape')closePalette();
  });
  $('#palette').addEventListener('click',e=>{if(e.target.id==='palette')closePalette();});

  $$('.ws-link').forEach(a=>a.addEventListener('click',()=>{
    const act=a.dataset.action;
    if(act==='new')newFile();
    else if(act==='import')$('#fileInput').click();
    else if(act==='palette')openPalette();
    else if(act==='shortcuts')$('#shortcutsModal').hidden=false;
  }));

  window.addEventListener('keydown',e=>{
    const mod=e.ctrlKey||e.metaKey;
    if(e.key==='Escape'){
      if(!$('#palette').hidden)closePalette();
      else if(!$('#shortcutsModal').hidden)$('#shortcutsModal').hidden=true;
      else if($('#sidebar').classList.contains('open'))closeSidebar();
    }
    if(!mod)return;
    const k=e.key.toLowerCase();
    if(k==='s'){e.preventDefault();saveCurrent();}
    else if(k==='k'){e.preventDefault();openPalette();}
    else if(k==='n'){e.preventDefault();newFile();}
    else if(k==='b'){e.preventDefault();toggleSidebar();}
    else if(k==='f'){e.preventDefault();openSidebar();switchView('search');}
    else if(k==='h'){e.preventDefault();editor.getAction('editor.action.startFindReplaceAction').run();}
    else if(k==='g'){e.preventDefault();editor.getAction('editor.action.gotoLine').run();}
    else if(k==='/'){e.preventDefault();editor.getAction('editor.action.commentLine').run();}
    else if(k==='p'){e.preventDefault();quickOpen();}
  });
}
function quickOpen(){
  // Simple quick-open: focus palette filtered to files
  openPalette();
  const fileCommands=workspace.files.map(f=>({cat:'Open',label:f.name,run:()=>activate(f.id)}));
  const orig=COMMANDS.slice();
  COMMANDS.length=0;COMMANDS.push(...fileCommands,...orig);
  renderPalette('');
}
function prettyLang(l){
  const m={javascript:'JavaScript',typescript:'TypeScript',lua:'Lua',python:'Python',html:'HTML',css:'CSS',json:'JSON',markdown:'Markdown',cpp:'C++',c:'C',java:'Java',rust:'Rust',go:'Go',shell:'Shell',yaml:'YAML',xml:'XML',plaintext:'Plain Text'};
  return m[l]||l;
}

window.closeTopMenu=closeTopMenu;
