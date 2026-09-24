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
    contextmenu:true,quickSuggestions:false,suggestOnTriggerCharacters:false,
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
  editor.onDidChangeCursorPosition(e=>{$('#sbPos').textContent='Ln '+e.position.lineNumber+', Col '+e.position.column;});

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


/* ============ RUN SYSTEM ============ */
/* __RUN_SYSTEM__ */
(function(){
  const RUN_KEY='ncs.runcfg.v1';
  const FENGARI_CDN='https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.js';
  const $s=s=>document.querySelector(s);
  const uidRun=()=>'rc_'+Math.random().toString(36).slice(2,10);

  let runConfigs=[];
  try{runConfigs=JSON.parse(localStorage.getItem(RUN_KEY)||'[]');}catch{}
  const saveRun=()=>{try{localStorage.setItem(RUN_KEY,JSON.stringify(runConfigs));}catch{}};
  let fengariLoading=null;

  function loadFengari(){
    if(window.fengari)return Promise.resolve();
    if(fengariLoading)return fengariLoading;
    fengariLoading=new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src=FENGARI_CDN;
      s.onload=()=>res();
      s.onerror=()=>rej(new Error('fengari failed to load'));
      document.head.appendChild(s);
    });
    return fengariLoading;
  }

  function openTerm(){
    const t=$s('#terminal');if(!t)return;
    t.hidden=false;
    $s('#editor').style.paddingBottom='38vh';
  }
  function closeTerm(){
    const t=$s('#terminal');if(!t)return;
    t.hidden=true;
    $s('#editor').style.paddingBottom='';
  }
  function termWrite(text,cls){
    const b=$s('#terminalBody');if(!b)return;
    const sp=document.createElement('span');
    sp.className='t-line-'+(cls||'out');
    sp.textContent=text;
    b.appendChild(sp);
    b.scrollTop=b.scrollHeight;
  }
  function termClear(){const b=$s('#terminalBody');if(b)b.innerHTML='';}

  async function runLua(src){
    await loadFengari();
    const fg=window.fengari;
    const lua=fg.lua,lauxlib=fg.lauxlib,lualib=fg.lualib;
    const L=lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);

    const printFn=function(L){
      const n=lua.lua_gettop(L);
      const parts=[];
      for(let i=1;i<=n;i++){
        if(lua.lua_isstring(L,i))parts.push(fg.to_jsstring(lua.lua_tostring(L,i)));
        else if(lua.lua_isnumber(L,i))parts.push(String(lua.lua_tonumber(L,i)));
        else if(lua.lua_isboolean(L,i))parts.push(lua.lua_toboolean(L,i)?'true':'false');
        else if(lua.lua_isnil(L,i))parts.push('nil');
        else parts.push('?');
      }
      termWrite(parts.join('	')+'
');
      return 0;
    };
    (lua.lua_pushjsfunction||lua.lua_pushcfunction)(L,printFn);
    lua.lua_setglobal(L,fg.to_luastring('print'));

    // tostring override so string() concat works
    const tstrFn=function(L){
      const n=lua.lua_gettop(L);
      const v=lua.lua_toboolean(L,n);
      lua.lua_pushstring(L,fg.to_luastring(String(v)));
      return 1;
    };

    const status=lauxlib.luaL_loadstring(L,fg.to_luastring(src));
    if(status!==lua.LUA_OK){
      const msg=fg.to_jsstring(lua.lua_tostring(L,-1));
      lua.lua_close(L);
      throw new Error(msg);
    }
    const res=lua.lua_pcall(L,0,lua.LUA_MULTRET,0);
    if(res!==lua.LUA_OK){
      const msg=fg.to_jsstring(lua.lua_tostring(L,-1));
      lua.lua_close(L);
      throw new Error(msg);
    }
    lua.lua_close(L);
  }

  function runJavaScript(src){
    return new Promise(resolve=>{
      const code=[
        'self.console={',
        '  log:function(){self.postMessage({t:"out",m:Array.prototype.slice.call(arguments).map(fmt).join(" ")+"\\n"});},',
        '  error:function(){self.postMessage({t:"err",m:Array.prototype.slice.call(arguments).map(fmt).join(" ")+"\\n"});},',
        '  warn:function(){self.postMessage({t:"err",m:Array.prototype.slice.call(arguments).map(fmt).join(" ")+"\\n"});},',
        '  info:function(){self.postMessage({t:"out",m:Array.prototype.slice.call(arguments).map(fmt).join(" ")+"\\n"});}',
        '};',
        'function fmt(x){try{return typeof x==="object"?JSON.stringify(x):String(x);}catch(e){return String(x);}}',
        'self.onmessage=function(e){',
        '  try{(new Function(e.data))();self.postMessage({t:"done"});}',
        '  catch(err){self.postMessage({t:"err",m:(err&&err.message?err.message:String(err))+"\\n"});self.postMessage({t:"done"});}',
        '};'
      ].join('
');
      const blob=new Blob([code],{type:'application/javascript'});
      const url=URL.createObjectURL(blob);
      const w=new Worker(url);
      let done=false;
      const finish=()=>{if(done)return;done=true;try{w.terminate();}catch{}URL.revokeObjectURL(url);resolve();};
      w.onmessage=function(e){
        if(e.data.t==='done'){finish();return;}
        termWrite(e.data.m,e.data.t);
      };
      w.onerror=function(e){termWrite('Worker error: '+e.message+'
','err');finish();};
      w.postMessage(src);
      setTimeout(finish,30000);
    });
  }

  async function runActiveFile(){
    if(!window.session||!session.activeId){toast('No file open');return;}
    const f=workspace.files.find(x=>x.id===session.activeId);
    if(!f){toast('No file open');return;}
    const lang=f.lang||'plaintext';
    const cfg=runConfigs.find(c=>c.entry===f.id)||runConfigs.find(c=>c.runtime===lang);

    openTerm();
    termWrite('> '+f.name+(cfg&&cfg.args?' '+cfg.args:'')+'
','cmd');
    const t0=performance.now();
    try{
      if(lang==='lua')await runLua(f.content);
      else if(lang==='javascript')await runJavaScript(f.content);
      else termWrite('No runtime configured for "'+lang+'". Tap Run → Configure Run…
','err');
    }catch(e){
      termWrite((e&&e.message?e.message:String(e))+'
','err');
    }
    termWrite('— finished in '+((performance.now()-t0)/1000).toFixed(3)+'s
','info');
  }

  function populateRunEntry(){
    const sel=$s('#runCfgEntry');if(!sel)return;
    sel.innerHTML='<option value="">(active file)</option>';
    for(const f of workspace.files){
      const o=document.createElement('option');
      o.value=f.id;o.textContent=f.name;
      sel.appendChild(o);
    }
  }
  function renderRunList(){
    const el=$s('#runList');if(!el)return;
    el.innerHTML='';
    for(const c of runConfigs){
      const item=document.createElement('div');
      item.className='run-list-item'+(($s('#runConfigModal').dataset.editing===c.id)?' active':'');
      item.innerHTML='<span class="run-cfg-name">'+String(c.name||'Untitled').replace(/[<>&]/g,'')+'</span><span class="run-cfg-tag">'+String(c.runtime||'lua').toUpperCase()+'</span>';
      item.addEventListener('click',()=>{
        $s('#runCfgName').value=c.name||'';
        $s('#runCfgRuntime').value=c.runtime||'lua';
        $s('#runCfgEntry').value=c.entry||'';
        $s('#runCfgArgs').value=c.args||'';
        $s('#runConfigModal').dataset.editing=c.id;
        renderRunList();
      });
      el.appendChild(item);
    }
  }
  function openRunConfig(){
    populateRunEntry();
    renderRunList();
    const modal=$s('#runConfigModal');
    const first=runConfigs[0];
    if(first){
      $s('#runCfgName').value=first.name||'';
      $s('#runCfgRuntime').value=first.runtime||'lua';
      $s('#runCfgEntry').value=first.entry||'';
      $s('#runCfgArgs').value=first.args||'';
      modal.dataset.editing=first.id;
    }else{
      $s('#runCfgName').value='Run active file';
      $s('#runCfgRuntime').value='lua';
      $s('#runCfgEntry').value='';
      $s('#runCfgArgs').value='';
      delete modal.dataset.editing;
    }
    modal.hidden=false;
  }
  function saveRunConfig(){
    const modal=$s('#runConfigModal');
    const cfg={
      id:modal.dataset.editing||uidRun(),
      name:($s('#runCfgName').value||'').trim()||'Untitled',
      runtime:$s('#runCfgRuntime').value,
      entry:$s('#runCfgEntry').value||null,
      args:($s('#runCfgArgs').value||'').trim()
    };
    const i=runConfigs.findIndex(c=>c.id===cfg.id);
    if(i>=0)runConfigs[i]=cfg;else runConfigs.push(cfg);
    saveRun();
    modal.dataset.editing=cfg.id;
    renderRunList();
    toast('Saved');
  }
  function deleteRunConfig(){
    const modal=$s('#runConfigModal');
    const id=modal.dataset.editing;
    if(!id){toast('Nothing selected');return;}
    runConfigs=runConfigs.filter(c=>c.id!==id);
    saveRun();
    delete modal.dataset.editing;
    openRunConfig();
    toast('Deleted');
  }

  /* Hook the run menu at open time */
  const origOpen=window.openTopMenu;
  window.openTopMenu=function(name,anchor){
    if(name==='run'){
      const items=[
        {label:'Run Active File',key:'F5',run:runActiveFile},
        {sep:true},
        {label:'Configure Run…',run:openRunConfig}
      ];
      for(const c of runConfigs){
        const nm=c.name||'Untitled';
        items.push({label:'  '+nm,run:()=>{
          if(c.entry){
            const f=workspace.files.find(x=>x.id===c.entry);
            if(!f){toast('Entry file missing');return;}
            if(session.activeId!==f.id)activate(f.id);
            setTimeout(runActiveFile,120);
          }else runActiveFile();
        }});
      }
      window.MENUS.run=items;
    }
    return origOpen(name,anchor);
  };

  /* Wire terminal + modal controls */
  const clearBtn=$s('#clearTerm');if(clearBtn)clearBtn.addEventListener('click',termClear);
  const closeBtn=$s('#closeTerm');if(closeBtn)closeBtn.addEventListener('click',closeTerm);
  const c1=$s('#closeRunConfig');if(c1)c1.addEventListener('click',()=>{$s('#runConfigModal').hidden=true;});
  const c2=$s('#saveRunConfig');if(c2)c2.addEventListener('click',saveRunConfig);
  const c3=$s('#deleteRunCfg');if(c3)c3.addEventListener('click',deleteRunConfig);
  const modal=$s('#runConfigModal');
  if(modal)modal.addEventListener('click',e=>{if(e.target.id==='runConfigModal')modal.hidden=true;});

  /* F5 shortcut */
  window.addEventListener('keydown',e=>{
    if(e.key==='F5'){e.preventDefault();runActiveFile();}
  });

  /* Expose globally so menus can call it */
  window.runActiveFile=runActiveFile;
  window.openRunConfig=openRunConfig;
  window.closeTerminal=closeTerm;

  /* Also patch Run menu item that palette refers to */
  setTimeout(()=>{ if(window.MENUS) window.MENUS.run=window.MENUS.run||[]; },0);
})();


/* ============ Robust init: menu + selection bar ============ */
(function initMenuAndSelection(){
  function wireMenuButtons(){
    var buttons=document.querySelectorAll(".menu-item");
    if(!buttons.length){setTimeout(wireMenuButtons,200);return;}
    for(var i=0;i<buttons.length;i++){
      (function(btn){
        if(btn.dataset.ncsWired==="1")return;
        btn.dataset.ncsWired="1";
        btn.addEventListener("click",function(e){
          e.stopPropagation();
          window.toggleTopMenu(btn.dataset.menu,btn);
        });
      })(buttons[i]);
    }
  }
  wireMenuButtons();

  document.addEventListener("click",function(e){
    if(!e.target.closest(".menu-item")&&!e.target.closest("#menuDropdown")){
      window.closeTopMenu();
    }
  });
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape")window.closeTopMenu();
  });
  window.addEventListener("resize",function(){window.closeTopMenu();});

  var wait=setInterval(function(){
    if(typeof editor!=="undefined"&&editor){
      clearInterval(wait);
      editor.onDidChangeCursorSelection(function(){updateSelectionBar();});
      editor.onDidFocusEditorText(function(){updateSelectionBar();});
      editor.onDidBlurEditorText(function(){var b=document.querySelector("#selBar");if(b)b.hidden=true;});
    }
  },150);
})();
