/**
 * Cloudflare Access auth handler.
 *
 * Cloudflare Access sits in front of the Worker and authenticates users via
 * Google Workspace (tailormadeweddings.co).  Every request that reaches the
 * Worker already carries the `Cf-Access-Authenticated-User-Email` header.
 *
 * This handler plugs into `workers-oauth-provider` as the "upstream" identity
 * source — it reads the Access-provided email, shows a one-time MCP client
 * approval dialog, and completes the MCP OAuth handshake.
 */

import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import type { Props } from "./types";
import {
	addApprovedClient,
	generateCSRFProtection,
	isClientApproved,
	OAuthError,
	renderApprovalDialog,
	validateCSRFToken,
} from "./workers-oauth-utils";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

/** GET /authorize — show (or skip) the MCP client approval dialog. */
app.get("/authorize", async (c) => {
	const email = c.req.header("Cf-Access-Authenticated-User-Email");
	if (!email) {
		return c.text("Cloudflare Access authentication required", 401);
	}

	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	if (!oauthReqInfo.clientId) {
		return c.text("Invalid request", 400);
	}

	// Returning user — skip the dialog and complete the MCP OAuth flow.
	if (await isClientApproved(c.req.raw, oauthReqInfo.clientId, c.env.COOKIE_ENCRYPTION_KEY)) {
		const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
			request: oauthReqInfo,
			userId: email,
			metadata: { label: email },
			scope: oauthReqInfo.scope,
			props: { email } satisfies Props,
		});
		return new Response(null, { status: 302, headers: { Location: redirectTo } });
	}

	// First visit — show approval dialog with CSRF protection.
	const { token: csrfToken, setCookie } = generateCSRFProtection();

	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId),
		csrfToken,
		server: {
			name: "TailorMade Knowledge Base",
			description: "Shared knowledge base for the TailorMade team.",
		},
		setCookie,
		state: { oauthReqInfo },
	});
});

/** POST /authorize — user clicked "Approve". */
app.post("/authorize", async (c) => {
	try {
		// Identity always comes from the Access header — never from client state.
		const email = c.req.header("Cf-Access-Authenticated-User-Email");
		if (!email) {
			return c.text("Cloudflare Access authentication required", 401);
		}

		const formData = await c.req.raw.formData();
		validateCSRFToken(formData, c.req.raw);

		const encodedState = formData.get("state");
		if (!encodedState || typeof encodedState !== "string") {
			return c.text("Missing state", 400);
		}

		let state: { oauthReqInfo?: any };
		try {
			state = JSON.parse(atob(encodedState));
		} catch {
			return c.text("Invalid state data", 400);
		}

		if (!state.oauthReqInfo?.clientId) {
			return c.text("Invalid request", 400);
		}

		const approvedCookie = await addApprovedClient(
			c.req.raw,
			state.oauthReqInfo.clientId,
			c.env.COOKIE_ENCRYPTION_KEY,
		);

		const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
			request: state.oauthReqInfo,
			userId: email,
			metadata: { label: email },
			scope: state.oauthReqInfo.scope,
			props: { email } satisfies Props,
		});

		return new Response(null, {
			status: 302,
			headers: {
				Location: redirectTo,
				"Set-Cookie": approvedCookie,
			},
		});
	} catch (error: any) {
		if (error instanceof OAuthError) return error.toResponse();
		console.error("POST /authorize error:", error);
		return c.text("Internal server error", 500);
	}
});

export { app as AccessHandler };
