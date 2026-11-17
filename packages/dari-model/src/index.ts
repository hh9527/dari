// 模型能力的宿主无关层：DARI 树的呈现、时间与数值格式、远程查询桥接。
export { buildOption, CHART_WIDTH, plotHeight } from './chart/option.ts';
export { renderEchartsSvg } from './chart/echarts.ts';
export { renderMarkdown } from './chart/markdown.ts';
export { dariHost } from './dari-host.ts';
export { createIntegration } from './dari-integration.ts';
export { readDariSource } from './source-file.ts';
export { ENABLE_OKS_SEARCH } from './features.ts';
export { isRecord, isArray } from './util.ts';
