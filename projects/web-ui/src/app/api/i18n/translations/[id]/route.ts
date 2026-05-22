import { NextRequest } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8080";

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/i18n/translations/[id]">,
) {
  const { id } = await ctx.params;
  const body = await req.text();

  const upstream = await fetch(
    `${API_BASE_URL}/i18n/translations/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
    },
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/i18n/translations/[id]">,
) {
  const { id } = await ctx.params;

  const upstream = await fetch(
    `${API_BASE_URL}/i18n/translations/${encodeURIComponent(id)}`,
    { method: "DELETE", cache: "no-store" },
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}