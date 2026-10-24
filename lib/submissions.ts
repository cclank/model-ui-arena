import { Dirent, promises as fs } from "node:fs";
import path from "node:path";
import generatedSubmissions from "@/lib/generated-submissions.json";
import { compareModels } from "@/lib/model-order";

export type ThemeMeta = {
  id: string;
  label: string;
  objective: string;
  /** 主要考察的关键词（如「计算」「审美」），大字展示在主题页与任务页 */
  focus?: string[];
  /** 主要考察的一句小字说明 */
  focusNote?: string;
  /** 已退役：页面与接口隐藏、不再生成题目；历史提交保留在 public/submissions/<id>/ 下 */
  retired?: boolean;
};

export type Submission = {
  id: string;
  theme: string;
  model: string;
  filename: string;
  path: string;
  publicPath: string;
  renderKind: "html" | "text";
  linesTotal: number;
  linesCss: number;
  linesJs: number;
  sizeBytes: number;
  withinLineLimit: boolean;
  unlimitedLines?: boolean;
  usesBitmap?: boolean;
  updatedAt: string;
  questionText?: string;
  answerText?: string;
};

export const LINE_LIMIT = 220;

export const UNLIMITED_LINE_THEMES = new Set<string>([
  "cheetah-trophy-run",
  "pelican-bicycle",
  "dslr-camera",
  "schwarzschild-black-hole",
  "kintsugi",
  "watch-movement"
]);

export const BITMAP_AUDIT_THEMES = new Set<string>(["cheetah-trophy-run", "pelican-bicycle", "dslr-camera"]);

export const CARWASH_Q1 =
  "Q1: 我想去洗车，洗车店距离我家 50 米，你说我应该开车过去还是走过去？";

const ALL_THEMES: ThemeMeta[] = [
  {
    id: "clock",
    label: "钟表",
    objective: "动画流畅度、时间准确性、视觉设计完成度"
  },
  {
    id: "recorder",
    retired: true,
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
    id: "neon-countdown",
    label: "最炫倒计时",
    objective: "时间状态表达、节奏动效、结束瞬间爆发、数字可读性"
  },
  {
    id: "particle-gravity",
    label: "粒子引力场",
    objective: "粒子物理、交互反馈、性能稳定性、视觉冲击力"
  },
  {
    id: "lunar-calendar",
    retired: true,
    label: "农历日历",
    objective: "算得对、看得清、做得美：首个可自动判分的视觉题",
    focus: ["计算", "审美"],
    focusNote: "计算：农历、闰月、节气必须算对，脚本自动判分；审美：卡片是否精美，人工评审。"
  },
  {
    id: "sun-moon",
    retired: true,
    label: "日出日落与月相",
    objective: "算得对、画得美：天文算法正确性 + 天穹与月相盘的视觉表达",
    focus: ["计算", "审美"],
    focusNote: "计算：日出日落 ±2 分钟、月相名与照亮比例必须算对，脚本自动判分；审美：天穹弧线与月相盘是否动人，人工评审。"
  },
  {
    id: "cheetah-trophy-run",
    label: "猎豹举杯冲刺",
    objective: "SVG 造型、足球冠军叙事、奔跑动势、细节理解"
  },
  {
    id: "pelican-bicycle",
    label: "鹈鹕骑自行车",
    objective: "经典 SVG 基准题的动态版：画得像，还得动得对",
    focus: ["造型", "动态"],
    focusNote: "造型：鹈鹕解剖与自行车结构是否一眼认出、比例正确；动态：蹬踏、车轮、场景滚动是否同步且无缝循环，人工评审。"
  },
  {
    id: "dslr-camera",
    label: "拟物相机",
    objective: "拟物复刻：结构透视、材质光影、细节还原、纯手绘无贴图"
  },
  {
    id: "schwarzschild-black-hole",
    label: "施瓦西黑洞",
    objective: "真实测地线积分、相对论吸积盘、多重像、HDR 后期与交互性能"
  },
  {
    id: "kintsugi",
    label: "金缮",
    objective: "碎裂、坠落、归位、鎏金：一只会自我修复的青瓷碗",
    focus: ["算法", "意境"],
    focusNote: "算法：裂纹必须实时随机生成、碎片拼回原碗、坠落真实；意境：碎裂到修复的节奏与金线之美，人工评审。"
  },
  {
    id: "watch-movement",
    label: "机芯",
    objective: "一只能上弦、能调时、拨一个齿轮全表联动的怀表机芯",
    focus: ["机械", "质感"],
    focusNote: "机械：齿数、传动比、擒纵节拍全部自洽，小秒针随摆轮节拍跳动，错一处即打齿；质感：金属、宝石与打磨纹理，人工评审。"
  },
  {
    id: "shadow-puppet",
    retired: true,
    label: "皮影戏",
    objective: "《硅谷论剑 · Sam 大战 Dario》：光影由真实投影算出的皮影斗法",
    focus: ["光影", "骨骼"],
    focusNote: "光影：离幕越远影子越大越虚、移灯时影子反向走，必须由投影算出；骨骼：签子驱动，四肢随重力摆动。演出与镂空质感人工评审。"
  },
  {
    id: "ink-landscape",
    retired: true,
    label: "山水长卷",
    objective: "一卷无限展开、会呼吸的水墨山水，每个卷号都是一幅新画",
    focus: ["构图", "笔墨"],
    focusNote: "构图：三远分层、疏密开合，无限生成且同一卷号处处一致；笔墨：皴法顺势、树分品类、云雾留白，人工评审。"
  },
  {
    id: "carwash-decision",
    label: "开放题：洗车决策",
    objective: "单问答推理能力：直接结论 + 理由解释"
  }
];

export const RETIRED_THEMES = new Set(ALL_THEMES.filter((theme) => theme.retired).map((theme) => theme.id));
export const THEMES: ThemeMeta[] = ALL_THEMES.filter((theme) => !theme.retired);

const THEME_ORDER = new Map(THEMES.map((theme, index) => [theme.id, index]));
const SUPPORTED_THEME_IDS = new Set(THEMES.map((theme) => theme.id));

function sharePathForSubmission(themeId: string, model: string, filename: string): string {
  const base = `/submissions/${themeId}/${model}`;
  return filename.toLowerCase() === "index.html" ? `${base}/` : `${base}/${filename}`;
}

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

function usesBitmapAsset(content: string): boolean {
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

function candidateFilesForTheme(themeId: string): string[] {
  if (themeId === "carwash-decision") {
    return ["response.md", "answer.md", "response.txt", "answer.txt", "index.html"];
  }

  return ["index.html"];
}

async function scanFilesystemSubmissions(): Promise<Submission[]> {
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
    if (!SUPPORTED_THEME_IDS.has(themeId)) {
      continue;
    }

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
      const unlimitedLines = UNLIMITED_LINE_THEMES.has(themeId);
      const usesBitmap = isHtml ? usesBitmapAsset(content) : false;

      output.push({
        id: `${themeId}:${model}`,
        theme: themeId,
        model,
        filename,
        path: sharePathForSubmission(themeId, model, filename),
        publicPath: `/submissions/${themeId}/${model}/${filename}`,
        renderKind: isHtml ? "html" : "text",
        linesTotal,
        linesCss,
        linesJs,
        sizeBytes: stats.size,
        withinLineLimit: unlimitedLines ? true : linesTotal <= LINE_LIMIT,
        unlimitedLines,
        usesBitmap,
        updatedAt: stats.mtime.toISOString(),
        questionText: themeId === "carwash-decision" && !isHtml ? CARWASH_Q1 : undefined,
        answerText: !isHtml ? content.trim() : undefined
      });
    }
  }

  output.sort((a, b) => {
    const themeDelta =
      (THEME_ORDER.get(a.theme) ?? Number.MAX_SAFE_INTEGER) -
      (THEME_ORDER.get(b.theme) ?? Number.MAX_SAFE_INTEGER);
    if (themeDelta !== 0) {
      return themeDelta;
    }
    return compareModels(a.model, b.model);
  });

  return output;
}

export async function scanSubmissions(): Promise<Submission[]> {
  const filesystemSubmissions = await scanFilesystemSubmissions();

  if (filesystemSubmissions.length > 0) {
    return filesystemSubmissions;
  }

  return generatedSubmissions as Submission[];
}
