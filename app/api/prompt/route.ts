import { NextResponse } from "next/server";
import basePrompt from "@/prompts/base.md";
import reasoningPrompt from "@/prompts/base-reasoning.md";
import replicaPrompt from "@/prompts/base-replica.md";
import svgPrompt from "@/prompts/base-svg.md";
import webglPrompt from "@/prompts/base-webgl.md";
import carwashDecisionPrompt from "@/prompts/themes/carwash-decision.md";
import cheetahTrophyRunPrompt from "@/prompts/themes/cheetah-trophy-run.md";
import clickFireworksPrompt from "@/prompts/themes/click-fireworks.md";
import clockPrompt from "@/prompts/themes/clock.md";
import dataDashboardPrompt from "@/prompts/themes/data-dashboard.md";
import dslrCameraPrompt from "@/prompts/themes/dslr-camera.md";
import neonCountdownPrompt from "@/prompts/themes/neon-countdown.md";
import particleGravityPrompt from "@/prompts/themes/particle-gravity.md";
import recorderPrompt from "@/prompts/themes/recorder.md";
import schwarzschildBlackHolePrompt from "@/prompts/themes/schwarzschild-black-hole.md";
import stockPanelPrompt from "@/prompts/themes/stock-panel.md";
import weatherCardPrompt from "@/prompts/themes/weather-card.md";

const noLimitThemes = new Set(["cheetah-trophy-run"]);
const replicaThemes = new Set(["dslr-camera"]);
const webglThemes = new Set(["schwarzschild-black-hole"]);

const basePrompts: Record<string, string> = {
  "base.md": basePrompt,
  "base-reasoning.md": reasoningPrompt,
  "base-replica.md": replicaPrompt,
  "base-svg.md": svgPrompt,
  "base-webgl.md": webglPrompt
};

const themePrompts: Record<string, string> = {
  "carwash-decision": carwashDecisionPrompt,
  "cheetah-trophy-run": cheetahTrophyRunPrompt,
  "click-fireworks": clickFireworksPrompt,
  clock: clockPrompt,
  "data-dashboard": dataDashboardPrompt,
  "dslr-camera": dslrCameraPrompt,
  "neon-countdown": neonCountdownPrompt,
  "particle-gravity": particleGravityPrompt,
  recorder: recorderPrompt,
  "schwarzschild-black-hole": schwarzschildBlackHolePrompt,
  "stock-panel": stockPanelPrompt,
  "weather-card": weatherCardPrompt
};

export async function GET(request: Request) {
  const theme = new URL(request.url).searchParams.get("theme") ?? "";

  // 仅允许安全字符，防路径遍历
  if (!/^[a-z0-9-]+$/i.test(theme)) {
    return NextResponse.json({ error: "invalid theme" }, { status: 400 });
  }

  const baseFile =
    theme === "carwash-decision"
      ? "base-reasoning.md"
      : webglThemes.has(theme)
        ? "base-webgl.md"
      : replicaThemes.has(theme)
        ? "base-replica.md"
        : noLimitThemes.has(theme)
          ? "base-svg.md"
          : "base.md";

  const baseRaw = basePrompts[baseFile];
  const themeRaw = themePrompts[theme];
  if (!baseRaw || !themeRaw) {
    return NextResponse.json({ error: "theme prompt not found" }, { status: 404 });
  }

  const language =
    webglThemes.has(theme)
      ? "HTML + CSS + WebGL2 + JavaScript"
      : replicaThemes.has(theme) || noLimitThemes.has(theme)
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
}
