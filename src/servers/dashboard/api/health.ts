export async function Health(
  _: Bun.BunRequest<"/api/health">
): Promise<Response> {
  return Response.json({
    status: "ok",
  });
}
