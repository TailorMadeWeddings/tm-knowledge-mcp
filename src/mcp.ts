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
		const db = createDb(this.env.KB_DB_CONNECTION);
		const apiKey = this.env.GEMINI_API_KEY;
		const email = this.props!.email;

		searchKnowledge.register(this.server, db, apiKey);
		addKnowledge.register(this.server, db, apiKey, email);
		linkIdeas.register(this.server, db, email);
		synthesize.register(this.server, db, apiKey);
		listRecent.register(this.server, db);
		ingestDocument.register(this.server, db, apiKey, email);
		archiveEntry.register(this.server, db, email);
	}
}
