import postgres from "postgres";

/**
 * Create a Postgres client pointed at the Supabase transaction pooler.
 * `prepare: false` is required because the transaction pooler (port 6543)
 * does not support prepared statements.
 */
export function createDb(connectionString: string) {
	return postgres(connectionString, {
		prepare: false,
		ssl: "require",
	});
}

export type Db = ReturnType<typeof createDb>;
