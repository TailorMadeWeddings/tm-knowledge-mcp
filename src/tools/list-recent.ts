import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dbQuery, pgTextArray, type MakeDb } from "../db";

export function register(server: McpServer, makeDb: MakeDb, email: string) {
	server.tool(
		"list_recent",
		"List recent knowledge-base entries, newest first.",
		{
			kinds: z
				.array(z.enum(["idea", "note", "reference", "decision", "open_question"]))
				.optional(),
			tags: z
				.array(z.string())
				.optional()
				.describe("Optional tag filter — return only entries whose tags overlap with this list"),
			days: z.number().min(1).max(365).optional().describe("Look-back window in days (default 30)"),
			limit: z.number().min(1).max(50).optional().describe("Max results (default 20)"),
		},
		async ({ kinds, tags, days, limit }) => {
			console.log(`[list_recent] ENTER kinds=${kinds ?? "all"} days=${days ?? 30}`);
			const since = new Date();
			since.setDate(since.getDate() - (days ?? 30));
			const pgKinds = Array.isArray(kinds) && kinds.length > 0 ? pgTextArray(kinds) : null;
			const pgTags = Array.isArray(tags) && tags.length > 0 ? pgTextArray(tags) : null;

			const db = makeDb();
			try {
				const rows = await dbQuery("list_recent.select", () => db`
					SELECT id, title, body, kind, tags, source, entered_by, originated_by, visibility, created_at
					FROM kb.entries
					WHERE is_deleted = false
					  AND created_at >= ${since.toISOString()}
					  AND (visibility = 'team' OR (visibility = 'private' AND entered_by = ${email}))
					  ${pgKinds ? db`AND kind = ANY(${pgKinds}::text[])` : db``}
					  ${pgTags ? db`AND tags && ${pgTags}::text[]` : db``}
					ORDER BY created_at DESC
					LIMIT ${limit ?? 20}
				`);

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
									visibility: r.visibility,
									created_at: r.created_at,
								})),
								null,
								2,
							),
						},
					],
				};
			} finally {
				await db.end();
			}
		},
	);
}
