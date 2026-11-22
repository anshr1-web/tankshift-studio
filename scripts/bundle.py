"""Rebuild the portable offline demo from dist sources."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
dist = root / 'dist'
html = (dist / 'index.html').read_text()
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + (dist / 'style.css').read_text() + '</style>')
for name in ['model.js', 'engine.js', 'ui.js']:
    html = html.replace(f'<script src="{name}"></script>', '<script>' + (dist / name).read_text() + '</script>')
(root / 'START-HERE.html').write_text(html)
print('Offline demo rebuilt.')
