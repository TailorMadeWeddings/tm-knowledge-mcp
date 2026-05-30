import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dbQuery, pgTextArray, type MakeDb } from "../db";
import { embed } from "../embed";

export function register(server: McpServer, makeDb: MakeDb, apiKey: string, email: string) {
	server.tool(
		"search_knowledge",
		"Search the shared knowledge base by semantic similarity. Returns ranked results.",
		{
			query: z.string().describe("Natural-language search query"),
			kinds: z
				.array(z.enum(["idea", "note", "reference", "decision", "open_question"]))
				.optional()
				.describe("Filter to these entry kinds"),
			limit: z.number().min(1).max(25).optional().describe("Max results (default 8)"),
		},
		async ({ query, kinds, limit }) => {
			console.log(`[search_knowledge] ENTER query="${query.slice(0, 80)}"`);
			const vec = await embed(query, "query", apiKey);
			const vecStr = `[${vec.join(",")}]`;
			const kindsArr = Array.isArray(kinds) && kinds.length > 0 ? kinds : null;

			const db = makeDb();
			try {
				const rows = await dbQuery("search_knowledge.match_entries", () =>
					kindsArr
						? db`
							SELECT id, title, body, kind, tags, source, entered_by, originated_by, visibility, similarity
							FROM kb.match_entries(${vecStr}::vector(1536), ${limit ?? 8}, ${pgTextArray(kindsArr)}::text[], ${email})
						`
						: db`
							SELECT id, title, body, kind, tags, source, entered_by, originated_by, visibility, similarity
							FROM kb.match_entries(${vecStr}::vector(1536), ${limit ?? 8}, null, ${email})
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
									visibility: r.visibility,
									similarity: Number(r.similarity).toFixed(4),
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
