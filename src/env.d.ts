// Augment the Env interface (merges with worker-configuration.d.ts)
interface Env {
	KB_DB_CONNECTION: string;
	GEMINI_API_KEY: string;
	COOKIE_ENCRYPTION_KEY: string;
}
