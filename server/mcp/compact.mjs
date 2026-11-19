// Token-lean text for tool results. A ui_tree element as JSON is ~70 tokens (bounds, class, package, 6 flags...); as one line it is ~12.
// Lives in server/mcp/ because the MCP script runs outside the app archive and may only import files next to it.
export function compactUiTree(r) {
  if (!r || !r.ok || !Array.isArray(r.elements)) return null;
  const lines = r.elements.map((e) => {
    const label = String(e.text || e.desc || '').replace(/\s+/g, ' ').slice(0, 60);
    const flags = [e.clickable && 'tap', e.scrollable && 'scroll', e.checked && 'checked', e.enabled === false && 'disabled', e.focused && 'focused'].filter(Boolean).join(',');
    return `${e.i} ${label ? JSON.stringify(label) : ''}${e.id ? ' #' + e.id : ''}${!label && !e.id ? ' ' + (e.cls || '') : ''} @${e.cx},${e.cy}${flags ? ' [' + flags + ']' : ''}`;
  });
  return `${r.foreground || 'screen'}: ${r.count} elements (index "label" #id @centerX,centerY [flags]; tap with tap_element by label, or tap x,y)\n${lines.join('\n')}${r.hint ? '\nhint: ' + r.hint : ''}`;
}
