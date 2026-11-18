import type {ModelCheckPort,ModelExecutionPort} from '@local/dari-core';
import type {CheckOptions} from '@local/dari-core';
import type {Range} from './lsp/protocol.ts';
export type SymbolLocation={uri:string;range:Range};
/** A trusted host module supplies these capabilities; DARI documents cannot load modules. */
export type Integration={
 checker?:ModelCheckPort;
 executor?:ModelExecutionPort;
 options?:CheckOptions;
 symbols?:Record<string,SymbolLocation>;
 inspect?(input:unknown):unknown|Promise<unknown>;
 close?():void|Promise<void>;
};
