import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db } from "../db";

export function register(server: McpServer, db: Db, email: string) {
	server.tool(
		"link_ideas",
		"Create an explicit link between two knowledge-base entries (idempotent).",
		{
			from_id: z.string().uuid().describe("Source entry ID"),
			to_id: z.string().uuid().describe("Target entry ID"),
			relationship: z.enum(["builds_on", "relates_to", "contradicts", "refines", "example_of"]),
		},
		async ({ from_id, to_id, relationship }) => {
			await db`
				INSERT INTO kb.links (from_id, to_id, relationship, created_by)
				VALUES (${from_id}, ${to_id}, ${relationship}, ${email})
				ON CONFLICT (from_id, to_id, relationship) DO NOTHING
			`;

			await db`
				INSERT INTO kb.audit (entry_id, action, actor, payload)
				VALUES (${from_id}, 'link', ${email}, ${JSON.stringify({ to_id, relationship })}::jsonb)
			`;

			return {
				content: [{ type: "text" as const, text: JSON.stringify({ status: "linked", from_id, to_id, relationship }) }],
			};
		},
	);
}
