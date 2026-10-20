#!/usr/bin/env python3
"""Embed the canonical Scoreplace SVG in the local PDF generator unchanged."""
import base64
import hashlib
import io
import re
import subprocess
import zlib
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
svg_path = ROOT / 'icons/logo-podium.svg'
js_path = ROOT / 'js/views/tournament-sumula.js'
svg = svg_path.read_bytes()
png = subprocess.check_output(['rsvg-convert', '-w', '320', '-h', '240', str(svg_path)])
rgba = Image.open(io.BytesIO(png)).convert('RGBA')
background = Image.new('RGB', rgba.size, (18, 34, 56))
background.paste(rgba, mask=rgba.getchannel('A'))
compressed = zlib.compress(background.tobytes(), level=9)
encoded = base64.b64encode(compressed).decode('ascii')
lines = "\n".join("    '" + encoded[i:i+100] + "' +" for i in range(0, len(encoded), 100))
lines = lines[:-2] + ';'
replacement = (
    '  // BEGIN OFFICIAL PDF LOGO\n'
    '  var officialLogoWidth = 320, officialLogoHeight = 240;\n'
    "  var officialLogoSourceSha256 = '" + hashlib.sha256(svg).hexdigest() + "';\n"
    '  var officialLogoRgbZ =\n' + lines + '\n'
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
print('Embedded', svg_path.name, hashlib.sha256(svg).hexdigest(), 'into', js_path.name)
