import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dbQuery, type Db } from "../db";

export function register(server: McpServer, db: Db) {
	server.tool(
		"list_recent",
		"List recent knowledge-base entries, newest first.",
		{
			kinds: z
				.array(z.enum(["idea", "note", "reference", "decision", "open_question"]))
				.optional(),
			days: z.number().min(1).max(365).optional().describe("Look-back window in days (default 30)"),
			limit: z.number().min(1).max(50).optional().describe("Max results (default 20)"),
		},
		async ({ kinds, days, limit }) => {
			console.log(`[list_recent] ENTER kinds=${kinds ?? "all"} days=${days ?? 30}`);
			const since = new Date();
			since.setDate(since.getDate() - (days ?? 30));

			const rows = await dbQuery("list_recent.select", () =>
				kinds?.length
					? db`
						SELECT id, title, body, kind, tags, source, entered_by, originated_by, created_at
						FROM kb.entries
						WHERE is_deleted = false
						  AND created_at >= ${since.toISOString()}
						  AND kind = ANY(${db.array(kinds)}::text[])
						ORDER BY created_at DESC
						LIMIT ${limit ?? 20}
					`
					: db`
						SELECT id, title, body, kind, tags, source, entered_by, originated_by, created_at
						FROM kb.entries
						WHERE is_deleted = false
						  AND created_at >= ${since.toISOString()}
						ORDER BY created_at DESC
						LIMIT ${limit ?? 20}
					`,
			);

			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(
							rows.map((r) => ({
								id: r.id,
								title: r.title,
								body: r.body,
								kind: r.kind,
								tags: r.tags,
								source: r.source,
								entered_by: r.entered_by,
								originated_by: r.originated_by,
								created_at: r.created_at,
							})),
							null,
							2,
						),
					},
				],
			};
		},
	);
}
