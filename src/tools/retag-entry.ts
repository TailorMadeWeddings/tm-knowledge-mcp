import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dbQuery, normalizeTags, pgTextArray, type MakeDb } from "../db";

export function register(server: McpServer, makeDb: MakeDb, email: string) {
	server.tool(
		"retag_entry",
		"Add, remove, or replace tags on one or more existing knowledge-base entries. " +
			"Works on any kind (idea, note, reference, etc.) and accepts bulk ids.",
		{
			ids: z
				.union([z.string().uuid(), z.array(z.string().uuid())])
				.describe("Single entry ID or array of entry IDs to retag"),
			tags: z.array(z.string()).describe("Tags to add, remove, or set"),
			mode: z
				.enum(["add", "remove", "replace"])
				.default("add")
				.describe("add = union into existing tags; remove = strip named tags; replace = overwrite tag set"),
		},
		async ({ ids, tags, mode }) => {
			const idList = Array.isArray(ids) ? ids : [ids];
			const normalizedTags = normalizeTags(tags);

			console.log(`[retag_entry] ENTER ids=${idList.length} mode=${mode} tags=${normalizedTags.join(",")}`);

			const db = makeDb();
			try {
				const results: { id: string; status: string; tags?: string[] }[] = [];

				for (const id of idList) {
					let rows: any[];

					if (mode === "replace") {
						const pgTags = pgTextArray(normalizedTags);
						rows = await dbQuery(`retag_entry.replace.${id}`, () => db`
							UPDATE kb.entries
							SET tags = ${pgTags}::text[], updated_at = now()
							WHERE id = ${id} AND is_deleted = false
							RETURNING id, tags
						`);
					} else if (mode === "remove") {
						// Remove each tag one at a time using array_remove
						// Build a CTE that iteratively removes tags
						const pgTags = pgTextArray(normalizedTags);
						rows = await dbQuery(`retag_entry.remove.${id}`, () => db`
							UPDATE kb.entries
							SET tags = (
								SELECT COALESCE(array_agg(elem), '{}')
								FROM unnest(tags) AS elem
								WHERE elem != ALL(${pgTags}::text[])
							), updated_at = now()
							WHERE id = ${id} AND is_deleted = false
							RETURNING id, tags
						`);
					} else {
						// mode === "add": union new tags into existing set
						const pgTags = pgTextArray(normalizedTags);
						rows = await dbQuery(`retag_entry.add.${id}`, () => db`
							UPDATE kb.entries
							SET tags = (
								SELECT array_agg(DISTINCT elem)
								FROM unnest(array_cat(tags, ${pgTags}::text[])) AS elem
							), updated_at = now()
							WHERE id = ${id} AND is_deleted = false
							RETURNING id, tags
						`);
					}

					if (rows.length === 0) {
						// Check whether it exists at all vs is archived
						const [existing] = await dbQuery(`retag_entry.check.${id}`, () => db`
							SELECT id, is_deleted FROM kb.entries WHERE id = ${id}
						`);
						if (!existing) {
							results.push({ id, status: "not_found" });
						} else {
							results.push({ id, status: "skipped_archived" });
						}
					} else {
						results.push({ id, status: "updated", tags: rows[0].tags });

						await dbQuery(`retag_entry.audit.${id}`, () => db`
							INSERT INTO kb.audit (entry_id, action, actor, payload)
							VALUES (${id}, 'retag', ${email}, ${JSON.stringify({ mode, tags: normalizedTags })}::jsonb)
						`);
					}
				}

				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify({ status: "completed", results }, null, 2),
						},
					],
				};
			} finally {
				await db.end();
			}
		},
	);
}
