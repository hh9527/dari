import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { sqlitePivotSql } from '../packages/dari-model/src/sqlite-pivot.ts';

const sql = sqlitePivotSql(
    'SELECT hour, device, avg(rate) AS rate FROM samples GROUP BY hour, device',
    {index: 'hour', columns: 'device', values: 'rate', maxRows: 48, maxColumns: 12}
);

function query(samples, statement = sql) {
    const db = new DatabaseSync(':memory:');
    try {
        db.exec('CREATE TABLE samples (hour INTEGER, device INTEGER, rate REAL)');
        const insert = db.prepare('INSERT INTO samples VALUES (?, ?, ?)');
        for (const row of samples) insert.run(...row);
        return db.prepare(statement).all();
    } finally {
        db.close();
    }
}

for (const [hours, devices] of [[48, 12], [48, 8], [24, 24], [49, 1], [0, 0]]) {
    test(`SQLite pivot preserves the axis budgets for ${hours} × ${devices}`, () => {
        const samples = [];
        for (let hour = 0; hour < hours; hour++) {
            for (let device = 0; device < devices; device++) {
                const value = hour * 100 + device;
                samples.push([hour, device, value - 1], [hour, device, value + 1]);
            }
        }
        const rows = query(samples);
        assert.ok(rows.every(r => r.row_count === hours && r.column_count === devices));
        if (hours > 48 || devices > 12 || hours === 0) {
            assert.deepEqual(rows.map(r => r.cells), [null]);
            return;
        }
        assert.equal(rows.length, hours);
        for (const [index, row] of rows.entries()) {
            assert.equal(row.pivot_index, index);
            assert.deepEqual(JSON.parse(row.cells), Array.from(
                {length: devices}, (_, device) => [device, index * 100 + device]
            ));
        }
    });
}

test('SQLite pivot preserves zero, null and absent coordinates', () => {
    const rows = query([[0, 0, 0], [0, 1, null], [1, 1, 2]]);
    assert.deepEqual(rows.map(r => JSON.parse(r.cells)), [[[0, 0], [1, null]], [[1, 2]]]);
});

test('SQLite pivot suppresses data if an axis key is null', () => {
    const rows = query([[0, null, 1], [1, 1, 2]]);
    assert.deepEqual(rows.map(r => [r.cells, r.null_axes]), [[null, 1]]);
});

test('SQLite pivot suppresses data if coordinates repeat', () => {
    const statement = sqlitePivotSql('SELECT hour, device, rate FROM samples', {
        index: 'hour', columns: 'device', values: 'rate', maxRows: 48, maxColumns: 12,
    });
    const rows = query([[0, 0, 1], [0, 0, 2]], statement);
    assert.deepEqual(rows.map(r => [r.cells, r.duplicate_coordinates]), [[null, 1]]);
});
