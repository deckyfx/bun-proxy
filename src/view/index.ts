import { renderToReadableStream } from "react-dom/server";
import React from "react";

import Index from "@app/index";
import { getAccessTokenFromRequest, verifyAccessToken } from "@utils/auth";
import { type UserType } from "@db/schema";
import Config from "@src/config";

import { handleDoHRequest } from "../doh/handler";

async function IndexSSR(req: Bun.BunRequest<"/">): Promise<Response> {
  const token = getAccessTokenFromRequest(req);
  const user = token ? verifyAccessToken<UserType>(token) : null;
  const isAuthenticated = !!user || Config.DEBUG_BYPASS_AUTH;

  const stream = await renderToReadableStream(
    React.createElement(Index, { isAuthenticated }),
    {
      bootstrapModules: ["/hydrate"],
    }
  );

  return new Response(stream, {
    headers: {
      "content-type": "text/html",
    },
  });
}

async function SmartIndexRoute(req: Request): Promise<Response> {
  // Check if this is a DoH request
  const url = new URL(req.url);
  const acceptHeader = req.headers.get("accept") || "";
  const contentType = req.headers.get("content-type") || "";

  // DoH detection criteria:
  // 1. Has 'dns' query parameter (DoH GET)
  // 2. Content-Type is 'application/dns-message' (DoH POST)
  // 3. Accept header contains 'application/dns-message'
  const isDoHRequest =
    url.searchParams.has("dns") ||
    contentType.includes("application/dns-message") ||
    acceptHeader.includes("application/dns-message");

  if (isDoHRequest) {
    return handleDoHRequest(req);
  }

  // Otherwise serve the dashboard
  return IndexSSR(req as any);
}

const IndexRoute = {
  GET: SmartIndexRoute,
  POST: SmartIndexRoute,
};

export default IndexRoute;
