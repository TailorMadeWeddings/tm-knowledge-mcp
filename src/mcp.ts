import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { createDb } from "./db";
import type { Props } from "./types";

import * as addKnowledge from "./tools/add-knowledge";
import * as archiveEntry from "./tools/archive-entry";
import * as ingestDocument from "./tools/ingest-document";
import * as linkIdeas from "./tools/link-ideas";
import * as listRecent from "./tools/list-recent";
import * as searchKnowledge from "./tools/search-knowledge";
import * as synthesize from "./tools/synthesize";

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "TailorMade Knowledge Base",
		version: "1.0.0",
	});

	async init() {
		console.log(`[mcp] init email=${this.props?.email}`);

		// Zero-I/O diagnostic tool — if this fires, framework dispatch works.
		this.server.tool(
			"ping",
			"Returns pong. Zero-I/O diagnostic tool.",
			{ message: z.string().optional().describe("Optional echo message") },
			async ({ message }) => {
				console.log(`[ping] ENTER message=${message ?? "(none)"}`);
				return {
					content: [{ type: "text" as const, text: message ? `pong: ${message}` : "pong" }],
				};
			},
		);

		// DB connectivity diagnostic — opens a connection, runs SELECT 1.
		const hyperdriveConnStr = this.env.HYPERDRIVE.connectionString;
		this.server.tool(
			"db_ping",
			"Opens a Postgres connection and runs SELECT 1. Returns ok + elapsed ms.",
			{},
			async () => {
				console.log("[db_ping] ENTER");
				const t0 = Date.now();
				const db = createDb(hyperdriveConnStr);
				try {
					console.log("[db_ping] running SELECT 1");
					const [row] = await db`SELECT 1 as ok`;
					const ms = Date.now() - t0;
					console.log(`[db_ping] ok=${row.ok} elapsed=${ms}ms`);
					return {
						content: [{ type: "text" as const, text: JSON.stringify({ status: "ok", ok: row.ok, elapsed_ms: ms }) }],
					};
				} catch (err: any) {
					const ms = Date.now() - t0;
					console.error(`[db_ping] FAIL elapsed=${ms}ms`, err?.message ?? err);
					return {
						content: [{ type: "text" as const, text: JSON.stringify({ status: "error", error: err?.message, elapsed_ms: ms }) }],
					};
				} finally {
					await db.end();
				}
			},
		);

		// IMPORTANT: No async I/O here.  The DO re-runs init() on every
		// hibernation wake-up; creating a Postgres client here opens a TCP
		// connection that causes an IoContext timeout.  Instead, pass a
		// zero-cost factory — each tool creates and disposes its own client.
		const connStr = this.env.HYPERDRIVE.connectionString;
		const makeDb = () => createDb(connStr);
		const apiKey = this.env.GEMINI_API_KEY;
		const email = this.props!.email;

		searchKnowledge.register(this.server, makeDb, apiKey);
		addKnowledge.register(this.server, makeDb, apiKey, email);
		linkIdeas.register(this.server, makeDb, email);
		synthesize.register(this.server, makeDb, apiKey);
		listRecent.register(this.server, makeDb);
		ingestDocument.register(this.server, makeDb, apiKey, email);
		archiveEntry.register(this.server, makeDb, email);
		console.log("[mcp] all tools registered (8 total incl. ping)");
	}
}
