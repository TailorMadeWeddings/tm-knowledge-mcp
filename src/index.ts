import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { AccessHandler } from "./access-handler";
import { MyMCP } from "./mcp";

export { MyMCP };

export default new OAuthProvider({
	apiHandler: MyMCP.serve("/mcp"),
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: AccessHandler,
	tokenEndpoint: "/token",
});
