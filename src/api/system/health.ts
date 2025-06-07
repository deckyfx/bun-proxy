export async function Health(
  _: Bun.BunRequest<"/api/:scope/:command">
): Promise<Response> {
  return Response.json({
    status: "ok",
  });
}

export default {
  health: { GET: Health },
};
