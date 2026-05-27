import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
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

		// IMPORTANT: No async I/O here.  The DO re-runs init() on every
		// hibernation wake-up; creating a Postgres client here opens a TCP
		// connection that causes an IoContext timeout.  Instead, pass a
		// zero-cost factory — each tool creates and disposes its own client.
		const connStr = this.env.KB_DB_CONNECTION;
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
		console.log("[mcp] all tools registered");
	}
}
