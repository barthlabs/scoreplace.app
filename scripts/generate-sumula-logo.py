#!/usr/bin/env python3
"""Embed the exact app-header SVG as a PDF vector Form XObject."""
import base64
import hashlib
import io
import re
import subprocess
import tempfile
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
html_path = ROOT / 'index.html'
js_path = ROOT / 'js/views/tournament-sumula.js'
html = html_path.read_text()
match = re.search(r'<svg width="48" height="48" viewBox="0 0 24 24".*?</svg>', html, re.S)
if not match:
    raise SystemExit('Canonical SVG not found in the app header')
svg = match.group(0).encode()
with tempfile.NamedTemporaryFile(suffix='.svg') as source:
    source.write(svg)
    source.flush()
    pdf = subprocess.check_output(['rsvg-convert', '-f', 'pdf', source.name])
page = PdfReader(io.BytesIO(pdf)).pages[0]
if list(page.mediabox) != [0, 0, 36, 36]:
    raise SystemExit(f'Unexpected vector box: {page.mediabox}')
if set(page['/Resources'].keys()) != {'/ExtGState'}:
    raise SystemExit('SVG PDF gained additional resources; update the XObject writer')
vector = page.get_contents().get_data()
encoded = base64.b64encode(vector).decode('ascii')
lines = "\n".join("    '" + encoded[i:i+100] + "' +" for i in range(0, len(encoded), 100))
lines = lines[:-2] + ';'
replacement = (
    '  // BEGIN OFFICIAL PDF LOGO\n'
    "  var officialLogoSourceSha256 = '" + hashlib.sha256(svg).hexdigest() + "';\n"
    '  var officialLogoVector =\n' + lines + '\n'
    '  // END OFFICIAL PDF LOGO'
)
source = js_path.read_text()
source, count = re.subn(
    r'  // BEGIN OFFICIAL PDF LOGO\n.*?  // END OFFICIAL PDF LOGO',
    replacement, source, flags=re.S,
)
if count != 1:
    raise SystemExit('Expected one logo block in tournament-sumula.js')
js_path.write_text(source)
print('Embedded app-header SVG as PDF vector', hashlib.sha256(svg).hexdigest())
