// Workspace-scoped ontology: domain summary, fixed knowledge cards and DARI analysis.
// Vocabulary assistance and standalone help manuals complement model facts.

export { createProjector } from '@local/dari-model';
export type { JsonValue, ProjectRule, Projector } from '@local/dari-model';
export { buildOption, CHART_WIDTH, plotHeight } from '@local/dari-model';
export { renderEchartsSvg } from '@local/dari-model';
export { renderMarkdown } from '@local/dari-model';

import { createKnowledge } from '@local/dari-model';
import { installWorkMethods } from './work-methods.ts';
import { createTimeContext } from '@local/dari-model';
import { guidedTools } from './guided-tools.ts';
import { createTools } from './tools.ts';
import { createVaRuntime } from './va.ts';
import { installVocabularyHelper } from './va-helper.ts';
import type { LogFn, PluginContext } from '@local/dari-model';
import type { PluginConfig } from '@local/dari-model';

export const inject = ['tools', 'systemPrompt'];

export function apply(ctx: PluginContext, config: PluginConfig = {}): void {
  const log: LogFn = (message) => {
    try {
      const logger = ctx.logger;
      if (logger?.info) logger.info(message);
      else console.error(message);
    } catch {
      console.error(message);
    }
  };

  const knowledge = createKnowledge({ ctx, log, config });
  ctx.effect(() => knowledge.dispose);
  if (config.vocabularyHelper === true) {
    installVocabularyHelper({ ctx, knowledge, log, config });
    return;
  }

  installWorkMethods(ctx);

  const timeContext = createTimeContext({ ctx, log });
  timeContext.install();

  const va = createVaRuntime({ ctx, log, config });

  const definitions = createTools({ knowledge, va, timeContext, log, config, attachments:()=>ctx.get('attachments'), approval:()=>ctx.get('approval'), filePolicy:()=>ctx.get('sandboxPolicy') });
  ctx.effect(() => definitions.dispose);
  for (const definition of guidedTools(definitions, knowledge, definitions.infoContracts)) {
    const dispose = ctx.tools.register(definition);
    if (typeof dispose === 'function') ctx.effect(() => dispose);
  }

}

// Finite host capabilities consumed by the isolated DARI service.
export {dariHost} from '@local/dari-model';

export {createIntegration} from '@local/dari-model';
