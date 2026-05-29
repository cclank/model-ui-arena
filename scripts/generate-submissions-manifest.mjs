import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const submissionsRoot = path.join(projectRoot, "public", "submissions");
const outputFile = path.join(projectRoot, "lib", "generated-submissions.json");
const lineLimit = 220;
const unlimitedLineThemes = new Set(["cheetah-trophy-run", "dslr-camera"]);
const carwashQuestion =
  "Q1: 我想去洗车，洗车店距离我家 50 米，你说我应该开车过去还是走过去？";

function countInlineTagLines(html, tagName) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  let lines = 0;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const content = match[1] ?? "";
    const trimmed = content.trim();
    if (!trimmed) {
      continue;
    }
    lines += trimmed.split(/\r?\n/).length;
  }

  return lines;
}

function candidateFilesForTheme(themeId) {
  if (themeId === "carwash-decision") {
    return ["response.md", "answer.md", "response.txt", "answer.txt", "index.html"];
  }

  return ["index.html"];
}

function usesBitmapAsset(content) {
  if (/<img\b/i.test(content)) {
    return true;
  }
  if (/data:image\//i.test(content)) {
    return true;
  }
  if (/url\(\s*['"]?[^'")]+\.(?:png|jpe?g|gif|webp|bmp|avif)\b/i.test(content)) {
    return true;
  }
  return false;
}

async function tryReadSubmission(themePath, model, candidate) {
  const absoluteFile = path.join(themePath, model, candidate);

  try {
    const [content, stats] = await Promise.all([
      fs.readFile(absoluteFile, "utf8"),
      fs.stat(absoluteFile)
    ]);
    return { filename: candidate, content, stats };
  } catch {
    return null;
  }
}

async function generateManifest() {
  let themeDirs = [];

  try {
    themeDirs = await fs.readdir(submissionsRoot, { withFileTypes: true });
  } catch {
    await fs.writeFile(outputFile, "[]\n");
    return;
  }

  const output = [];

  for (const themeDir of themeDirs) {
    if (!themeDir.isDirectory()) {
      continue;
    }

    const themeId = themeDir.name;
    const themePath = path.join(submissionsRoot, themeId);
    const modelDirs = await fs.readdir(themePath, { withFileTypes: true });

    for (const modelDir of modelDirs) {
      if (!modelDir.isDirectory()) {
        continue;
      }

      const model = modelDir.name;
      const candidates = candidateFilesForTheme(themeId);
      let submission = null;

      for (const candidate of candidates) {
        submission = await tryReadSubmission(themePath, model, candidate);
        if (submission) {
          break;
        }
      }

      if (!submission) {
        continue;
      }

      const { filename, content, stats } = submission;
      const isHtml = filename.toLowerCase().endsWith(".html");
      const linesTotal = content.split(/\r?\n/).length;
      const linesCss = isHtml ? countInlineTagLines(content, "style") : 0;
      const linesJs = isHtml ? countInlineTagLines(content, "script") : 0;
      const unlimitedLines = unlimitedLineThemes.has(themeId);
      const usesBitmap = isHtml ? usesBitmapAsset(content) : false;

      output.push({
        id: `${themeId}:${model}`,
        theme: themeId,
        model,
        filename,
        publicPath: `/submissions/${themeId}/${model}/${filename}`,
        renderKind: isHtml ? "html" : "text",
        linesTotal,
        linesCss,
        linesJs,
        sizeBytes: stats.size,
        withinLineLimit: unlimitedLines || linesTotal <= lineLimit,
        unlimitedLines,
        usesBitmap,
        updatedAt: stats.mtime.toISOString(),
        questionText: themeId === "carwash-decision" && !isHtml ? carwashQuestion : undefined,
        answerText: !isHtml ? content.trim() : undefined
      });
    }
  }

  output.sort((a, b) => {
    if (a.theme !== b.theme) {
      return a.theme.localeCompare(b.theme);
    }
    return a.model.localeCompare(b.model);
  });

  await fs.writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`);
}

await generateManifest();
