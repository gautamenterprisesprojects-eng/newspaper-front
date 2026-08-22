import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GENERATOR_URL = process.env.NEXT_PUBLIC_GENERATOR_URL || "http://localhost:3000";
const ALLOWED_CATEGORIES = new Set(["Sports", "Entertainment"]);
const ALLOWED_LANGUAGES = new Set(["hindi", "english"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || "Sports";
  const language = searchParams.get("language") || "hindi";
  const limit = Math.max(1, Math.min(20, Number(searchParams.get("limit") || 8) || 8));

  if (!ALLOWED_CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Only Sports and Entertainment masthead news can be fetched here." }, { status: 400 });
  }

  if (!ALLOWED_LANGUAGES.has(language)) {
    return NextResponse.json({ error: "Unsupported language." }, { status: 400 });
  }

  const upstreamUrl = new URL("/api/newswire", GENERATOR_URL);
  upstreamUrl.searchParams.set("category", category);
  upstreamUrl.searchParams.set("language", language);
  upstreamUrl.searchParams.set("limit", String(limit));

  try {
    const response = await fetch(upstreamUrl, { cache: "no-store" });
    const text = await response.text();

    return new NextResponse(text, {
      status: response.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": response.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not fetch Youth UPDATE masthead news." },
      { status: 502 },
    );
  }
}
