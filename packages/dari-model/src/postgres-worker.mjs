import {parentPort, workerData} from 'node:worker_threads';
import pg from 'pg';

const state = new Int32Array(workerData.buffer, 0, 2);
const bytes = new Uint8Array(workerData.buffer, 8);
const safeNumber = value => {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw Error('PostgreSQL integer exceeds the Dari Int range');
    return number;
};
const client = new pg.Client({
    connectionString: workerData.connectionString,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    types: {getTypeParser(oid, format) {
        if (oid === 20) return safeNumber;
        if (oid === 1700) return Number;
        if (oid === 1184) return value => new Date(value).toISOString();
        return pg.types.getTypeParser(oid, format);
    }}
});
client.on('error', () => {});
let connected;

function finish(response) {
    const encoder = new TextEncoder();
    let data = encoder.encode(JSON.stringify(response));
    if (data.length > bytes.length) data = encoder.encode(JSON.stringify({error: 'PostgreSQL result exceeds shared buffer'}));
    bytes.set(data);
    Atomics.store(state, 1, data.length);
    Atomics.store(state, 0, 1);
    Atomics.notify(state, 0);
}

parentPort.on('message', async ({page, count, close}) => {
    if (close) {
        try { await client.end(); } finally { parentPort.close(); }
        return;
    }
    try {
        connected ??= client.connect();
        await connected;
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        try {
            const {rows} = await client.query(page.sql, page.bindings);
            const total = count ? (await client.query(count.sql, count.bindings)).rows[0].total : undefined;
            await client.query('COMMIT');
            finish({rows, total});
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        }
    } catch (error) {
        finish({error: error.message});
    }
});
