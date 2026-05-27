import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dbQuery, type Db } from "../db";
import { embed } from "../embed";

export function register(server: McpServer, db: Db, apiKey: string) {
	server.tool(
		"synthesize",
		"Retrieve a connected slice of the knowledge graph around a topic. " +
			"Returns entries from ALL authors plus their link edges, ready for synthesis.",
		{
			topic: z.string().describe("Topic to synthesize around"),
			kinds: z
				.array(z.enum(["idea", "note", "reference", "decision", "open_question"]))
				.optional(),
			limit: z.number().min(1).max(30).optional().describe("Max entries (default 12)"),
		},
		async ({ topic, kinds, limit }) => {
			console.log("[synthesize] embedding topic");
			const vec = await embed(topic, "query", apiKey);
			const vecStr = `[${vec.join(",")}]`;
			const max = limit ?? 12;

			const entries = await dbQuery("synthesize.match_entries", () =>
				kinds?.length
					? db`
						SELECT id, title, body, kind, tags, source, originated_by, similarity
						FROM kb.match_entries(${vecStr}::vector(1536), ${max}, ${db.array(kinds)}::text[])
					`
					: db`
						SELECT id, title, body, kind, tags, source, originated_by, similarity
						FROM kb.match_entries(${vecStr}::vector(1536), ${max})
					`,
			);

			if (entries.length === 0) {
				return { content: [{ type: "text" as const, text: JSON.stringify({ entries: [], edges: [] }) }] };
			}

			const ids = entries.map((e) => e.id);

			const edges = await dbQuery("synthesize.links", () => db`
				SELECT id, from_id, to_id, relationship, created_by
				FROM kb.links
				WHERE from_id = ANY(${db.array(ids)}::uuid[])
				   OR to_id   = ANY(${db.array(ids)}::uuid[])
			`);

			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(
							{
								entries: entries.map((e) => ({
									id: e.id,
									title: e.title,
									body: e.body,
									kind: e.kind,
									tags: e.tags,
									source: e.source,
									originated_by: e.originated_by,
									similarity: Number(e.similarity).toFixed(4),
								})),
								edges: edges.map((l) => ({
									id: l.id,
									from_id: l.from_id,
									to_id: l.to_id,
									relationship: l.relationship,
									created_by: l.created_by,
								})),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);
}
