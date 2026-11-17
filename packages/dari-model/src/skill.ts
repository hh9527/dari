// 自带技能：注册进 skills 服务（可选依赖）的 runtime 层，对所有工作区可见。
// 正文是**本模块的**提示词源码 `src/skill.md`，构建期内联进产物，运行时不读文件。
import { errorText } from './host.ts';
import type { LogFn, PluginContext, SkillsService } from './host.ts';

/** rank 250：工作区自己的 skill(100/200) 能覆盖它，用户级(400/500) 不能。 */
const SKILL_CONTENT = '# 数据分析入口\n\n工作方法、DARI 手册和工作纪律已按 workflow → dari → rules 完整载入系统上下文，无需为了开始任务调用 dari_read。按已载入说明理解意图、检索领域知识、在同一份 .dari 中设计和检查查询、解析并交付。仅所选图表的 dari-figures.md 分册按需读取；三份已载入手册只在逐字引用或上下文压缩后重读。\n';

export const SKILL = {
  name: 'dari-work',
  description: 'Use when answering a business question from the data this workspace declares: discover capabilities, edit and run a DARI analysis draft, inspect readonly outputs and deliver an evidence-based answer or report.',
  source: 'runtime',
};

/**
 * 注册动作（幂等）。技能服务是**可选依赖**：加载时它可能还没起来，所以调用方在第一次工具调用
 * 时再补一次；已注册则空操作。
 */
export function createSkillRegistration(ctx: PluginContext, log: LogFn): () => boolean {
  let registered = false;
  return (): boolean => {
    if (registered) return true;
    let found: SkillsService | null = null;
    try {
      found = ctx.get?.('skills') ?? null;
    } catch {
      found = null;
    }
    const skills = found;
    if (skills === null || typeof skills.register !== 'function') return false;
    try {
      ctx.effect(() => skills.register({ ...SKILL, content: SKILL_CONTENT }));
      registered = true;
      log(`[dari] skill "${SKILL.name}" registered (runtime) · ${Buffer.byteLength(SKILL_CONTENT, 'utf8')} bytes`);
    } catch (cause) {
      log(`[dari] cannot register skill "${SKILL.name}": ${errorText(cause)}`);
      registered = true;
    }
    return registered;
  };
}
