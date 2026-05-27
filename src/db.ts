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
		prepare: false,
		fetch_types: false,
		max: 1,
		ssl: "require",
		connect_timeout: 10,
		idle_timeout: 20,
		onnotice: () => {},
	});

	console.log("[db] Postgres client created (prepare=false, fetch_types=false, max=1)");
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
