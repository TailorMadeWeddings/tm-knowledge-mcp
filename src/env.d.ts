// Augment the Env interface (merges with worker-configuration.d.ts)
interface Env {
	HYPERDRIVE: Hyperdrive;
	KB_DB_CONNECTION: string; // kept as rollback
	GEMINI_API_KEY: string;
	COOKIE_ENCRYPTION_KEY: string;
}
