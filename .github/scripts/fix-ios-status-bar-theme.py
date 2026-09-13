from pathlib import Path

app_path = Path('src/App.jsx')
app = app_path.read_text(encoding='utf-8')

old = """  const [session,setSession]=useState(null), [loading,setLoading]=useState(true)\n  const [showSplash,setShowSplash]=useState(true)\n"""
new = """  const [session,setSession]=useState(null), [loading,setLoading]=useState(true)\n  const [showSplash,setShowSplash]=useState(()=>{\n    const skip=sessionStorage.getItem('okan-sah-skip-splash')==='1'\n    if(skip) sessionStorage.removeItem('okan-sah-skip-splash')\n    return !skip\n  })\n"""
if old not in app:
    raise SystemExit('showSplash initializer target not found')
app = app.replace(old, new, 1)

old = """  const [quickScanAfterSave,setQuickScanAfterSave]=useState(false)\n  const [tab,setTab]=useState(new URLSearchParams(location.search).get('tab') || 'home')\n"""
new = """  const [quickScanAfterSave,setQuickScanAfterSave]=useState(false)\n  const [tab,setTab]=useState(()=>{\n    const returnTab=sessionStorage.getItem('okan-sah-theme-return-tab')\n    if(returnTab){\n      sessionStorage.removeItem('okan-sah-theme-return-tab')\n      return returnTab\n    }\n    return new URLSearchParams(location.search).get('tab') || 'home'\n  })\n"""
if old not in app:
    raise SystemExit('tab initializer target not found')
app = app.replace(old, new, 1)

old = """  useEffect(()=>{\n    // index.html only uses startup-dark while React is loading.\n    // Once the app is mounted, the selected app theme must be the single source of truth.\n    document.documentElement.classList.remove('startup-dark')\n    document.documentElement.classList.toggle('dark',darkMode)\n    localStorage.setItem('okan-sah-theme',darkMode ? 'dark' : 'light')\n\n    const themeMeta=document.querySelector('meta[name=\"theme-color\"]')\n    if(themeMeta){\n      themeMeta.setAttribute('content',darkMode ? '#080d18' : '#f8fafc')\n    }\n  },[darkMode])\n"""
new = """  useEffect(()=>{\n    // index.html only uses startup-dark while React is loading.\n    // Once the app is mounted, the selected app theme must be the single source of truth.\n    document.documentElement.classList.remove('startup-dark')\n    document.documentElement.classList.toggle('dark',darkMode)\n    document.documentElement.style.colorScheme=darkMode ? 'dark' : 'light'\n    localStorage.setItem('okan-sah-theme',darkMode ? 'dark' : 'light')\n\n    const themeMeta=document.querySelector('meta[name=\"theme-color\"]')\n    if(themeMeta){\n      themeMeta.setAttribute('content',darkMode ? '#080d18' : '#f8fafc')\n    }\n\n    const statusMeta=document.querySelector('meta[name=\"apple-mobile-web-app-status-bar-style\"]')\n    if(statusMeta){\n      statusMeta.setAttribute('content',darkMode ? 'black' : 'default')\n    }\n  },[darkMode])\n\n  function toggleTheme(){\n    const next=!darkMode\n    localStorage.setItem('okan-sah-theme',next ? 'dark' : 'light')\n    setDarkMode(next)\n\n    // iOS ana-ekran PWA'si status bar rengini çalışma sırasında yenilemiyor.\n    // Seçimi kaydedip görünmez sayılabilecek tek seferlik yenilemeyle iOS'a yeni modu okutuyoruz.\n    const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent)\n    const isStandalone=window.navigator.standalone===true || window.matchMedia?.('(display-mode: standalone)').matches\n\n    if(isIOS && isStandalone){\n      sessionStorage.setItem('okan-sah-skip-splash','1')\n      sessionStorage.setItem('okan-sah-theme-return-tab',tab)\n      setTimeout(()=>window.location.reload(),40)\n    }\n  }\n"""
if old not in app:
    raise SystemExit('theme effect target not found')
app = app.replace(old, new, 1)

old = "onClick={()=>setDarkMode(v=>!v)}"
new = "onClick={toggleTheme}"
if old not in app:
    raise SystemExit('theme toggle button target not found')
app = app.replace(old, new, 1)

app_path.write_text(app, encoding='utf-8')

index_path = Path('index.html')
index = index_path.read_text(encoding='utf-8')
old = """      document.documentElement.classList.toggle('startup-dark',dark)\n      const meta=document.querySelector('meta[name=\"theme-color\"]')\n      if(meta) meta.setAttribute('content',dark ? '#080d18' : '#f8fafc')\n"""
new = """      document.documentElement.classList.toggle('startup-dark',dark)\n      document.documentElement.style.colorScheme=dark ? 'dark' : 'light'\n      const meta=document.querySelector('meta[name=\"theme-color\"]')\n      if(meta) meta.setAttribute('content',dark ? '#080d18' : '#f8fafc')\n      const statusMeta=document.querySelector('meta[name=\"apple-mobile-web-app-status-bar-style\"]')\n      if(statusMeta) statusMeta.setAttribute('content',dark ? 'black' : 'default')\n"""
if old not in index:
    raise SystemExit('index startup theme target not found')
index = index.replace(old, new, 1)
index_path.write_text(index, encoding='utf-8')

sw_path = Path('public/sw.js')
sw = sw_path.read_text(encoding='utf-8')
sw = sw.replace("const CACHE = 'okan-sah-stok-v7'", "const CACHE = 'okan-sah-stok-v8'", 1)
sw_path.write_text(sw, encoding='utf-8')

print('iOS status bar theme sync patched')
