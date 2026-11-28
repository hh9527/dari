import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {check, resolve} from '@local/dari-core';
import {createIntegration} from '../packages/dari-model/src/dari-integration.ts';
import {pivotSql} from '../packages/dari-model/src/sqlite-pivot.ts';
import {sqlite} from '../packages/dari/src/adapters/sqlite.ts';

const model = process.argv[2];
const postgres = process.env.DARI_TEST_POSTGRES;
if (!model || !postgres) throw Error('Pass the IC model path and set DARI_TEST_POSTGRES to a disposable PostgreSQL database');

const require = createRequire(new URL('../packages/dari-model/package.json', import.meta.url));
const {Client} = require('pg');
const client = new Client({connectionString: postgres});
const schema = 'dari_test_' + randomUUID().replaceAll('-', '');
const scoped = new URL(postgres);
scoped.searchParams.set('options', '-c search_path=' + schema);
const directory = mkdtempSync(join(tmpdir(), 'dari-postgres-'));
const database = join(directory, 'fixture.sqlite');
const local = new DatabaseSync(':memory:');
const seed = `CREATE TABLE "EntNetworkElement" (name text, "ipAddress" text);
INSERT INTO "EntNetworkElement" VALUES ('Alpha', '10.4.2.3'), ('Beta', '10.40.2.3'), ('Beta', '10.4.2.4');
CREATE TABLE "NetworkDeviceKPI" ("resId" bigint, "tenantId" bigint, ts TIME_TYPE,
    "cpuUsage" double precision, "cpuUsageEffcnt" bigint);
INSERT INTO "NetworkDeviceKPI" VALUES
    (1, 1, '2026-02-01T01:00:00Z', 20, 1),
    (1, 1, '2026-02-02T01:00:00Z', 40, 1),
    (2, 1, '2026-02-02T01:00:00Z', 60, 1);`;

function source(filter = '', terminal = 'take(4)') {
    return `data rows = query_remote! {
        let a = from(ic::device);
        let b = from(ic::device);
        let x = a ${filter} |> project({branch: "A", Name: a.device_name});
        let y = b |> project({branch: "B", Name: b.device_name});
        let both = x |> union_all(y);
        both |> order_by(asc(both.branch), asc(both.Name)) |> ${terminal}
    };
    data local_rows = query! {
        let remote = from(rows);
        remote |> project({branch: remote.branch, Name: remote.Name})
    };
    answer tree! {Answer [Table(data=rows), Table(data=local_rows)]};`;
}

const grouped = `data rows = query_remote! {
    let a = from(ic::device_kpi);
    let grouped = a |> project({day: utc_bucket(a.device_kpi_ts_raw, CalendarUnit::Day), cpu: a.cpu_usage});
    grouped |> order_by(asc(grouped.day)) |> take(5)
}; answer tree! {Answer [Table(data=rows)]};`;

const paired = `data rows = query_remote! {
    let a = from(ic::device_kpi);
    let b = from(ic::device_kpi);
    let combined = a |> pair(b) |> group_by_identity(a) |> group_by_identity(b);
    let results = combined |> project({before: a.cpu_usage, after: b.cpu_usage});
    results |> order_by(desc(difference(results.after, results.before))) |> take(1)
}; answer tree! {Answer [Table(data=rows)]};`;

const integrations: Awaited<ReturnType<typeof createIntegration>>[] = [];
let seeded = false;
try {
    const disk = new DatabaseSync(database);
    try { disk.exec(seed.replace("TIME_TYPE", "text")); } finally { disk.close(); }
    await client.connect();
    await client.query('CREATE SCHEMA ' + schema);
    seeded = true;
    await client.query('SET search_path TO ' + schema);
    await client.query(seed.replace("TIME_TYPE", "timestamptz"));
    integrations.push(await createIntegration({model, database}));
    integrations.push(await createIntegration({model, postgres: scoped.href}));
    for (const [draft, expectedCount] of [
        [source(), /共 6 条，展示 4 条/],
        [source('|> filter(a.device_name == "Beta" || a.device_name == "Beta")'), /共 5 条，展示 4 条/],
        [source('', 'top(4)'), /\| A \| Beta \|/],
        [source('|> filter(in_subnet(a.device_ip_address_ipv4, "10.4.0.0/16").unwrap_or!(False))'), /共 5 条，展示 4 条/],
        [grouped, /20/],
        [paired, /展示 1 条/],
        [grouped.replace('a.cpu_usage', 'a.device_cpu_latest'), /40%/],
        [grouped.replace('utc_bucket(a.device_kpi_ts_raw, CalendarUnit::Day)', 'calendar_bucket(a.device_kpi_ts_raw, CalendarUnit::Day, TimeZone("America/New_York"))'), /20/],
    ] as const) {
        const output = integrations.map(integration => {
            const program = check(draft, integration.checker, integration.options);
            if(draft.includes('union_all'))assert.ok(program.bindings.get('rows')?.type.inner?.fields?.Name);
            return resolve(program, sqlite(local), {}, {
                model: integration.executor,
                contextContractId: integration.options.contextContractId
            }).answer;
        });
        assert.equal(output[1], output[0]);
        assert.match(output[1], expectedCount);
    }
    const coordinates = "SELECT * FROM (VALUES (1, 'A', 20), (2, 'B', 40), (2, 'A', 10)) AS grid";
    const grid = `SELECT column1 AS day, column2 AS name, column3 AS value FROM (${coordinates}) AS cell`;
    const options = {index: 'day', columns: 'name', values: 'value', maxRows: 2, maxColumns: 1, rankColumns: 'SumDescKeyAsc' as const};
    const sqliteGrid = local.prepare(pivotSql(grid, options)).all();
    const pgGrid = (await client.query(pivotSql(coordinates + '(day, name, value)', options, 'postgres', true))).rows;
    assert.deepEqual(pgGrid.map(row => JSON.parse(row.cells)), sqliteGrid.map(row => JSON.parse(String(row.cells))));
    assert.deepEqual(JSON.parse(pgGrid[0].cells), [['B', 40]]);
    console.log('PostgreSQL and SQLite agree on UTC grouping and ranked sparse Pivot packing');
    console.log('SQLite and PostgreSQL agree on union_all, bindings, duplicate rows, ordering, counts and local materialization');
} finally {
    await Promise.all(integrations.map(integration => integration.close()));
    if (seeded) await client.query('DROP SCHEMA ' + schema + ' CASCADE');
    await client.end();
    local.close();
    rmSync(directory, {recursive: true, force: true});
}
