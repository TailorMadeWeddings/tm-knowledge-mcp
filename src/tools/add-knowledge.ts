import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dbQuery, pgTextArray, type MakeDb } from "../db";
import { embed } from "../embed";

const DUPLICATE_THRESHOLD = 0.92;
const AUTO_LINK_THRESHOLD = 0.85;
const SUGGEST_LINK_THRESHOLD = 0.78;

export function register(server: McpServer, makeDb: MakeDb, apiKey: string, email: string) {
	server.tool(
		"add_knowledge",
		"Add an idea, note, decision, or open question to the shared knowledge base. " +
			"Near-duplicates are flagged; related entries are auto-linked or suggested.",
		{
			title: z.string().describe("Short title"),
			body: z.string().describe("Full content"),
			kind: z.enum(["idea", "note", "decision", "open_question"]),
			tags: z.array(z.string()).optional().describe("Freeform tags"),
			source: z.string().optional().describe("e.g. 'brainstorm 2026-05-24'"),
			originated_by: z
				.array(z.string())
				.optional()
				.describe("Email(s) of who the idea belongs to (defaults to caller)"),
			visibility: z
				.enum(["team", "private"])
				.optional()
				.describe("Visibility scope: 'team' (default) or 'private' (only visible to you)"),
		},
		async ({ title, body, kind, tags, source, originated_by, visibility }) => {
			console.log(`[add_knowledge] ENTER title="${title}" kind=${kind}`);
			const vec = await embed(body, "document", apiKey);
			const vecStr = `[${vec.join(",")}]`;

			// Normalize array columns — always real JS arrays, never strings/undefined
			const finalTags: string[] = Array.isArray(tags) ? tags : [];
			const finalOriginatedBy: string[] = Array.isArray(originated_by) && originated_by.length > 0
				? originated_by
				: [email];

			const finalVisibility = visibility ?? "team";

			const db = makeDb();
			try {
				// Duplicate check — scoped to caller's visible entries
				const dupes = await dbQuery("add_knowledge.dupe_check", () => db`
					SELECT id, title, body, kind, visibility, similarity
					FROM kb.match_entries(${vecStr}::vector(1536), 3, null, ${email})
				`);

				const nearDuplicates = dupes.filter((d) => Number(d.similarity) >= DUPLICATE_THRESHOLD);
				if (nearDuplicates.length > 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: JSON.stringify(
									{
										status: "near_duplicate_detected",
										message:
											"Very similar entries already exist. Please confirm, merge, or rephrase.",
										duplicates: nearDuplicates.map((d) => ({
											id: d.id,
											title: d.title,
											body: d.body,
											kind: d.kind,
											similarity: Number(d.similarity).toFixed(4),
										})),
									},
									null,
									2,
								),
							},
						],
					};
				}

				const pgTags = pgTextArray(finalTags);
				const pgOrigBy = pgTextArray(finalOriginatedBy);

				const [inserted] = await dbQuery("add_knowledge.insert", () => db`
					INSERT INTO kb.entries (title, body, kind, tags, source, entered_by, originated_by, embedding, visibility)
					VALUES (
						${title}, ${body}, ${kind}, ${pgTags}::text[],
						${source ?? null}, ${email}, ${pgOrigBy}::text[],
						${vecStr}::vector(1536), ${finalVisibility}
					)
					RETURNING id
				`);

				// Audit
				await dbQuery("add_knowledge.audit", () => db`
					INSERT INTO kb.audit (entry_id, action, actor, payload)
					VALUES (${inserted.id}, 'add', ${email}, ${JSON.stringify({ title, kind })}::jsonb)
				`);

				// Find related entries for linking / suggesting
				const related = dupes.filter(
					(d) =>
						Number(d.similarity) >= SUGGEST_LINK_THRESHOLD &&
						Number(d.similarity) < DUPLICATE_THRESHOLD,
				);

				const autoLinked: string[] = [];
				const suggested: { id: string; title: string; similarity: string }[] = [];

				for (const r of related) {
					if (Number(r.similarity) >= AUTO_LINK_THRESHOLD) {
						await dbQuery("add_knowledge.auto_link", () => db`
							INSERT INTO kb.links (from_id, to_id, relationship, created_by)
							VALUES (${inserted.id}, ${r.id}, 'relates_to', ${email})
							ON CONFLICT DO NOTHING
						`);
						autoLinked.push(r.id);
					} else {
						suggested.push({
							id: r.id,
							title: r.title,
							similarity: Number(r.similarity).toFixed(4),
						});
					}
				}

				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(
								{
									status: "added",
									id: inserted.id,
									visibility: finalVisibility,
									auto_linked: autoLinked,
									suggested_links: suggested,
								},
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
