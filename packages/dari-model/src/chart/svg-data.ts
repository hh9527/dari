import type {Row} from './shared.ts';

import {csvCells} from '@local/dari-core';

export function csv(rows:Row[],columns=[...new Set(rows.flatMap(row=>Object.keys(row)))]):string {
  return csvCells([columns,...rows.map(row=>columns.map(key=>row[key]))]);
}

/** Non-rendering chart inputs for reading Answer figures; no provenance or source code. */
export function embedFigureCsv(svg:string,data:{rows:Row[];nodeRows?:Row[];spec?:unknown}):string {
  const block=(id:string,rows:Row[])=>`<metadata id="${id}" data-format="csv">\n${csv(rows).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}\n</metadata>`;
  const spec=data.spec===undefined?'':`<metadata id="dari-spec" data-format="json">${JSON.stringify(data.spec).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</metadata>`;
  const metadata=spec+block('dari-data',data.rows)+(data.nodeRows?block('dari-nodes',data.nodeRows):'');
  return svg.replace(/<svg[^>]*>/,open=>open+metadata);
}
