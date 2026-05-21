import { NextRequest } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8080";

function upstreamUrl(lng: string, ns: string) {
  return `${API_BASE_URL}/i18n/${encodeURIComponent(lng)}/${encodeURIComponent(ns)}`;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/i18n/[lng]/[ns]">,
) {
  const { lng, ns } = await ctx.params;
  const upstream = await fetch(upstreamUrl(lng, ns), { cache: "no-store" });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/i18n/[lng]/[ns]">,
) {
  const { lng, ns } = await ctx.params;
  const body = await req.text();

  const upstream = await fetch(upstreamUrl(lng, ns), {
    method: "POST",
    headers: { "content-type": req.headers.get("content-type") ?? "application/json" },
    body,
  });

  return new Response(null, { status: upstream.status });
}