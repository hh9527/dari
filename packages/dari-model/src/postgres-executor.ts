import {Worker} from 'node:worker_threads';

type Query = {sql: string; bindings: unknown[]};

export function openPostgres(connectionString: string) {
    const buffer = new SharedArrayBuffer(8 + 8 * 1024 * 1024);
    const state = new Int32Array(buffer, 0, 2);
    const bytes = new Uint8Array(buffer, 8);
    const worker = new Worker(new URL('./postgres-worker.mjs', import.meta.url), {
        execArgv: [],
        workerData: {buffer, connectionString}
    });
    let closed = false;
    const exited = new Promise<void>(resolve => worker.once('exit', () => {
        closed = true;
        resolve();
    }));
    worker.on('error', () => {});
    return {
        read(page: Query, count?: Query): {rows: Record<string, unknown>[]; total?: number} {
            if (closed) throw Error('PostgreSQL executor is closed');
            Atomics.store(state, 0, 0);
            worker.postMessage({page, count});
            if (Atomics.wait(state, 0, 0, 75000) === 'timed-out') {
                closed = true;
                void worker.terminate();
                throw Error('PostgreSQL execution timed out');
            }
            const response = JSON.parse(new TextDecoder().decode(bytes.subarray(0, Atomics.load(state, 1))));
            if (response.error) throw Error(response.error);
            return response;
        },
        async close() {
            if (!closed) {
                closed = true;
                worker.postMessage({close: true});
            }
            await exited;
        }
    };
}
