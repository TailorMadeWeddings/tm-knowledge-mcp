import postgres from "postgres";

/**
 * Create a Postgres client pointed at the Supabase transaction pooler.
 *
 * Required settings for Supavisor transaction mode:
 *   prepare: false       — transaction pooler doesn't support prepared statements
 *   fetch_types: false   — skip the pg_type introspection query on connect (fails in transaction mode)
 *   max: 1               — single connection; avoids pool-inside-a-pool issues in Workers
 */
export function createDb(connectionString: string) {
	const sql = postgres(connectionString, {
		// Hyperdrive handles TLS to the origin DB — no ssl config here.
		// max:5 per Cloudflare's Postgres.js + Hyperdrive example.
		prepare: false,
		fetch_types: false,
		max: 5,
	});

	console.log("[db] Postgres client created via Hyperdrive (prepare=false, fetch_types=false, max=5)");
	return sql;
}

/** Wrap a query with logging so wrangler tail shows what's happening. */
export async function dbQuery<T>(label: string, fn: () => Promise<T>): Promise<T> {
	console.log(`[db] query start: ${label}`);
	try {
		const result = await fn();
		console.log(`[db] query ok: ${label}`);
		return result;
	} catch (err: any) {
		console.error(`[db] query FAIL: ${label}`, err?.message ?? err);
		throw err;
	}
}

export type Db = ReturnType<typeof createDb>;
export type MakeDb = () => Db;

/**
 * Build a PostgreSQL array literal string from a JS array.
 * Bypasses postgres.js type inference entirely — works with
 * fetch_types:false and Hyperdrive.  Use with a ::text[] cast:
 *
 *   db`INSERT INTO t (col) VALUES (${pgTextArray(arr)}::text[])`
 */
export function pgTextArray(arr: string[]): string {
	if (arr.length === 0) return "{}";
	return (
		"{" +
		arr
			.map((v) => '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"')
			.join(",") +
		"}"
	);
}
