import { readFile } from "node:fs/promises";
import path from "node:path";

const noCodeLimitThemes = new Set([
  "cheetah-trophy-run",
  "pelican-bicycle",
  "dslr-camera",
  "schwarzschild-black-hole",
  "kintsugi",
  "watch-movement"
]);
const replicaThemes = new Set(["dslr-camera"]);
const webglThemes = new Set(["schwarzschild-black-hole"]);
const creativeThemes = new Set(["kintsugi", "watch-movement"]);
// 已退役主题：不再生成题目（题目文件保留在 prompts/themes/retired/ 供查阅）
const retiredThemes = new Set(["recorder", "lunar-calendar", "sun-moon", "shadow-puppet", "ink-landscape"]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = next;
    i += 1;
  }
  return args;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const theme = args.theme ?? "clock";
  if (retiredThemes.has(theme)) {
    process.stderr.write(`theme ${theme} 已退役，不再作为测评题；题目存档见 prompts/themes/retired/${theme}.md\n`);
    process.exit(1);
  }
  const model = args.model ?? "target-model";
  const language = args.language ?? "HTML + CSS + JavaScript";
  const defaultMaxLines = theme === "carwash-decision" ? 18 : 220;
  const maxLines = Number(args["max-lines"] ?? defaultMaxLines);

  const root = process.cwd();
  const baseFile =
    theme === "carwash-decision"
      ? "base-reasoning.md"
      : webglThemes.has(theme)
        ? "base-webgl.md"
      : creativeThemes.has(theme)
        ? "base-creative.md"
      : replicaThemes.has(theme)
        ? "base-replica.md"
        : noCodeLimitThemes.has(theme)
          ? "base-svg.md"
          : "base.md";
  const basePath = path.join(root, "prompts", baseFile);
  const themePath = path.join(root, "prompts", "themes", `${theme}.md`);

  const [baseRaw, themeRaw] = await Promise.all([
    readFile(basePath, "utf8"),
    readFile(themePath, "utf8")
  ]);

  const base = baseRaw
    .replaceAll("{{LANGUAGE}}", language)
    .replaceAll("{{MAX_LINES}}", String(maxLines));

  const prompt = [
    `目标模型: ${model}`,
    `主题: ${theme}`,
    "",
    "===== 基础规则 =====",
    base,
    "",
    "===== 主题要求 =====",
    themeRaw
  ].join("\n");

  process.stdout.write(prompt + "\n");
}

run().catch((error) => {
  process.stderr.write(`prompt build failed: ${error.message}\n`);
  process.exit(1);
});
