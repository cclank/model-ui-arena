import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

const noLimitThemes = new Set(["cheetah-trophy-run"]);
const replicaThemes = new Set(["dslr-camera"]);

export async function GET(request: Request) {
  const theme = new URL(request.url).searchParams.get("theme") ?? "";

  // 仅允许安全字符，防路径遍历
  if (!/^[a-z0-9-]+$/i.test(theme)) {
    return NextResponse.json({ error: "invalid theme" }, { status: 400 });
  }

  const baseFile =
    theme === "carwash-decision"
      ? "base-reasoning.md"
      : replicaThemes.has(theme)
        ? "base-replica.md"
        : noLimitThemes.has(theme)
          ? "base-svg.md"
          : "base.md";

  const root = process.cwd();

  try {
    const [baseRaw, themeRaw] = await Promise.all([
      readFile(path.join(root, "prompts", baseFile), "utf8"),
      readFile(path.join(root, "prompts", "themes", `${theme}.md`), "utf8")
    ]);

    const language =
      replicaThemes.has(theme) || noLimitThemes.has(theme)
        ? "HTML + CSS + SVG + JavaScript"
        : "HTML + CSS + JavaScript";
    const maxLines = theme === "carwash-decision" ? "18" : "220";

    const base = baseRaw
      .replaceAll("{{LANGUAGE}}", language)
      .replaceAll("{{MAX_LINES}}", maxLines);

    return NextResponse.json({
      theme,
      baseFile,
      prompt: `${base}\n\n===== 主题要求 =====\n${themeRaw}`
    });
  } catch {
    return NextResponse.json({ error: "theme prompt not found" }, { status: 404 });
  }
}
