const STORE_KEY='ncs.workspace.v2';
const SESSION_KEY='ncs.session.v2';
const PREFS_KEY='ncs.prefs.v2';
const RECENT_KEY='ncs.recent.v2';

const LANG_MAP={lua:'lua',luau:'lua',js:'javascript',mjs:'javascript',ts:'typescript',py:'python',html:'html',htm:'html',css:'css',json:'json',md:'markdown',cpp:'cpp',cc:'cpp',c:'c',h:'c',java:'java',rs:'rust',go:'go',sh:'shell',bash:'shell',yml:'yaml',yaml:'yaml',xml:'xml',txt:'plaintext'};
const LANG_ICON={lua:'L',javascript:'JS',typescript:'TS',python:'Py',html:'<>',css:'#',json:'{}',markdown:'M',cpp:'C+',c:'C',java:'Jv',rust:'Rs',go:'Go',shell:'$',yaml:'Y',xml:'X',plaintext:'·'};
const LANG_COLOR={lua:'#4b8f8f',javascript:'#f1e05a',typescript:'#3178c6',python:'#3572A5',html:'#e34c26',css:'#7a5fa8',json:'#cbcb41',markdown:'#4a9eff',cpp:'#f34b7d',c:'#888',java:'#b07219',rust:'#dea584',go:'#00ADD8',shell:'#89e051',yaml:'#cb171e',xml:'#0060ac',plaintext:'#666'};
const DEFAULT_PREFS={fontSize:14,tabSize:2,insertSpaces:true,wordWrap:true,minimap:false,lineNumbers:true,smoothCursor:true,highlightLine:true};

function loadJSON(key,fallback){try{const r=localStorage.getItem(key);if(r)return JSON.parse(r);}catch{}return fallback();}
function saveJSON(key,val){try{localStorage.setItem(key,JSON.stringify(val));}catch{}}
function seedFile(){return{id:'w_'+Date.now(),name:'welcome.lua',content:'-- Welcome to Null Code Studio\n-- Tap the palette icon or use a top menu to explore.\n\nlocal function greet(name)\n  print("Hello, " .. name .. "!")\nend\n\ngreet("Null Code Studio")\n',lang:'lua'};}

let workspace=loadJSON(STORE_KEY,()=>({files:[seedFile()]}));
let session=loadJSON(SESSION_KEY,()=>({openIds:[],activeId:null}));
let prefs={...DEFAULT_PREFS,...loadJSON(PREFS_KEY,()=>({}))};
let recent=loadJSON(RECENT_KEY,()=>[]);
let editor=null;
let dirty=new Map();
let activeView='explorer';
let searchTimer=null;

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
function toast(m,ms=1800){const el=$('#toast');el.textContent=m;el.hidden=false;el.style.animation='none';void el.offsetWidth;el.style.animation='';clearTimeout(toast._t);toast._t=setTimeout(()=>{el.hidden=true;},ms);}

/* ============ Monaco bootstrap ============ */
require.config({paths:{vs:'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs'}});
require(['vs/editor/editor.main'],()=>{
  monaco.editor.defineTheme('ncs-dark',{base:'vs-dark',inherit:true,rules:[],
    colors:{
      'editor.background':'#0a0a0a',
      'editorGutter.background':'#0a0a0a',
      'editorLineNumber.foreground':'#3a3a3a',
      'editorLineNumber.activeForeground':'#8a8a8a',
      'editor.selectionBackground':'#1f3a2a',
      'editor.lineHighlightBackground':'#131313',
      'editorCursor.foreground':'#4ade80',
      'editorIndentGuide.background1':'#262626',
      'editorIndentGuide.activeBackground1':'#3a3a3a',
      'editorWidget.background':'#161616',
      'editorWidget.border':'#3a3a3a'
    }});

  editor=monaco.editor.create($('#editor'),{
    value:'',language:'lua',theme:'ncs-dark',automaticLayout:true,
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
    contextmenu:false,quickSuggestions:false,suggestOnTriggerCharacters:false,
    padding:{top:12,bottom:12},lineNumbersMinChars:3,glyphMargin:false,folding:true,
    renderWhitespace:'selection',tabSize:prefs.tabSize,insertSpaces:prefs.insertSpaces,
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
      saveWorkspace();updateStatusSize();
    }
  });
  window.editor=editor; editor.onDidChangeCursorPosition(e=>{$('#sbPos').textContent='Ln '+e.position.lineNumber+', Col '+e.position.column;});

  const ed=$('#editor');let lastY=0,lastTop=0;
  ed.addEventListener('touchstart',e=>{if(e.touches.length===2){lastY=(e.touches[0].clientY+e.touches[1].clientY)/2;lastTop=editor.getScrollTop();}},{passive:true});
  ed.addEventListener('touchmove',e=>{if(e.touches.length===2){const y=(e.touches[0].clientY+e.touches[1].clientY)/2;editor.setScrollTop(lastTop+(lastY-y)*2.2);e.preventDefault();}},{passive:false});

  /* NCS_LONGPRESS: hold 450ms to select word under finger */
  (function(){
    var pressTimer=null, startX=0, startY=0, moved=false;
    function clearPress(){ if(pressTimer){ clearTimeout(pressTimer); pressTimer=null; } }
    function wordAt(x,y){
      try{
        if(!editor||!editor.getTargetAtClientPoint) return null;
        var t=editor.getTargetAtClientPoint(x,y);
        if(!t||!t.position) return null;
        var m=editor.getModel(); if(!m) return null;
        var w=m.getWordAtPosition(t.position);
        if(!w) return null;
        return {line:t.position.lineNumber, start:w.startColumn, end:w.endColumn};
      }catch(e){ return null; }
    }
    ed.addEventListener('touchstart',function(e){
      if(e.touches.length!==1){ clearPress(); return; }
      var t=e.touches[0]; startX=t.clientX; startY=t.clientY; moved=false;
      clearPress();
      pressTimer=setTimeout(function(){
        if(moved) return;
        var w=wordAt(startX,startY);
        if(w){
          editor.setSelection(new monaco.Range(w.line,w.start,w.line,w.end));
          editor.focus();
          if(navigator.vibrate) try{ navigator.vibrate(15); }catch(_e){}
        }
      },450);
    },{passive:true});
    ed.addEventListener('touchmove',function(e){
      if(e.touches.length!==1) return;
      var t=e.touches[0];
      if(Math.abs(t.clientX-startX)>8||Math.abs(t.clientY-startY)>8){ moved=true; clearPress(); }
    },{passive:true});
    ed.addEventListener('touchend',clearPress,{passive:true});
    ed.addEventListener('touchcancel',clearPress,{passive:true});
  })();

  boot();
});

/* ============ Boot ============ */
function boot(){
  if(session.openIds.length===0&&workspace.files.length>0){session.openIds=[workspace.files[0].id];session.activeId=workspace.files[0].id;}
  session.openIds=session.openIds.filter(id=>workspace.files.some(f=>f.id===id));
  if(!workspace.files.some(f=>f.id===session.activeId))session.activeId=session.openIds[0]||null;
  applyPrefsToUI();renderTabs();renderTree();renderRecent();
  if(session.activeId)activate(session.activeId);else showWelcome(true);
  wireUI();updateTitle();saveSession();
}

/* ============ Rendering ============ */
function renderTabs(){
  const el=$('#tabs');el.innerHTML='';
  for(const id of session.openIds){
    const f=workspace.files.find(x=>x.id===id);if(!f)continue;
    const lang=f.lang||langFromName(f.name);
    const icon=LANG_ICON[lang]||'·';
    const color=LANG_COLOR[lang]||'#888';
    const t=document.createElement('div');
    t.className='tab'+(id===session.activeId?' active':'');
    t.innerHTML='<span class="t-icon" style="color:'+color+'">'+esc(icon)+'</span><span class="t-name">'+esc(f.name)+'</span><span class="t-dirty'+(dirty.get(id)?'':' hidden')+'"></span><button class="t-close">×</button>';
    t.addEventListener('click',e=>{if(e.target.classList.contains('t-close'))closeTab(id);else activate(id);});
    el.appendChild(t);
  }
}
function renderTree(){
  const el=$('#fileTree');el.innerHTML='';
  if(workspace.files.length===0){el.innerHTML='<div class="file-empty">No files in workspace.<br>Tap + to create one.</div>';return;}
  for(const f of workspace.files){
    const lang=f.lang||langFromName(f.name);
    const icon=LANG_ICON[lang]||'·';
    const color=LANG_COLOR[lang]||'#888';
    const item=document.createElement('div');
    item.className='file-item'+(f.id===session.activeId?' active':'');
    item.innerHTML='<span class="f-icon" style="color:'+color+'">'+esc(icon)+'</span><span class="f-name">'+esc(f.name)+'</span><button class="f-del" title="Delete">×</button>';
    item.addEventListener('click',e=>{if(e.target.classList.contains('f-del')){deleteFile(f.id);return;}activate(f.id);if(innerWidth<760)closeSidebar();});
    el.appendChild(item);
  }
}
function renderRecent(){
  const el=$('#recentList');el.innerHTML='';
  const valid=recent.filter(id=>workspace.files.some(f=>f.id===id)).slice(0,6);
  if(valid.length===0){el.innerHTML='<div class="recent-empty">No recent files</div>';return;}
  for(const id of valid){
    const f=workspace.files.find(x=>x.id===id);
    const item=document.createElement('div');item.className='recent-item';item.textContent=f.name;
    item.addEventListener('click',()=>activate(id));el.appendChild(item);
  }
}
function renderBreadcrumbs(f){
  const el=$('#breadcrumbs');
  if(!f){el.innerHTML='';return;}
  const parts=f.name.split(/[\\/]/);
  el.innerHTML=parts.map((p,i)=>'<span class="bc-item'+(i===parts.length-1?' active':'')+'">'+esc(p)+'</span>').join('<span class="bc-sep">›</span>');
}
function updateTitle(){
  const f=workspace.files.find(x=>x.id===session.activeId);
  const t=$('#titleCenter').querySelector('.title-text');
  if(t){t.textContent=f?f.name:'Null Code Studio';t.classList.toggle('dirty',!!dirty.get(session.activeId));}
}
function updateStatusSize(){}

/* ============ File ops ============ */
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
  updateTitle();pushRecent(id);renderRecent();saveSession();
}
function closeTab(id){
  session.openIds=session.openIds.filter(x=>x!==id);
  if(session.activeId===id){
    session.activeId=session.openIds[session.openIds.length-1]||null;
    if(session.activeId)activate(session.activeId);else{editor.setModel(null);showWelcome(true);renderBreadcrumbs(null);}
  }
  renderTabs();saveSession();
}
function showWelcome(v){$('#welcome').classList.toggle('hidden',!v);if(v)renderRecent();}
function prettyLang(l){const m={javascript:'JavaScript',typescript:'TypeScript',lua:'Lua',python:'Python',html:'HTML',css:'CSS',json:'JSON',markdown:'Markdown',cpp:'C++',c:'C',java:'Java',rust:'Rust',go:'Go',shell:'Shell',yaml:'YAML',xml:'XML',plaintext:'Plain Text'};return m[l]||l;}

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
  r.onload=()=>{const id=uid();workspace.files.push({id,name:file.name,content:r.result,lang:langFromName(file.name)});saveWorkspace();activate(id);toast('Imported '+file.name);};
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
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Downloaded '+f.name);
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
  out.innerHTML='';let totalHits=0;
  for(const f of workspace.files){
    const lines=f.content.split('\n');const hits=[];
    lines.forEach((line,idx)=>{
      re.lastIndex=0;
      if(re.test(line)){
        const h=esc(line).replace(new RegExp(useRegex?q:escRe(q),caseSensitive?'g':'gi'),m=>'<mark>'+esc(m)+'</mark>');
        hits.push({line:idx+1,text:h});
      }
    });
    if(hits.length===0)continue;
    totalHits+=hits.length;
    const hdr=document.createElement('div');hdr.className='search-file-header';
    hdr.innerHTML='<span>'+esc(f.name)+'</span><span class="count">'+hits.length+'</span>';
    out.appendChild(hdr);
    for(const h of hits.slice(0,25)){
      const el=document.createElement('div');el.className='search-hit';
      el.innerHTML='<span class="line-num">'+h.line+'</span>'+h.text;
      el.addEventListener('click',()=>{
        activate(f.id);
        setTimeout(()=>{editor.revealLineInCenter(h.line);editor.setPosition({lineNumber:h.line,column:1});editor.focus();},80);
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
    fontSize:prefs.fontSize,lineHeight:Math.round(prefs.fontSize*1.45),
    minimap:{enabled:prefs.minimap},wordWrap:prefs.wordWrap?'on':'off',
    lineNumbers:prefs.lineNumbers?'on':'off',
    cursorBlinking:prefs.smoothCursor?'smooth':'blink',
    renderLineHighlight:prefs.highlightLine?'all':'none',
    tabSize:prefs.tabSize,insertSpaces:prefs.insertSpaces
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
  {cat:'File',label:'New File',key:'Ctrl+N',run:newFile},
  {cat:'File',label:'Save File',key:'Ctrl+S',run:saveCurrent},
  {cat:'File',label:'Import from Device',run:()=>$('#fileInput').click()},
  {cat:'File',label:'Export to Documents',run:exportToDocuments},
  {cat:'File',label:'Close Current Tab',run:()=>{if(session.activeId)closeTab(session.activeId);}},
  {cat:'File',label:'Close All Tabs',run:()=>{session.openIds=[];session.activeId=null;editor.setModel(null);renderTabs();showWelcome(true);saveSession();}},
  {cat:'View',label:'Toggle Sidebar',key:'Ctrl+B',run:toggleSidebar},
  {cat:'View',label:'Show Explorer',run:()=>{openSidebar();switchView('explorer');}},
  {cat:'View',label:'Show Search',run:()=>{openSidebar();switchView('search');}},
  {cat:'View',label:'Show Settings',run:()=>{openSidebar();switchView('settings');}},
  {cat:'View',label:'Toggle Word Wrap',run:()=>updatePref('wordWrap',!prefs.wordWrap)},
  {cat:'View',label:'Toggle Minimap',run:()=>updatePref('minimap',!prefs.minimap)},
  {cat:'View',label:'Toggle Line Numbers',run:()=>updatePref('lineNumbers',!prefs.lineNumbers)},
  {cat:'View',label:'Increase Font Size',run:()=>updatePref('fontSize',Math.min(28,prefs.fontSize+1))},
  {cat:'View',label:'Decrease Font Size',run:()=>updatePref('fontSize',Math.max(10,prefs.fontSize-1))},
  {cat:'Edit',label:'Find',key:'Ctrl+F',run:()=>{openSidebar();switchView('search');}},
  {cat:'Edit',label:'Find & Replace',key:'Ctrl+H',run:()=>editor.getAction('editor.action.startFindReplaceAction').run()},
  {cat:'Edit',label:'Go to Line',key:'Ctrl+G',run:()=>editor.getAction('editor.action.gotoLine').run()},
  {cat:'Edit',label:'Toggle Line Comment',key:'Ctrl+/',run:()=>editor.getAction('editor.action.commentLine').run()},
  {cat:'Edit',label:'Format Document',run:()=>editor.getAction('editor.action.formatDocument').run()},
  {cat:'Edit',label:'Transform to UPPERCASE',run:()=>{const s=editor.getSelection();const t=editor.getModel().getValueInRange(s);if(t)editor.executeEdits('u',[{range:s,text:t.toUpperCase()}]);}},
  {cat:'Edit',label:'Transform to lowercase',run:()=>{const s=editor.getSelection();const t=editor.getModel().getValueInRange(s);if(t)editor.executeEdits('l',[{range:s,text:t.toLowerCase()}]);}},
  {cat:'Help',label:'Keyboard Shortcuts',run:()=>{$('#shortcutsModal').hidden=false;}},
  {cat:'Help',label:'About Null Code Studio',run:()=>alert('Null Code Studio\nA mobile-first code editor.\n\nBuilt with Monaco (the engine behind VS Code).')}
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
    el.innerHTML='<span class="p-cat">'+esc(c.cat)+'</span><span class="p-label">'+esc(c.label)+'</span>'+(c.key?'<span class="p-key">'+esc(c.key)+'</span>':'');
    el.addEventListener('click',()=>{closePalette();setTimeout(()=>c.run(),20);});
    l.appendChild(el);
  });
}

/* ============ Top menu ============ */
const MENUS={
  file:[
    {label:"New File",key:"Ctrl+N",run:newFile},
    {label:"Import from Device",run:function(){var el=document.querySelector("#fileInput");if(el)el.click();}},
    {label:"Export to Documents",run:exportToDocuments},
    {sep:true},
    {label:"Save",key:"Ctrl+S",run:saveCurrent},
    {label:"Close Tab",run:function(){if(session.activeId)closeTab(session.activeId);}},
    {label:"Close All Tabs",run:function(){session.openIds=[];session.activeId=null;editor.setModel(null);renderTabs();showWelcome(true);saveSession();}},
    {sep:true},
    {label:"Reset Workspace",run:function(){var el=document.querySelector("#resetWs");if(el)el.click();}}
  ],
  edit:[
    {label:"Find",key:"Ctrl+F",run:function(){openSidebar();switchView("search");}},
    {label:"Find & Replace",key:"Ctrl+H",run:function(){editor.getAction("editor.action.startFindReplaceAction").run();}},
    {label:"Go to Line",key:"Ctrl+G",run:function(){editor.getAction("editor.action.gotoLine").run();}},
    {sep:true},
    {label:"Toggle Line Comment",key:"Ctrl+/",run:function(){editor.getAction("editor.action.commentLine").run();}},
    {label:"Format Document",run:function(){editor.getAction("editor.action.formatDocument").run();}},
    {sep:true},
    {label:"Select All",run:function(){var m=editor.getModel();if(m)editor.setSelection(m.getFullModelRange());}},
    {label:"Copy Selection",run:function(){copySelection();}},
    {label:"Paste",run:function(){pasteClipboard();}},
    {sep:true},
    {label:"Transform to UPPERCASE",run:function(){var s=editor.getSelection();var t=editor.getModel().getValueInRange(s);if(t)editor.executeEdits("u",[{range:s,text:t.toUpperCase()}]);}},
    {label:"Transform to lowercase",run:function(){var s=editor.getSelection();var t=editor.getModel().getValueInRange(s);if(t)editor.executeEdits("l",[{range:s,text:t.toLowerCase()}]);}}
  ],
  view:[
    {label:"Toggle Sidebar",key:"Ctrl+B",run:toggleSidebar},
    {label:"Show Explorer",run:function(){openSidebar();switchView("explorer");}},
    {label:"Show Search",run:function(){openSidebar();switchView("search");}},
    {label:"Show Settings",run:function(){openSidebar();switchView("settings");}},
    {sep:true},
    {label:"Command Palette",key:"Ctrl+K",run:openPalette},
    {sep:true},
    {label:"Toggle Word Wrap",run:function(){updatePref("wordWrap",!prefs.wordWrap);}},
    {label:"Toggle Minimap",run:function(){updatePref("minimap",!prefs.minimap);}},
    {label:"Toggle Line Numbers",run:function(){updatePref("lineNumbers",!prefs.lineNumbers);}},
    {sep:true},
    {label:"Increase Font Size",run:function(){updatePref("fontSize",Math.min(28,prefs.fontSize+1));}},
    {label:"Decrease Font Size",run:function(){updatePref("fontSize",Math.max(10,prefs.fontSize-1));}}
  ],
  run:[
    {label:"Run Active File",key:"F5",run:function(){if(window.runActiveFile)window.runActiveFile();}},
    {sep:true},
    {label:"Configure Run…",run:function(){if(window.openRunConfig)window.openRunConfig();}}
  ]
};

var openMenuName=null;
function openTopMenu(name,anchor){
  var dd=document.querySelector("#menuDropdown"),list=document.querySelector("#menuDropdownList");
  if(!dd||!list)return;
  list.innerHTML="";
  var items=MENUS[name]||[];
  for(var i=0;i<items.length;i++){
    var it=items[i];
    if(it.sep){var sp=document.createElement("div");sp.className="menu-sep";list.appendChild(sp);continue;}
    var el=document.createElement("div");
    el.className="menu-entry"+(it.disabled?" disabled":"");
    el.innerHTML="<span>"+esc(it.label)+"</span>"+(it.key?'<span class="m-key">'+esc(it.key)+"</span>":"");
    (function(item,node){
      if(!item.disabled)node.addEventListener("click",function(){closeTopMenu();setTimeout(function(){item.run();},20);});
    })(it,el);
    list.appendChild(el);
  }
  var r=anchor.getBoundingClientRect();
  dd.style.left=Math.max(6,Math.min(r.left,window.innerWidth-260))+"px";
  dd.style.top=(r.bottom+4)+"px";
  dd.hidden=false;
  openMenuName=name;
  var btns=document.querySelectorAll(".menu-item");
  for(var j=0;j<btns.length;j++){btns[j].classList.toggle("open",btns[j].dataset.menu===name);}
}
function closeTopMenu(){
  var dd=document.querySelector("#menuDropdown");if(dd)dd.hidden=true;
  openMenuName=null;
  var btns=document.querySelectorAll(".menu-item");
  for(var j=0;j<btns.length;j++){btns[j].classList.remove("open");}
}
function toggleTopMenu(name,anchor){
  if(openMenuName===name)closeTopMenu();
  else openTopMenu(name,anchor);
}

window.MENUS=MENUS;
window.openTopMenu=openTopMenu;
window.closeTopMenu=closeTopMenu;
window.toggleTopMenu=toggleTopMenu;

/* ============ Selection actions ============ */
function fallbackCopy(text){
  var ta=document.createElement("textarea");
  ta.value=text;ta.style.position="fixed";ta.style.opacity="0";ta.style.top="0";
  document.body.appendChild(ta);ta.focus();ta.select();
  try{document.execCommand("copy");toast("Copied");}catch(err){toast("Copy failed");}
  document.body.removeChild(ta);
}
function copySelection(){
  if(!editor)return;
  var sel=editor.getSelection();var m=editor.getModel();if(!m)return;
  var text=m.getValueInRange(sel);
  if(!text){toast("Nothing selected");return;}
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){toast("Copied");}).catch(function(){fallbackCopy(text);});
  }else fallbackCopy(text);
}
function cutSelection(){
  if(!editor)return;
  var sel=editor.getSelection();var m=editor.getModel();if(!m)return;
  var text=m.getValueInRange(sel);
  if(!text){toast("Nothing selected");return;}
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){
      editor.executeEdits("cut",[{range:sel,text:""}]);
      editor.focus();toast("Cut");
    }).catch(function(){toast("Cut failed");});
  }
}
function pasteClipboard(){
  if(!editor)return;
  if(!navigator.clipboard||!navigator.clipboard.readText){toast("Paste not supported");return;}
  navigator.clipboard.readText().then(function(text){
    if(!text)return;
    var sel=editor.getSelection();
    editor.executeEdits("paste",[{range:sel,text:text}]);
    editor.focus();
  }).catch(function(){toast("Paste blocked");});
}
window.copySelection=copySelection;
window.cutSelection=cutSelection;
window.pasteClipboard=pasteClipboard;

function ensureSelectionBar(){
  var bar=document.querySelector("#selBar");
  if(bar)return bar;
  bar=document.createElement("div");
  bar.id="selBar";bar.className="sel-bar";bar.hidden=true;
  bar.innerHTML='<button class="sel-btn" data-act="copy">Copy</button>'
    +'<button class="sel-btn" data-act="cut">Cut</button>'
    +'<button class="sel-btn" data-act="paste">Paste</button>'
    +'<button class="sel-btn" data-act="all">All</button>'
    +'<button class="sel-btn sel-close" data-act="close">✕</button>';
  bar.addEventListener("click",function(e){
    var b=e.target.closest(".sel-btn");if(!b)return;
    var a=b.dataset.act;
    if(a==="copy")copySelection();
    else if(a==="cut")cutSelection();
    else if(a==="paste")pasteClipboard();
    else if(a==="all"){var m=editor.getModel();if(m)editor.setSelection(m.getFullModelRange());}
    else if(a==="close"){bar.hidden=true;}
  });
  var wrap=document.querySelector(".editor-wrap");
  if(wrap)wrap.appendChild(bar);
  return bar;
}
function updateSelectionBar(){
  if(!editor)return;
  var bar=ensureSelectionBar();
  var sel=editor.getSelection();
  if(!sel||sel.isEmpty()){bar.hidden=true;return;}
  bar.hidden=false;
}

/* ============ UI wiring ============ */
function wireUI(){
  $('#toggleSidebar').addEventListener('click',toggleSidebar);
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

  $('#searchInput').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(runSearch,140);});
  $('#searchCase').addEventListener('change',runSearch);
  $('#searchRegex').addEventListener('change',runSearch);
  $('#clearSearchBtn').addEventListener('click',()=>{$('#searchInput').value='';runSearch();});

  $$('[data-step]').forEach(b=>b.addEventListener('click',()=>{const d=parseInt(b.dataset.step,10);updatePref('fontSize',Math.max(10,Math.min(28,prefs.fontSize+d)));}));
  $$('[data-tab]').forEach(b=>b.addEventListener('click',()=>{const d=parseInt(b.dataset.tab,10);updatePref('tabSize',Math.max(1,Math.min(8,prefs.tabSize+d)));}));
  $('#setSpaces').addEventListener('change',e=>updatePref('insertSpaces',e.target.checked));
  $('#setWrap').addEventListener('change',e=>updatePref('wordWrap',e.target.checked));
  $('#setMinimap').addEventListener('change',e=>updatePref('minimap',e.target.checked));
  $('#setLineNums').addEventListener('change',e=>updatePref('lineNumbers',e.target.checked));
  $('#setSmooth').addEventListener('change',e=>updatePref('smoothCursor',e.target.checked));
  $('#setHL').addEventListener('change',e=>updatePref('highlightLine',e.target.checked));
  $('#resetWs').addEventListener('click',()=>{
    if(!confirm('Reset workspace? All files will be deleted.'))return;
    workspace={files:[seedFile()]};session={openIds:[],activeId:null};recent=[];dirty.clear();
    saveWorkspace();saveSession();saveRecent();boot();toast('Workspace reset');
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
    else if(k==='p'){e.preventDefault();openPalette();}
  });
}



/* ============ NCS Menu + Selection Bar ============ */
(function(){
  var MENUS = {
    file: [
      {label:'New File', key:'Ctrl+N', action:'newFile'},
      {label:'Import from Device', action:'__import'},
      {label:'Export to Documents', action:'exportToDocuments'},
      {sep:true},
      {label:'Save', key:'Ctrl+S', action:'saveCurrent'},
      {label:'Close Tab', action:'__closeTab'},
      {label:'Close All Tabs', action:'__closeAll'},
      {sep:true},
      {label:'Reset Workspace', action:'__reset'}
    ],
    edit: [
      {label:'Find', key:'Ctrl+F', action:'__find'},
      {label:'Find & Replace', key:'Ctrl+H', action:'__replace'},
      {label:'Go to Line', key:'Ctrl+G', action:'__goto'},
      {sep:true},
      {label:'Toggle Line Comment', key:'Ctrl+/', action:'__comment'},
      {label:'Format Document', action:'__format'},
      {sep:true},
      {label:'Select All', action:'__selectAll'},
      {label:'Copy Selection', action:'__copy'},
      {label:'Cut Selection', action:'__cut'},
      {label:'Paste', action:'__paste'}
    ],
    view: [
      {label:'Toggle Sidebar', key:'Ctrl+B', action:'toggleSidebar'},
      {label:'Show Explorer', action:'__showExplorer'},
      {label:'Show Search', action:'__showSearch'},
      {label:'Show Settings', action:'__showSettings'},
      {sep:true},
      {label:'Command Palette', key:'Ctrl+K', action:'openPalette'},
      {sep:true},
      {label:'Toggle Word Wrap', action:'__wrap'},
      {label:'Toggle Minimap', action:'__minimap'},
      {label:'Increase Font Size', action:'__fontUp'},
      {label:'Decrease Font Size', action:'__fontDown'}
    ],
    run: [
      {label:'Run Active File', key:'F5', action:'__run'},
      {sep:true},
      {label:'Configure Run', action:'__runConfig'}
    ]
  };

  function escHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function toast2(m){
    var t = document.getElementById('toast'); if(!t) return;
    t.textContent = m; t.hidden = false;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toast2._t);
    toast2._t = setTimeout(function(){ t.hidden = true; }, 1600);
  }

  function closeMenu(){
    var dd = document.getElementById('menuDropdown');
    if(dd){ dd.hidden = true; dd.dataset.openFor = ''; }
    var btns = document.querySelectorAll('.menu-item');
    for(var i=0;i<btns.length;i++) btns[i].classList.remove('open');
  }

  function runAction(name){
    try {
      if(name === '__import'){ var fi=document.getElementById('fileInput'); if(fi) fi.click(); return; }
      if(name === '__closeTab'){ if(typeof session!=='undefined' && session.activeId && typeof closeTab==='function') closeTab(session.activeId); return; }
      if(name === '__closeAll'){
        try{ session.openIds=[]; session.activeId=null; }catch(e){}
        var ed=window.editor; if(ed) ed.setModel(null);
        if(typeof renderTabs==='function') renderTabs();
        if(typeof showWelcome==='function') showWelcome(true);
        return;
      }
      if(name === '__reset'){ var rb=document.getElementById('resetWs'); if(rb) rb.click(); return; }
      if(name === '__find'){ if(typeof openSidebar==='function') openSidebar(); if(typeof switchView==='function') switchView('search'); return; }
      if(name === '__replace'){ var e2=window.editor; if(e2) e2.getAction('editor.action.startFindReplaceAction').run(); return; }
      if(name === '__goto'){ var e3=window.editor; if(e3) e3.getAction('editor.action.gotoLine').run(); return; }
      if(name === '__comment'){ var e4=window.editor; if(e4) e4.getAction('editor.action.commentLine').run(); return; }
      if(name === '__format'){ var e5=window.editor; if(e5) e5.getAction('editor.action.formatDocument').run(); return; }
      if(name === '__selectAll'){ var e6=window.editor; if(e6){ var m=e6.getModel(); if(m) e6.setSelection(m.getFullModelRange()); } return; }
      if(name === '__copy'){ copySel(); return; }
      if(name === '__cut'){ cutSel(); return; }
      if(name === '__paste'){ pasteFromClipboard(); return; }
      if(name === '__showExplorer'){ if(typeof openSidebar==='function') openSidebar(); if(typeof switchView==='function') switchView('explorer'); return; }
      if(name === '__showSearch'){ if(typeof openSidebar==='function') openSidebar(); if(typeof switchView==='function') switchView('search'); return; }
      if(name === '__showSettings'){ if(typeof openSidebar==='function') openSidebar(); if(typeof switchView==='function') switchView('settings'); return; }
      if(name === '__wrap'){ if(typeof updatePref==='function' && typeof prefs!=='undefined') updatePref('wordWrap', !prefs.wordWrap); return; }
      if(name === '__minimap'){ if(typeof updatePref==='function' && typeof prefs!=='undefined') updatePref('minimap', !prefs.minimap); return; }
      if(name === '__fontUp'){ if(typeof updatePref==='function' && typeof prefs!=='undefined') updatePref('fontSize', Math.min(28, prefs.fontSize+1)); return; }
      if(name === '__fontDown'){ if(typeof updatePref==='function' && typeof prefs!=='undefined') updatePref('fontSize', Math.max(10, prefs.fontSize-1)); return; }
      if(name === '__run'){ if(window.runActiveFile) window.runActiveFile(); else toast2('Run not ready'); return; }
      if(name === '__runConfig'){ if(window.openRunConfig) window.openRunConfig(); else toast2('Run config not ready'); return; }
      var fn = window[name];
      if(typeof fn === 'function') fn();
      else toast2('Not available: ' + name);
    } catch(err){
      console.error('[menu]', name, err);
      toast2('Error: ' + (err.message || err));
    }
  }

  window.ncsOpenMenu = function(event, name, btn){
    if(event){ event.stopPropagation(); event.preventDefault(); }
    var dd = document.getElementById('menuDropdown');
    var list = document.getElementById('menuDropdownList');
    if(!dd || !list){ toast2('Menu container missing'); return; }
    if(dd.dataset.openFor === name){ closeMenu(); return; }
    list.innerHTML = '';
    var items = MENUS[name] || [];
    for(var i=0;i<items.length;i++){
      var it = items[i];
      if(it.sep){ var sp=document.createElement('div'); sp.className='menu-sep'; list.appendChild(sp); continue; }
      var el = document.createElement('div');
      el.className = 'menu-entry';
      var inner = '<span>'+escHtml(it.label)+'</span>';
      if(it.key) inner += '<span class="m-key">'+escHtml(it.key)+'</span>';
      el.innerHTML = inner;
      (function(item, node){
        node.addEventListener('click', function(ev){
          ev.stopPropagation();
          closeMenu();
          setTimeout(function(){ runAction(item.action); }, 30);
        });
      })(it, el);
      list.appendChild(el);
    }
    var r = btn.getBoundingClientRect();
    dd.style.left = Math.max(6, Math.min(r.left, window.innerWidth - 260)) + 'px';
    dd.style.top = (r.bottom + 4) + 'px';
    dd.hidden = false;
    dd.dataset.openFor = name;
    var btns = document.querySelectorAll('.menu-item');
    for(var j=0;j<btns.length;j++) btns[j].classList.toggle('open', btns[j] === btn);
  };

  document.addEventListener('click', function(e){
    if(!e.target.closest('.menu-item') && !e.target.closest('#menuDropdown')) closeMenu();
  });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeMenu(); });

  /* ============ Selection bar ============ */
  var bar = null;
  function ensureBar(){
    if(bar && document.body.contains(bar)) return bar;
    bar = document.getElementById('selBar');
    if(bar) return bar;
    bar = document.createElement('div');
    bar.id = 'selBar';
    bar.className = 'sel-bar';
    bar.hidden = true;
    bar.innerHTML =
      '<button class="sel-btn" data-act="copy">Copy</button>' +
      '<button class="sel-btn" data-act="cut">Cut</button>' +
      '<button class="sel-btn" data-act="paste">Paste</button>' +
      '<button class="sel-btn" data-act="all">All</button>' +
      '<button class="sel-btn sel-close" data-act="close">X</button>';
    bar.addEventListener('click', function(e){
      var b = e.target.closest('.sel-btn'); if(!b) return;
      var a = b.dataset.act;
      if(a === 'copy') copySel();
      else if(a === 'cut') cutSel();
      else if(a === 'paste') pasteFromClipboard();
      else if(a === 'all'){ var ed=window.editor; if(ed){ var m=ed.getModel(); if(m) ed.setSelection(m.getFullModelRange()); } }
      else if(a === 'close') bar.hidden = true;
    });
    var wrap = document.querySelector('.editor-wrap');
    if(wrap) wrap.appendChild(bar);
    return bar;
  }

  function fallbackCopy(text){
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.top='0'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy'); toast2('Copied'); }
    catch(e){ toast2('Copy failed'); }
    document.body.removeChild(ta);
  }

  function copySel(){
    var ed = window.editor; if(!ed) return;
    var sel = ed.getSelection(); var m = ed.getModel(); if(!m) return;
    var text = m.getValueInRange(sel);
    if(!text){ toast2('Nothing selected'); return; }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){ toast2('Copied'); }, function(){ fallbackCopy(text); });
    } else fallbackCopy(text);
  }
  function cutSel(){
    var ed = window.editor; if(!ed) return;
    var sel = ed.getSelection(); var m = ed.getModel(); if(!m) return;
    var text = m.getValueInRange(sel);
    if(!text){ toast2('Nothing selected'); return; }
    var doCut = function(){ ed.executeEdits('cut', [{range:sel,text:''}]); ed.focus(); toast2('Cut'); };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(doCut, function(){ fallbackCopy(text); doCut(); });
    } else { fallbackCopy(text); doCut(); }
  }
  function pasteFromClipboard(){
    var ed = window.editor; if(!ed) return;
    if(!navigator.clipboard || !navigator.clipboard.readText){ toast2('Paste not supported'); return; }
    navigator.clipboard.readText().then(function(text){
      if(!text) return;
      var sel = ed.getSelection();
      ed.executeEdits('paste', [{range:sel, text:text}]);
      ed.focus();
    }, function(){ toast2('Paste blocked'); });
  }

  function updateSelBar(){
    var b = ensureBar();
    var ed = window.editor;
    if(!ed){ b.hidden = true; return; }
    var sel = ed.getSelection();
    if(!sel || sel.isEmpty()){ b.hidden = true; return; }
    b.hidden = false;
  }

  var tries = 0;
  var wait = setInterval(function(){
    tries++;
    var ed = window.editor;
    if(ed){
      clearInterval(wait);
      ed.onDidChangeCursorSelection(function(){ updateSelBar(); });
      ed.onDidFocusEditorText(function(){ updateSelBar(); });
      ed.onDidBlurEditorText(function(){ var b=ensureBar(); b.hidden=true; });
      return;
    }
    if(tries > 100) clearInterval(wait);
  }, 150);
})();


/* ============ NCS Run System (wasmoon) ============ */
(function(){
  var WASMOON_URL = 'https://cdn.jsdelivr.net/npm/wasmoon@1.16.0/dist/glue.js';
  var RUN_KEY = 'ncs.runconfigs.v1';
  var fengariPromise = null;
  var configs = [];
  try { configs = JSON.parse(localStorage.getItem(RUN_KEY) || '[]'); } catch(e){}

  function el(id){ return document.getElementById(id); }
  function saveConfigs(){ try{ localStorage.setItem(RUN_KEY, JSON.stringify(configs)); }catch(e){} }
  function ncsToast(msg){
    var t = el('toast'); if(!t) return;
    t.textContent = msg; t.hidden = false;
    t.style.animation='none'; void t.offsetWidth; t.style.animation='';
    clearTimeout(ncsToast._t);
    ncsToast._t = setTimeout(function(){ t.hidden=true; }, 1600);
  }

  function openTerminal(){
    var t = el('terminal'); if(!t) return;
    t.hidden = false;
    var ed = el('editor'); if(ed) ed.style.paddingBottom = '38vh';
  }
  function closeTerminal(){
    var t = el('terminal'); if(!t) return;
    t.hidden = true;
    var ed = el('editor'); if(ed) ed.style.paddingBottom = '';
  }
  function termWrite(text, cls){
    var b = el('terminalBody'); if(!b) return;
    var span = document.createElement('span');
    span.className = 't-line-' + (cls || 'out');
    span.textContent = text;
    b.appendChild(span);
    b.scrollTop = b.scrollHeight;
  }
  function termClear(){ var b = el('terminalBody'); if(b) b.innerHTML=''; }

  function loadFengari(){
    if(window.fengari && window.fengari.lua) return Promise.resolve();
    if(fengariPromise) return fengariPromise;
    fengariPromise = new Promise(function(resolve, reject){
      var paths = ['vendor/fengari-web.js','./vendor/fengari-web.js','https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.js'];
      var i = 0;
      function tryNext(){
        if(i >= paths.length){ reject(new Error('Could not load Lua runtime')); return; }
        var src = paths[i++];
        var s = document.createElement('script');
        s.src = src;
        s.onload = function(){
          if(window.fengari && window.fengari.lua) resolve();
          else tryNext();
        };
        s.onerror = function(){ tryNext(); };
        document.head.appendChild(s);
      }
      tryNext();
    });
    return fengariPromise;
  }

  function fmtLua(v){
    if(v === null || v === undefined) return String(v);
    if(typeof v === 'object'){
      try { return JSON.stringify(v); } catch(e){ return String(v); }
    }
    return String(v);
  }

  function runLua(src){
    return loadFengari().then(function(){
      var F = window.fengari;
      var lua = F.lua, lauxlib = F.lauxlib, lualib = F.lualib;
      var to_luastring = F.to_luastring, to_jsstring = F.to_jsstring;
      var L = lauxlib.luaL_newstate();
      lualib.luaL_openlibs(L);
      var printFn = function(L){
        var n = lua.lua_gettop(L);
        var parts = [];
        for(var i=1; i<=n; i++){
          if(lua.lua_isstring(L, i)) parts.push(to_jsstring(lua.lua_tostring(L, i)));
          else if(lua.lua_isnumber(L, i)) parts.push(String(lua.lua_tonumber(L, i)));
          else if(lua.lua_isboolean(L, i)) parts.push(lua.lua_toboolean(L, i) ? 'true' : 'false');
          else if(lua.lua_isnil(L, i)) parts.push('nil');
          else parts.push('<value>');
        }
        termWrite(parts.join('\t') + '\n');
        return 0;
      };
      (lua.lua_pushjsfunction || lua.lua_pushcfunction)(L, printFn);
      lua.lua_setglobal(L, to_luastring('print'));
      var status = lauxlib.luaL_loadstring(L, to_luastring(src));
      if(status !== lua.LUA_OK){
        var msg = to_jsstring(lua.lua_tostring(L, -1));
        lua.lua_close(L);
        throw new Error(msg);
      }
      var res = lua.lua_pcall(L, 0, lua.LUA_MULTRET, 0);
      if(res !== lua.LUA_OK){
        var msg2 = to_jsstring(lua.lua_tostring(L, -1));
        lua.lua_close(L);
        throw new Error(msg2);
      }
      lua.lua_close(L);
    });
  }

  function runJs(src){
    return new Promise(function(resolve){
      var workerSrc = [
        'self.console = {',
        '  log:   function(){ send("out", arguments); },',
        '  info:  function(){ send("out", arguments); },',
        '  warn:  function(){ send("err", arguments); },',
        '  error: function(){ send("err", arguments); }',
        '};',
        'function fmt(x){ try { return typeof x === "object" ? JSON.stringify(x) : String(x); } catch(e){ return String(x); } }',
        'function send(kind, args){',
        '  var arr = Array.prototype.slice.call(args).map(fmt);',
        '  self.postMessage({ t: kind, m: arr.join(" ") + "\\n" });',
        '}',
        'self.onmessage = function(e){',
        '  try { (new Function(e.data))(); self.postMessage({ t: "done" }); }',
        '  catch(err){ send("err", [err && err.message ? err.message : String(err)]); self.postMessage({ t: "done" }); }',
        '};'
      ].join('\n');
      var blob = new Blob([workerSrc], { type: 'application/javascript' });
      var url = URL.createObjectURL(blob);
      var w = new Worker(url);
      var done = false;
      function finish(){
        if(done) return; done = true;
        try { w.terminate(); } catch(e){}
        URL.revokeObjectURL(url);
        resolve();
      }
      w.onmessage = function(e){
        if(e.data.t === 'done'){ finish(); return; }
        termWrite(e.data.m, e.data.t);
      };
      w.onerror = function(e){
        termWrite('Worker error: ' + (e.message || 'unknown') + '\n', 'err');
        finish();
      };
      w.postMessage(src);
      setTimeout(finish, 30000);
    });
  }

  function runActiveFile(){
    if(!window.editor){ ncsToast('Editor not ready'); return; }
    var f = null;
    try {
      if(session && session.activeId){
        f = workspace.files.find(function(x){ return x.id === session.activeId; });
      }
    } catch(e){}
    if(!f){ ncsToast('No file open'); return; }
    var lang = f.lang || 'plaintext';
    openTerminal();
    termWrite('> ' + f.name + '\n', 'cmd');
    var t0 = performance.now();
    var p;
    if(lang === 'lua') p = runLua(f.content);
    else if(lang === 'javascript') p = runJs(f.content);
    else { termWrite('No runtime for "' + lang + '". Supported: .lua and .js\n', 'err'); return; }
    p.then(function(){
      termWrite('-- finished in ' + (performance.now() - t0).toFixed(1) + 'ms\n', 'info');
    }).catch(function(err){
      termWrite((err && err.message ? err.message : String(err)) + '\n', 'err');
    });
  }

  function populateRunEntry(){
    var sel = el('runCfgEntry'); if(!sel) return;
    sel.innerHTML = '<option value="">(active file)</option>';
    try {
      if(workspace){
        workspace.files.forEach(function(f){
          var o = document.createElement('option');
          o.value = f.id; o.textContent = f.name;
          sel.appendChild(o);
        });
      }
    } catch(e){}
  }
  function renderRunList(){
    var list = el('runList'); if(!list) return;
    list.innerHTML = '';
    var m = el('runConfigModal');
    configs.forEach(function(c){
      var item = document.createElement('div');
      item.className = 'run-list-item' + ((m && m.dataset.editing === c.id) ? ' active' : '');
      var nm = document.createElement('span'); nm.className = 'run-cfg-name'; nm.textContent = c.name || 'Untitled';
      var tag = document.createElement('span'); tag.className = 'run-cfg-tag'; tag.textContent = (c.runtime || 'lua').toUpperCase();
      item.appendChild(nm); item.appendChild(tag);
      item.addEventListener('click', function(){
        el('runCfgName').value = c.name || '';
        el('runCfgRuntime').value = c.runtime || 'lua';
        el('runCfgEntry').value = c.entry || '';
        el('runCfgArgs').value = c.args || '';
        m.dataset.editing = c.id;
        renderRunList();
      });
      list.appendChild(item);
    });
  }
  function openRunConfig(){
    var m = el('runConfigModal'); if(!m) return;
    populateRunEntry();
    renderRunList();
    var first = configs[0];
    if(first){
      el('runCfgName').value = first.name || '';
      el('runCfgRuntime').value = first.runtime || 'lua';
      el('runCfgEntry').value = first.entry || '';
      el('runCfgArgs').value = first.args || '';
      m.dataset.editing = first.id;
    } else {
      el('runCfgName').value = 'Run active file';
      el('runCfgRuntime').value = 'lua';
      el('runCfgEntry').value = '';
      el('runCfgArgs').value = '';
      delete m.dataset.editing;
    }
    m.hidden = false;
  }
  function saveRunConfig(){
    var m = el('runConfigModal'); if(!m) return;
    var cfg = {
      id: m.dataset.editing || ('rc_' + Math.random().toString(36).slice(2, 10)),
      name: (el('runCfgName').value || '').trim() || 'Untitled',
      runtime: el('runCfgRuntime').value || 'lua',
      entry: el('runCfgEntry').value || null,
      args: (el('runCfgArgs').value || '').trim()
    };
    var idx = -1;
    for(var i=0; i<configs.length; i++){ if(configs[i].id === cfg.id){ idx = i; break; } }
    if(idx >= 0) configs[idx] = cfg; else configs.push(cfg);
    saveConfigs();
    m.dataset.editing = cfg.id;
    renderRunList();
    ncsToast('Saved');
  }
  function deleteRunConfig(){
    var m = el('runConfigModal'); if(!m) return;
    var id = m.dataset.editing;
    if(!id){ ncsToast('Nothing selected'); return; }
    configs = configs.filter(function(c){ return c.id !== id; });
    saveConfigs();
    delete m.dataset.editing;
    openRunConfig();
    ncsToast('Deleted');
  }

  var btn;
  if((btn = el('clearTerm')))      btn.addEventListener('click', termClear);
  if((btn = el('closeTerm')))      btn.addEventListener('click', closeTerminal);
  if((btn = el('closeRunConfig'))) btn.addEventListener('click', function(){ el('runConfigModal').hidden = true; });
  if((btn = el('saveRunConfig')))  btn.addEventListener('click', saveRunConfig);
  if((btn = el('deleteRunCfg')))   btn.addEventListener('click', deleteRunConfig);
  var rm = el('runConfigModal');
  if(rm) rm.addEventListener('click', function(e){ if(e.target.id === 'runConfigModal') rm.hidden = true; });

  window.addEventListener('keydown', function(e){
    if(e.key === 'F5'){ e.preventDefault(); runActiveFile(); }
  });

  window.runActiveFile = runActiveFile;
  window.openRunConfig = openRunConfig;
  window.closeTerminal = closeTerminal;
})();


/* __NCS_NEWFILE_MODAL__ */
(function(){
  var LANG_EXT = {lua:'Lua',luau:'Lua (Luau)',js:'JavaScript',mjs:'JavaScript',ts:'TypeScript',py:'Python',html:'HTML',htm:'HTML',css:'CSS',json:'JSON',md:'Markdown',sh:'Shell',bash:'Shell',yml:'YAML',yaml:'YAML',xml:'XML',txt:'Plain Text'};
  var LANG_CODE = {lua:'lua',luau:'lua',js:'javascript',mjs:'javascript',ts:'typescript',py:'python',html:'html',htm:'html',css:'css',json:'json',md:'markdown',sh:'shell',bash:'shell',yml:'yaml',yaml:'yaml',xml:'xml',txt:'plaintext'};

  function el(id){ return document.getElementById(id); }
  function toast2(m){
    var t = el('toast'); if(!t) return;
    t.textContent = m; t.hidden = false;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toast2._t);
    toast2._t = setTimeout(function(){ t.hidden = true; }, 1600);
  }

  function updateLangHint(){
    var name = el('nfName').value || '';
    var ext = name.indexOf('.') >= 0 ? name.split('.').pop().toLowerCase() : '';
    el('nfLang').textContent = LANG_EXT[ext] || 'Plain Text';
  }

  function openModal(prefill){
    var m = el('newFileModal'); if(!m) return;
    el('nfName').value = prefill || 'untitled.lua';
    updateLangHint();
    m.hidden = false;
    setTimeout(function(){
      var i = el('nfName'); i.focus();
      try{ i.setSelectionRange(0, i.value.lastIndexOf('.') > 0 ? i.value.lastIndexOf('.') : i.value.length); }catch(e){}
    }, 60);
  }
  function closeModal(){ var m = el('newFileModal'); if(m) m.hidden = true; }

  function createFile(){
    var name = (el('nfName').value || '').trim();
    if(!name){ toast2('Enter a file name'); return; }
    try{
      var id = 'f_' + Math.random().toString(36).slice(2, 10);
      var ext = name.indexOf('.') >= 0 ? name.split('.').pop().toLowerCase() : '';
      var lang = LANG_CODE[ext] || 'plaintext';
      workspace.files.push({id:id, name:name, content:'', lang:lang});
      if(typeof saveWorkspace === 'function') saveWorkspace();
      if(typeof activate === 'function') activate(id);
      closeModal();
      toast2('Created ' + name);
    } catch(err){
      toast2('Error: ' + (err.message || err));
    }
  }

  var nameInput = el('nfName');
  if(nameInput){
    nameInput.addEventListener('input', updateLangHint);
    nameInput.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); createFile(); }
      if(e.key === 'Escape'){ e.preventDefault(); closeModal(); }
    });
  }
  var btn;
  if((btn = el('closeNewFileModal')))  btn.addEventListener('click', closeModal);
  if((btn = el('cancelNewFileModal'))) btn.addEventListener('click', closeModal);
  if((btn = el('confirmNewFileModal'))) btn.addEventListener('click', createFile);
  var m = el('newFileModal');
  if(m) m.addEventListener('click', function(e){ if(e.target.id === 'newFileModal') closeModal(); });

  /* Override the global newFile so every menu / palette entry uses the modal */
  window.newFile = function(){ openModal(); };
})();
