import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSvgSandboxById, isSvgSandboxId } from "@/lib/svg-sandboxes";

export const dynamic = "force-dynamic";

function renderMissingHtml(label: string, filePath: string) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${label} 页面缺失</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Menlo, Monaco, Consolas, monospace;
        background: #0b1019;
        color: #ecf2ff;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at top, rgba(104, 216, 255, 0.18), transparent 32%),
          linear-gradient(180deg, #0b1019 0%, #121a29 100%);
      }

      article {
        width: min(680px, 100%);
        border: 1px solid rgba(104, 216, 255, 0.2);
        border-radius: 24px;
        padding: 28px;
        background: rgba(10, 15, 24, 0.88);
        box-shadow: 0 18px 60px rgba(0, 0, 0, 0.32);
      }

      h1 {
        margin: 0 0 12px;
        font-size: clamp(28px, 4vw, 40px);
      }

      p {
        margin: 0 0 12px;
        line-height: 1.7;
        color: #c8d5f4;
      }

      code {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(104, 216, 255, 0.12);
        color: #8ce3ff;
      }
    </style>
  </head>
  <body>
    <article>
      <h1>${label} 页面还没有准备好</h1>
      <p>请在下面这个文件里放入完整的 <code>index.html</code>，统一加载页就会自动读到最新内容。</p>
      <p><code>${filePath}</code></p>
    </article>
  </body>
</html>`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;

  if (!isSvgSandboxId(name)) {
    return NextResponse.json({ error: "Unknown sandbox" }, { status: 404 });
  }

  const sandbox = getSvgSandboxById(name);
  const filePath = path.join(process.cwd(), sandbox.directory, "index.html");

  try {
    const html = await fs.readFile(filePath, "utf8");

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return new NextResponse(renderMissingHtml(sandbox.label, `${sandbox.directory}/index.html`), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }
}
