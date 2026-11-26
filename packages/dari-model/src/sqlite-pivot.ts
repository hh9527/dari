export type PivotSqlOptions = {
    index: string;
    columns: string;
    values: string;
    maxRows: number;
    maxColumns: number;
};

/** Pack a checked aggregate query at the SQLite execution boundary. */
export function sqlitePivotSql(sql: string, options: PivotSqlOptions): string {
    const {maxRows, maxColumns} = options;
    if (![maxRows, maxColumns].every(n => Number.isSafeInteger(n) && n > 0)) {
        throw new Error('Pivot budgets must be positive safe integers');
    }
    const identifier = (name: string) => '"' + name.replaceAll('"', '""') + '"';
    return `WITH coordinates AS MATERIALIZED (
    SELECT ${identifier(options.index)} AS pivot_index,
           ${identifier(options.columns)} AS pivot_key,
           ${identifier(options.values)} AS pivot_value
    FROM (${sql}) AS projected
), axes AS MATERIALIZED (
    SELECT count(DISTINCT pivot_index) AS row_count,
           count(DISTINCT pivot_key) AS column_count,
           count(*) FILTER (WHERE pivot_index IS NULL OR pivot_key IS NULL) AS null_axes
    FROM coordinates
), duplicates AS MATERIALIZED (
    SELECT 1 FROM coordinates
    GROUP BY pivot_index, pivot_key HAVING count(*) > 1
    LIMIT 1
), packed AS (
    SELECT pivot_index, json_group_array(json_array(pivot_key, pivot_value) ORDER BY pivot_key) AS cells
    FROM coordinates
    WHERE (SELECT row_count <= ${maxRows} AND column_count <= ${maxColumns} AND null_axes = 0 FROM axes)
      AND NOT EXISTS (SELECT 1 FROM duplicates)
    GROUP BY pivot_index
)
SELECT pivot_index, cells, row_count, column_count, null_axes,
       EXISTS (SELECT 1 FROM duplicates) AS duplicate_coordinates
FROM axes LEFT JOIN packed ON TRUE
ORDER BY pivot_index`;
}
