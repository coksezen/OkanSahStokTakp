from pathlib import Path

app_path = Path('src/App.jsx')
app = app_path.read_text(encoding='utf-8')
old = """  useEffect(()=>{\n    document.documentElement.classList.toggle('dark',darkMode)\n    localStorage.setItem('okan-sah-theme',darkMode ? 'dark' : 'light')\n"""
new = """  useEffect(()=>{\n    // index.html only uses startup-dark while React is loading.\n    // Once the app is mounted, the selected app theme must be the single source of truth.\n    document.documentElement.classList.remove('startup-dark')\n    document.documentElement.classList.toggle('dark',darkMode)\n    localStorage.setItem('okan-sah-theme',darkMode ? 'dark' : 'light')\n"""
if old not in app:
    raise SystemExit('theme effect target not found')
app = app.replace(old, new, 1)
app_path.write_text(app, encoding='utf-8')

sw_path = Path('public/sw.js')
sw = sw_path.read_text(encoding='utf-8')
sw = sw.replace("const CACHE = 'okan-sah-stok-v6'", "const CACHE = 'okan-sah-stok-v7'", 1)
sw_path.write_text(sw, encoding='utf-8')

print('Light mode startup theme fixed and PWA cache bumped')
