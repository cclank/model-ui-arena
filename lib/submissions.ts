import { Dirent, promises as fs } from "node:fs";
import path from "node:path";

export type ThemeMeta = {
  id: string;
  label: string;
  objective: string;
};

export type Submission = {
  id: string;
  theme: string;
  model: string;
  filename: string;
  publicPath: string;
  renderKind: "html" | "text";
  linesTotal: number;
  linesCss: number;
  linesJs: number;
  sizeBytes: number;
  withinLineLimit: boolean;
  updatedAt: string;
  questionText?: string;
  answerText?: string;
};

export const LINE_LIMIT = 220;

export const CARWASH_Q1 =
  "Q1: 我想去洗车，洗车店距离我家 50 米，你说我应该开车过去还是走过去？";

export const THEMES: ThemeMeta[] = [
  {
    id: "clock",
    label: "钟表",
    objective: "动画流畅度、时间准确性、视觉设计完成度"
  },
  {
    id: "recorder",
    label: "录音机",
    objective: "交互状态管理、波形/时长反馈、可用性"
  },
  {
    id: "weather-card",
    label: "天气卡片",
    objective: "信息层级、可读性、动态状态切换"
  },
  {
    id: "stock-panel",
    label: "股票展示",
    objective: "数据可视化、涨跌表达、实时感"
  },
  {
    id: "click-fireworks",
    label: "点击放烟花",
    objective: "点击交互响应、粒子动效表现、视觉冲击力"
  },
  {
    id: "carwash-decision",
    label: "开放题：洗车决策",
    objective: "单问答推理能力：直接结论 + 理由解释"
  }
];

function countInlineTagLines(html: string, tagName: "style" | "script"): number {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  let lines = 0;
  let match: RegExpExecArray | null;

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

function candidateFilesForTheme(themeId: string): string[] {
  if (themeId === "carwash-decision") {
    return ["response.md", "answer.md", "response.txt", "answer.txt", "index.html"];
  }

  return ["index.html"];
}

export async function scanSubmissions(): Promise<Submission[]> {
  const submissionsRoot = path.join(process.cwd(), "public", "submissions");

  let themeDirs: Dirent[] = [];
  try {
    themeDirs = await fs.readdir(submissionsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const output: Submission[] = [];

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

      let filename = "";
      let content = "";
      let stats: Awaited<ReturnType<typeof fs.stat>> | null = null;

      for (const candidate of candidates) {
        const absoluteFile = path.join(themePath, model, candidate);
        try {
          const [fileText, fileStats] = await Promise.all([
            fs.readFile(absoluteFile, "utf8"),
            fs.stat(absoluteFile)
          ]);
          filename = candidate;
          content = fileText;
          stats = fileStats;
          break;
        } catch {
          continue;
        }
      }

      if (!filename || !stats) {
        continue;
      }

      const isHtml = filename.toLowerCase().endsWith(".html");
      const linesTotal = content.split(/\r?\n/).length;
      const linesCss = isHtml ? countInlineTagLines(content, "style") : 0;
      const linesJs = isHtml ? countInlineTagLines(content, "script") : 0;

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
        withinLineLimit: linesTotal <= LINE_LIMIT,
        updatedAt: stats.mtime.toISOString(),
        questionText: themeId === "carwash-decision" && !isHtml ? CARWASH_Q1 : undefined,
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

  return output;
}
