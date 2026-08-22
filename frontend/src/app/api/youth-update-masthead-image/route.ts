import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GENERATOR_URL = process.env.NEXT_PUBLIC_GENERATOR_URL || "http://localhost:3000";
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("url") || "";

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(source);
  } catch {
    return NextResponse.json({ error: "Invalid image URL." }, { status: 400 });
  }

  if (!ALLOWED_PROTOCOLS.has(sourceUrl.protocol)) {
    return NextResponse.json({ error: "Unsupported image URL." }, { status: 400 });
  }

  const proxyUrl = new URL("/api/print-image", GENERATOR_URL);
  proxyUrl.searchParams.set("url", sourceUrl.toString());

  try {
    const response = await fetch(proxyUrl, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ error: `Image fetch failed with ${response.status}.` }, { status: 502 });
    }

    const bytes = await response.arrayBuffer();
    return new NextResponse(bytes, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": response.headers.get("content-type") || "application/octet-stream",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not fetch masthead image." },
      { status: 502 },
    );
  }
}
