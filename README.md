# Model Capability Benchmark

A production-ready benchmarking workspace for comparing LLM capability outputs under standardized task constraints.

## 模型代码放哪里（最关键）

每个模型生成的代码都放到这个路径：

```text
public/submissions/<theme>/<model>/index.html
```

例如：

```text
public/submissions/clock/claude-3.7/index.html
public/submissions/clock/gpt-4.1/index.html
public/submissions/weather-card/gemini-2.0-flash/index.html
```

放好后会自动被页面读取并渲染（无需改前端代码）：

- 本地开发：刷新 `http://localhost:3000` 即可看到
- Vercel 线上：提交并重新部署后可见

硬性要求：

- 文件名必须是 `index.html`
- 目录名必须是已支持主题之一（`clock` / `recorder` / `weather-card` / `stock-panel` / `carwash-decision`）
- 一个模型一个目录（目录名就是模型名）

## What This Project Solves

When comparing model outputs, most evaluations are noisy because prompts, runtime, and rendering conditions vary.
This project enforces a consistent benchmark surface so you can compare models fairly:

- Same task definitions
- Same output contract
- Same runtime container
- Side-by-side visual comparison in one page

## Core Features

- Unified benchmark dashboard (single-page comparison)
- Theme switching (Clock, Recorder, Weather Card, Stock Panel, Carwash Decision)
- Model filtering (multi-select)
- Automatic submission discovery from filesystem
- Constraint inspection per submission:
  - total lines
  - CSS lines
  - JS lines
  - line-limit pass/fail
- Reusable prompt templates with hard constraints
- One-command prompt generator
- Vercel-ready Next.js deployment

## Tech Stack

- Next.js (App Router)
- React + TypeScript
- Filesystem-based submission ingestion (`public/submissions/**/index.html`)

## Project Structure

```text
model-ui-arena/
  app/
    api/submissions/route.ts      # API endpoint: scan + aggregate submissions
    globals.css
    layout.tsx
    page.tsx
  components/
    arena-dashboard.tsx           # comparison UI
  lib/
    submissions.ts                # scanner + metrics + theme metadata
  prompts/
    base.md                       # shared hard constraints
    full-prompts.md               # full ready-to-use prompts
    themes/
      clock.md
      recorder.md
      weather-card.md
      stock-panel.md
      carwash-decision.md
  public/
    submissions/
      <theme>/<model>/index.html # model outputs
  scripts/
    build-prompt.mjs              # prompt composer CLI
```

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Submission Contract

Every model output must be stored as:

```text
public/submissions/<theme>/<model>/index.html
```

Example:

```text
public/submissions/
  clock/
    claude-3.7/index.html
    gpt-4.1/index.html
    gemini-2.0-flash/index.html
```

The dashboard auto-loads and renders all discovered submissions.

## Benchmark Themes

- `clock`
- `recorder`
- `weather-card`
- `stock-panel`
- `carwash-decision`

## Prompt Workflow

### 1) Generate a complete benchmark prompt

```bash
npm run prompt -- --theme clock --model claude-3.7 --max-lines 180 --language "HTML + CSS + JavaScript"
```

### 2) Send prompt to target model

Use the generated prompt text directly in your target model.

### 3) Save model output

Save the returned `index.html` into the matching submission path.

### 4) Refresh dashboard

The benchmark page updates from filesystem scans.

## Standard Constraint Profile (Recommended)

- Runtime: `HTML + CSS + JavaScript`
- File count: exactly `1` (`index.html`)
- Max lines: `180-220` (adjust by pressure level)
- External dependencies: forbidden
- Mobile baseline: width `390px`

## API

### `GET /api/submissions`

Returns:

- benchmark metadata (`themes`, `constraints`)
- normalized submission list
- per-submission metrics and pass/fail state

## Deploy to Vercel

1. Push repository to GitHub
2. Import into Vercel
3. Framework preset: Next.js
4. Deploy

After each submission update, redeploy to publish latest benchmark results.

## Troubleshooting

### Hydration warning in browser console

If you see hydration mismatch with injected attributes (e.g. theme/class attributes), this is usually caused by browser extensions mutating DOM before React hydration.

- Try Incognito mode (without extensions)
- Hard refresh (`Cmd + Shift + R`)

The layout already includes hydration-warning suppression on root nodes to reduce noisy extension-induced warnings.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run prompt -- --theme <theme> --model <name> --max-lines <n>
```

## License

Add your preferred license before public distribution.
