import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dbQuery, type Db } from "../db";

export function register(server: McpServer, db: Db, email: string) {
	server.tool(
		"archive_entry",
		"Soft-delete a knowledge-base entry (sets is_deleted = true). No hard delete.",
		{
			id: z.string().uuid().describe("Entry ID to archive"),
		},
		async ({ id }) => {
			console.log(`[archive_entry] ENTER id=${id}`);
			const [row] = await dbQuery("archive_entry.update", () => db`
				UPDATE kb.entries SET is_deleted = true, updated_at = now()
				WHERE id = ${id} AND is_deleted = false
				RETURNING id
			`);

			if (!row) {
				return {
					content: [{ type: "text" as const, text: JSON.stringify({ status: "not_found", id }) }],
				};
			}

			await dbQuery("archive_entry.audit", () => db`
				INSERT INTO kb.audit (entry_id, action, actor, payload)
				VALUES (${id}, 'archive', ${email}, '{}'::jsonb)
			`);

			return {
				content: [{ type: "text" as const, text: JSON.stringify({ status: "archived", id }) }],
			};
		},
	);
}
