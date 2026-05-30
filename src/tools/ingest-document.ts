import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dbQuery, pgTextArray, type MakeDb } from "../db";
import { embedBatch } from "../embed";

const TARGET_CHARS = 3200; // ~800 tokens
const OVERLAP_CHARS = 480; // ~120 tokens

/** Split text into overlapping chunks on paragraph boundaries. */
function chunkText(text: string): string[] {
	const paragraphs = text.split(/\n\n+/);
	const chunks: string[] = [];
	let current = "";

	for (const para of paragraphs) {
		if (current.length + para.length > TARGET_CHARS && current.length > 0) {
			chunks.push(current.trim());
			// Build overlap from the tail of the current chunk
			const words = current.split(/\s+/);
			const overlap: string[] = [];
			let len = 0;
			for (let i = words.length - 1; i >= 0 && len < OVERLAP_CHARS; i--) {
				overlap.unshift(words[i]);
				len += words[i].length + 1;
			}
			current = overlap.join(" ") + "\n\n" + para;
		} else {
			current = current ? current + "\n\n" + para : para;
		}
	}
	if (current.trim()) {
		chunks.push(current.trim());
	}
	return chunks;
}

export function register(server: McpServer, makeDb: MakeDb, apiKey: string, email: string) {
	server.tool(
		"ingest_document",
		"Ingest a reference document: chunk it, embed all chunks, and store in the knowledge base.",
		{
			title: z.string().describe("Document title"),
			kind: z
				.enum(["reference", "note"])
				.default("reference")
				.describe("Entry kind for the chunks"),
			source: z.string().describe("Where this doc came from, e.g. 'brand guide'"),
			text: z.string().describe("Full document text"),
			visibility: z
				.enum(["team", "private"])
				.optional()
				.describe("Visibility scope for all chunks: 'team' (default) or 'private' (only visible to you)"),
		},
		async ({ title, kind, source, text, visibility }) => {
			console.log(`[ingest_document] ENTER title="${title}" len=${text.length}`);
			const finalVisibility = visibility ?? "team";

			const db = makeDb();
			try {
				// Parent document record
				const [doc] = await dbQuery("ingest_document.insert_doc", () => db`
					INSERT INTO kb.documents (title, kind, source, added_by)
					VALUES (${title}, ${kind}, ${source}, ${email})
					RETURNING id
				`);

				const chunks = chunkText(text);
				const vectors = await embedBatch(chunks, "document", apiKey);

				for (let i = 0; i < chunks.length; i++) {
					const chunkTitle = chunks.length > 1 ? `${title} [${i + 1}/${chunks.length}]` : title;
					const vecStr = `[${vectors[i].join(",")}]`;

					await dbQuery(`ingest_document.chunk_${i + 1}`, () => db`
						INSERT INTO kb.entries (
							title, body, kind, tags, source, source_doc_id,
							entered_by, originated_by, embedding, visibility
						) VALUES (
							${chunkTitle}, ${chunks[i]}, ${kind}, ${pgTextArray([])}::text[],
							${source}, ${doc.id},
							${email}, ${pgTextArray([email])}::text[],
							${vecStr}::vector(1536), ${finalVisibility}
						)
					`);
				}

				// Audit
				await dbQuery("ingest_document.audit", () => db`
					INSERT INTO kb.audit (entry_id, action, actor, payload)
					VALUES (null, 'add', ${email}, ${JSON.stringify({ document_id: doc.id, title, chunks: chunks.length })}::jsonb)
				`);

				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify({
								status: "ingested",
								document_id: doc.id,
								chunks: chunks.length,
								visibility: finalVisibility,
							}),
						},
					],
				};
			} finally {
				await db.end();
			}
		},
	);
}
