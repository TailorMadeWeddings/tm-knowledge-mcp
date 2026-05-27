import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-embedding-001";
const DIM = 1536;

/** L2-normalize a vector (required for truncated Gemini output). */
function normalize(v: number[]): number[] {
	const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
	if (norm === 0) return v;
	return v.map((x) => x / norm);
}

/** Embed a single text. Use kind="query" for search queries, "document" for stored content. */
export async function embed(
	text: string,
	kind: "document" | "query",
	apiKey: string,
): Promise<number[]> {
	const ai = new GoogleGenAI({ apiKey });
	const res = await ai.models.embedContent({
		model: MODEL,
		contents: text,
		config: {
			outputDimensionality: DIM,
			taskType: kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
		},
	});
	return normalize(res.embeddings![0].values as number[]);
}

/** Embed multiple texts sequentially. Can be optimised to batchEmbedContents later. */
export async function embedBatch(
	texts: string[],
	kind: "document" | "query",
	apiKey: string,
): Promise<number[][]> {
	const results: number[][] = [];
	for (const text of texts) {
		results.push(await embed(text, kind, apiKey));
	}
	return results;
}
