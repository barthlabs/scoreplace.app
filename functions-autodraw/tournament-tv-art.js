'use strict';
const LIMIT = 5 * 1024 * 1024;
function readArt(dataUrl, HttpsError) {
  const invalid = () => new HttpsError('invalid-argument', 'Envie JPG, PNG, WebP ou GIF com menos de 5 MB.');
  if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(LIMIT / 3) * 4 + 30) throw invalid();
  const match = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw invalid();
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length >= LIMIT || bytes.toString('base64') !== match[2]) throw invalid();
  const signature = bytes.subarray(0, 12);
  const valid = {
    jpg:signature.subarray(0, 3).equals(Buffer.from([255,216,255])),
    png:signature.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    gif:['GIF87a','GIF89a'].includes(signature.toString('latin1', 0, 6)),
    webp:signature.toString('latin1', 0, 4) === 'RIFF' && signature.toString('latin1', 8, 12) === 'WEBP'
  };
  if (!valid[ext]) throw invalid();
  return { mime:'image/' + match[1], bytes, ext };
}
module.exports = { readArt };
