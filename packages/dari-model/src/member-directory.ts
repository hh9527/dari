export type DirectoryMember = {kind: 'dimension' | 'measure'; symbol: string; type: string};

export function memberDirectory(dataset: string, members: readonly DirectoryMember[], level: number, matched = false, notes: readonly string[] = []): string[] {
  if (!members.length) return [];
  const heading = '#'.repeat(level);
  const lines = [heading + ' `' + dataset + '::*`' + (matched ? ' · 命中成员' : ''), '',
    '将 `*` 替换为成员名即可传给 info，例如 `' + dataset + '::' + members[0].symbol + '`。'];
  if (notes.length) lines.push('', ...notes);
  for (const kind of ['dimension', 'measure'] as const) {
    const entries = members.filter(member => member.kind === kind).sort((a, b) => a.symbol.localeCompare(b.symbol));
    if (!entries.length) continue;
    lines.push('', heading + '# ' + kind + 's', '', ...entries.map(member => '- `' + member.symbol + ': ' + member.type + '`'));
  }
  return lines;
}
