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
  linesTotal: number;
  linesCss: number;
  linesJs: number;
  sizeBytes: number;
  withinLineLimit: boolean;
  updatedAt: string;
};

export const LINE_LIMIT = 220;

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
    id: "carwash-decision",
    label: "开放题：洗车决策",
    objective: "问题建模、决策解释性、交互引导"
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
      const filename = "index.html";
      const absoluteFile = path.join(themePath, model, filename);

      try {
        const [html, stats] = await Promise.all([
          fs.readFile(absoluteFile, "utf8"),
          fs.stat(absoluteFile)
        ]);

        const linesTotal = html.split(/\r?\n/).length;
        const linesCss = countInlineTagLines(html, "style");
        const linesJs = countInlineTagLines(html, "script");

        output.push({
          id: `${themeId}:${model}`,
          theme: themeId,
          model,
          filename,
          publicPath: `/submissions/${themeId}/${model}/${filename}`,
          linesTotal,
          linesCss,
          linesJs,
          sizeBytes: stats.size,
          withinLineLimit: linesTotal <= LINE_LIMIT,
          updatedAt: stats.mtime.toISOString()
        });
      } catch {
        continue;
      }
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
