import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { AccessHandler } from "./access-handler";
import { MyMCP } from "./mcp";

export { MyMCP };

/**
 * Use the legacy SSE transport instead of streamable-HTTP.
 *
 * With streamable-HTTP each tool-call POST creates a short-lived
 * Worker → DO WebSocket → SSE stream.  The fire-and-forget WebSocket
 * event listeners in the agents package run *after* the Worker considers
 * the fetch handler done, so the tool response is written inside a
 * waitUntil() grace window the runtime eventually cancels.
 *
 * SSE transport keeps ONE long-lived GET stream open for the whole MCP
 * session.  Tool-call POSTs go to /mcp/message and return 202 immediately;
 * results flow back on the persistent GET stream where the Worker is
 * still alive.
 */
export default new OAuthProvider({
	apiHandler: MyMCP.serve("/mcp", { transport: "sse" }),
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: AccessHandler,
	tokenEndpoint: "/token",
});
