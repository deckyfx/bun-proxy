import { renderToReadableStream } from "react-dom/server";
import React from "react";

import Index from "@app/index";
import { getAccessTokenFromRequest, verifyAccessToken } from "@src/utils/auth";
import { type UserType } from "@db/schema";

async function IndexSSR(req: Bun.BunRequest<"/">): Promise<Response> {
  const token = getAccessTokenFromRequest(req);
  const user = token ? verifyAccessToken<UserType>(token) : null;
  const isAuthenticated = !!user;

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