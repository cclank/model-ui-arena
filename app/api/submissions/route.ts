import { NextResponse } from "next/server";
import { LINE_LIMIT, THEMES, scanSubmissions } from "@/lib/submissions";

export async function GET() {
  const submissions = await scanSubmissions();

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    constraints: {
      maxLines: LINE_LIMIT,
      runtime: "Mixed: visual themes use index.html; carwash-decision supports text answers (response.md/answer.md)"
    },
    themes: THEMES,
    submissions
  });
}
