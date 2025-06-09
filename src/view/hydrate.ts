import { getAccessTokenFromRequest, verifyAccessToken } from "@utils/auth";
import { type UserType } from "@db/schema";
import Config from "@src/config";

async function HydrateRoute(req: Bun.BunRequest<"/hydrate">): Promise<Response> {
  const token = getAccessTokenFromRequest(req);
  const user = token ? verifyAccessToken<UserType>(token) : null;
  if (!user && !Config.DEBUG_BYPASS_AUTH) {
    const cookies = req.cookies;
    cookies.set("access_token", "");
  }

  // Use Bun.build to transpile the TSX to JS
  const result = await Bun.build({
    entrypoints: ["src/app/hydrate.tsx"],
    target: "browser",
    format: "esm",
    minify: false,
    splitting: false, // Ensure single bundle
  });

  if (!result.success) {
    console.error("Build errors:", result.logs);
    return new Response("Build failed", { status: 500 });
  }

  // With splitting: false, we should get exactly one output
  if (result.outputs.length !== 1) {
    console.error(`Expected 1 output, got ${result.outputs.length}`);
    return new Response("Unexpected build output", { status: 500 });
  }

  const output = result.outputs[0];

  return new Response(output, {
    headers: { "Content-Type": "application/javascript" },
  });
}

const HydrateRouteObj = {
  GET: HydrateRoute,
};

export default HydrateRouteObj;
