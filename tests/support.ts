import {resolve as execute} from '../packages/dari-core/src/runtime.ts';
import type {Program} from '../packages/dari-core/src/compiler.ts';
import type {DatabasePort} from '../packages/dari-core/src/database.ts';
import type {ModelExecutionPort} from '../packages/dari-core/src/model.ts';
/** Extracted regression fixtures supply both ports explicitly through this test-only helper. */
export const resolve=(p:Program,db:DatabasePort,inputs={},execution={})=>execute(p,db,inputs,{model:p.model as ModelExecutionPort,...execution});
