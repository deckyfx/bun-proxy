import { renderToReadableStream } from "react-dom/server";
import React from "react";

import Index from "@app/index";
import { getAccessTokenFromRequest, verifyAccessToken } from "@utils/auth";
import { type UserType } from "@db/schema";
import Config from "@src/config";

async function IndexSSR(req: Bun.BunRequest<"/">): Promise<Response> {
  const token = getAccessTokenFromRequest(req);
  const user = token ? verifyAccessToken<UserType>(token) : null;
  const isAuthenticated = !!user || Config.DEBUG_ALWAYS_LOGIN;

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


const IndexRoute = {
  GET: IndexSSR,
};

export default IndexRoute;