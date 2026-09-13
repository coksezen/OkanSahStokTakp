from pathlib import Path

app_path = Path('src/App.jsx')
app = app_path.read_text(encoding='utf-8')

old = """      {needs
        .filter(n=>n.branch===selectedBranch)
        .map(n=>
"""
new = """      {needs
        .filter(n=>n.branch===selectedBranch)
        .sort((a,b)=>Number(Boolean(a.completed))-Number(Boolean(b.completed)))
        .map(n=>
"""

if old not in app:
    raise SystemExit('Needs list target not found')

app = app.replace(old, new, 1)
app_path.write_text(app, encoding='utf-8')

sw_path = Path('public/sw.js')
sw = sw_path.read_text(encoding='utf-8')
sw = sw.replace("const CACHE = 'okan-sah-stok-v6'", "const CACHE = 'okan-sah-stok-v7'", 1)
sw_path.write_text(sw, encoding='utf-8')

print('Completed needs now sort to bottom')
