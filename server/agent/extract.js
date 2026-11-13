// Text extraction for uploaded test documents. Text files are read as is; .docx is unzipped (zlib) and its paragraphs are returned.
import zlib from 'zlib';

function unzipEntry(buf, wanted) {
  // end of central directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('Not a valid .docx file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const lh = local; const lnLen = buf.readUInt16LE(lh + 26), leLen = buf.readUInt16LE(lh + 28);
      const data = buf.subarray(lh + 30 + lnLen + leLen, lh + 30 + lnLen + leLen + csize);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('word/document.xml not found in the file');
}

const ent = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
function docxText(buf) {
  const xml = unzipEntry(buf, 'word/document.xml').toString('utf8');
  return xml
    .replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n').replace(/<\/w:tc>/g, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, m => ent[m])
    .replace(/\n{3,}/g, '\n\n').trim();
}

export function extractText(name, base64) {
  const buf = Buffer.from(String(base64 || ''), 'base64');
  if (buf.length > 6_000_000) throw new Error('File is too large (max 6 MB).');
  const lower = String(name).toLowerCase();
  if (lower.endsWith('.docx')) return docxText(buf);
  if (lower.endsWith('.pdf') || lower.endsWith('.doc') || lower.endsWith('.xlsx') || lower.endsWith('.pptx')) throw new Error('This format cannot be read here yet. Save it as .docx, .md or .txt, or paste the text.');
  return buf.toString('utf8');
}
