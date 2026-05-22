import { NextRequest } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8080";

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/i18n/translations/[id]/translate">,
) {
  const { id } = await ctx.params;

  const upstream = await fetch(
    `${API_BASE_URL}/i18n/translations/${encodeURIComponent(id)}/translate`,
    { method: "POST", cache: "no-store" },
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}