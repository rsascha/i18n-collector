const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8080";

export async function GET() {
  const upstream = await fetch(`${API_BASE_URL}/i18n/translations`, {
    cache: "no-store",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}