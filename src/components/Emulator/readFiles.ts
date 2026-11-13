import type { BriefFile } from './TestBrief';

// Reads uploaded test documents: text formats directly, .docx through the server (it unzips it).
export async function readBriefFiles(list: FileList | File[] | null, kind: 'cases' | 'docs', onError: (msg: string) => void): Promise<BriefFile[]> {
  const out: BriefFile[] = [];
  for (const f of Array.from(list || []).slice(0, 10)) {
    try {
      if (/\.(docx|pdf|doc|xlsx|pptx)$/i.test(f.name)) {
        if (f.size > 6_000_000) throw new Error('is too large (max 6 MB)');
        const bytes = new Uint8Array(await f.arrayBuffer()); let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const j = await (await fetch('/api/agent/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: f.name, base64: btoa(bin) }) })).json();
        if (!j.success) throw new Error(j.message || 'could not be read');
        out.push({ name: f.name, text: j.text, kind });
      } else {
        if (f.size > 300_000) throw new Error('is too large (max 300 KB). Paste the relevant part instead');
        out.push({ name: f.name, text: await f.text(), kind });
      }
    } catch (e: any) { onError(f.name + ' ' + (e.message || 'could not be read')); }
  }
  return out;
}
