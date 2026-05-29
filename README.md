# Model Capability Arena

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Deploy to Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel)](https://vercel.com/new/clone?repository-url=https://github.com/cclank/model-ui-arena)
[![GitHub stars](https://img.shields.io/github/stars/cclank/model-ui-arena?style=social)](https://github.com/cclank/model-ui-arena/stargazers)

A production-ready benchmarking workspace for comparing LLM capability outputs under standardized task constraints.

## 模型代码放哪里（最关键）

每个模型生成的结果都放到这个路径：

```text
public/submissions/<theme>/<model>/<submission-file>
```

例如：

```text
public/submissions/clock/gemini-3.1-pro-high/index.html
public/submissions/clock/gpt-5.3-codex/index.html
public/submissions/carwash-decision/gemini-3.1-pro-high/response.md
```

放好后会自动被页面读取并渲染（无需改前端代码）：

- 本地开发：刷新 `http://localhost:3000` 即可看到
- Vercel 线上：提交并重新部署后可见

硬性要求（按主题类型）：

- 视觉主题（`clock` / `recorder` / `weather-card` / `stock-panel` / `click-fireworks` / `neon-countdown` / `particle-gravity` / `cheetah-trophy-run` / `dslr-camera`）文件名必须是 `index.html`
- 问答主题（`carwash-decision`）文件名推荐 `response.md`（也支持 `answer.md` / `response.txt` / `answer.txt`）
- 目录名必须是已支持主题之一（`clock` / `recorder` / `weather-card` / `stock-panel` / `click-fireworks` / `neon-countdown` / `particle-gravity` / `cheetah-trophy-run` / `dslr-camera` / `carwash-decision`）
- 一个模型一个目录（目录名就是模型名）
- 反作弊：严禁查看 `public/submissions/<theme>/` 下其他模型目录；只能写入当前目标模型目录

## What This Project Solves

When comparing model outputs, most evaluations are noisy because prompts, runtime, and rendering conditions vary.
This project enforces a consistent benchmark surface so you can compare models fairly:

- Same task definitions
- Same output contract
- Same runtime container
- Side-by-side visual comparison in one page

## Core Features

- Unified benchmark dashboard (single-page comparison)
- Theme switching (Clock, Recorder, Weather Card, Stock Panel, Click Fireworks, Neon Countdown, Particle Gravity, Cheetah Trophy Run, DSLR Camera, Carwash Decision)
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
- Filesystem-based submission ingestion (`public/submissions/**`)

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
    base-svg.md                   # unlimited inline SVG task constraints
    base-replica.md               # unlimited hand-drawn replica task constraints
    full-prompts.md               # full ready-to-use prompts
    themes/
      clock.md
      recorder.md
      weather-card.md
      stock-panel.md
      click-fireworks.md
      neon-countdown.md
      particle-gravity.md
      cheetah-trophy-run.md
      dslr-camera.md
      carwash-decision.md
  public/
    submissions/
      <theme>/<model>/<submission-file> # model outputs (html or text)
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
public/submissions/<theme>/<model>/<submission-file>
```

Example:

```text
public/submissions/
  clock/
    gpt-5.3-codex/index.html
    gemini-3.1-pro-high/index.html
  carwash-decision/
    gpt-5.3-codex/response.md
    gemini-3.1-pro-high/response.md
```

The dashboard auto-loads and renders all discovered submissions.

Anti-cheating policy:
- Never read or inspect other model directories under `public/submissions/<theme>/`.
- Only write to the current target model directory.

## Benchmark Themes

- `clock`
- `recorder`
- `weather-card`
- `stock-panel`
- `click-fireworks`
- `neon-countdown`
- `particle-gravity`
- `cheetah-trophy-run`
- `dslr-camera`
- `carwash-decision`

## Prompt Workflow

### 1) Generate a complete benchmark prompt

```bash
npm run prompt -- --theme clock --model gpt-5.3-codex --max-lines 180 --language "HTML + CSS + JavaScript"
```

### 2) Send prompt to target model

Use the generated prompt text directly in your target model.

### 3) Save model output

Save the returned file into the matching submission path:

- visual themes: `index.html`
- carwash decision: `response.md` (recommended)

### 4) Refresh dashboard

The benchmark page updates from filesystem scans.

## Standard Constraint Profile (Recommended)

- Runtime: visual themes use `HTML + CSS + JavaScript`; carwash-decision is text reasoning
- File count: exactly `1` per model per theme
- Max lines: `180-220` for standard visual themes; `cheetah-trophy-run` and `dslr-camera` have no code line limit
- External dependencies: forbidden
- Mobile baseline: width `390px`

## API

### `GET /api/submissions`

Returns:

- benchmark metadata (`themes`, `constraints`)
- normalized submission list
- per-submission metrics and pass/fail state

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/cclank/model-ui-arena)

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

### `Cannot find module './xxx.js'` in `.next/server/...`

If this appears during development, it is usually a build-cache collision (for example, running `next dev` and `next build` against the same `.next` directory).

- This project isolates dev artifacts to `.next-dev` (`npm run dev`)
- Production build artifacts remain in `.next` (`npm run build` / `npm run start`)
- If needed, clean both and restart:
  - `rm -rf .next .next-dev`
  - `npm run dev`

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run prompt -- --theme <theme> --model <name> --max-lines <n>
```

## License

This project is licensed under the MIT License. See `LICENSE` for details.
