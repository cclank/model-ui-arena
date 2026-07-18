# Model Capability Arena - Agent Skill Contract

This file defines how an agent should implement benchmark tasks in this repository.
If an agent sees this file, it should follow these rules by default.

## 1. Goal

Build and submit model outputs under a unified benchmark contract, then make results auto-render in the dashboard.

## 2. Supported Modes

### Mode A: Full Batch (全部实现)

Use this mode when user asks for "全部", "all themes", "全量" or equivalent.

Required themes:
1. `clock`
2. `recorder`
3. `weather-card`
4. `stock-panel`
5. `click-fireworks`
6. `neon-countdown`
7. `particle-gravity`
8. `cheetah-trophy-run`
9. `dslr-camera`
10. `schwarzschild-black-hole`
11. `carwash-decision`

For each requested model, agent must generate and save one submission per theme.

### Mode B: Single Custom (单个自定义实现)

Use this mode when user asks for one specific theme, one specific question, or a custom task.

Required inputs:
1. `target_theme` (existing or custom)
2. `model_name`
3. `task_text` (if custom)

Only generate and save the requested theme/task.

## 3. Submission File Contract

All outputs must be saved under:

`public/submissions/<theme>/<model>/`

### Visual themes

Themes:
1. `clock`
2. `recorder`
3. `weather-card`
4. `stock-panel`
5. `click-fireworks`
6. `neon-countdown`
7. `particle-gravity`
8. `cheetah-trophy-run`
9. `dslr-camera`
10. `schwarzschild-black-hole`

File name must be:

`index.html`

### Reasoning theme

Theme:
1. `carwash-decision`

Recommended file name:

`response.md`

Also supported:
1. `answer.md`
2. `response.txt`
3. `answer.txt`

## 4. Prompt Rules

### Visual themes prompt base

Use:
1. `prompts/base.md`
2. `prompts/themes/<theme>.md`

Generation command:

```bash
npm run prompt -- --theme <theme> --model <model_name> --max-lines <N> --language "HTML + CSS + JavaScript"
```

### Unlimited SVG theme prompt base

Use this for `cheetah-trophy-run`:
1. `prompts/base-svg.md`
2. `prompts/themes/cheetah-trophy-run.md`

Generation command:

```bash
npm run prompt -- --theme cheetah-trophy-run --model <model_name> --language "HTML + CSS + SVG + JavaScript"
```

### Replica theme prompt base (拟物复刻)

Use this for `dslr-camera` (and future replica tasks):
1. `prompts/base-replica.md`
2. `prompts/themes/dslr-camera.md`

No line limit. Anti-cheat is the core of this task type: the object must be hand-drawn with HTML + CSS + inline SVG only; no `<img>`, base64 / `data:` images, `<canvas>` bitmaps, emoji, or ready-made SVG/icon assets.

Generation command:

```bash
npm run prompt -- --theme dslr-camera --model <model_name> --language "HTML + CSS + SVG + JavaScript"
```

### Reasoning theme prompt base

Use:
1. `prompts/base-reasoning.md`
2. `prompts/themes/carwash-decision.md`

Generation command:

```bash
npm run prompt -- --theme carwash-decision --model <model_name>
```

### Physics WebGL theme prompt base

Use this for `schwarzschild-black-hole`:
1. `prompts/base-webgl.md`
2. `prompts/themes/schwarzschild-black-hole.md`

No line limit. The core requirements are fragment-shader null-geodesic integration, relativistic disk emission, a multi-pass HDR pipeline, responsive interaction, adaptive quality, and explicit failure states.

Generation command:

```bash
npm run prompt -- --theme schwarzschild-black-hole --model <model_name> --language "HTML + CSS + WebGL2 + JavaScript"
```

## 5. Constraint Defaults

### Visual themes

1. Single file: `index.html`
2. No external dependencies
3. Responsive at mobile width `390px`
4. Default line limit: `<= 220` (or as user specifies)

### Unlimited SVG theme

1. Theme: `cheetah-trophy-run`
2. Single file: `index.html`
3. Main artwork must be inline SVG
4. No code line limit, prioritize best visual effect and semantic detail

### Replica theme (拟物复刻)

1. Theme: `dslr-camera`
2. Single file: `index.html`
3. No code line limit; draw the object as realistically as possible
4. Anti-cheat (scored 0 if violated): no `<img>`, base64 / `data:` images, `<canvas>` bitmaps, emoji, or ready-made SVG/icon assets. The object must be hand-drawn with HTML + CSS + inline SVG shapes
5. Dashboard shows a 手绘 / 贴图 badge from automatic bitmap detection

### Reasoning theme

1. Text only
2. No code block output
3. Clear decision + reasons + action suggestion
4. Default line limit from prompt template

### Physics WebGL theme

1. Theme: `schwarzschild-black-hole`
2. Single file: `index.html`
3. No code line limit; preserve the complete numerical integrator, HDR passes, interaction, adaptive quality, and error handling
4. Zero dependencies and zero external assets; the file must run by double-clicking it
5. Geodesic bending must be produced by fragment-shader numerical integration, never by screen-space lens distortion

## 6. Render Behavior (Already Implemented)

The dashboard auto-renders based on file type:
1. `index.html` -> iframe preview
2. `response.md/.txt` -> Q&A text card

No frontend code changes are required if file contract is followed.

## 7. Required Agent Workflow

1. Identify mode: full batch or single custom.
2. Build prompt(s) using existing prompt scripts/templates.
3. Generate submission content for each required model/theme.
4. Before saving, clear the target directory if the same model already exists:
   - target: `public/submissions/<theme>/<model>/`
   - delete existing files in that directory only
   - do not delete sibling model directories
5. Save files to the exact submission path contract.
6. Validate with:
   - `npm run build`
   - Open `/api/submissions` and confirm entries exist.
7. Report saved paths and pass/fail status.

## 8. Validation Checklist

Before finishing, agent must confirm:
1. Every expected file exists under `public/submissions/...`
2. Theme/model names are correct and consistent
3. Visual themes use `index.html`
4. Reasoning theme uses text submission file
5. Dashboard lists new submissions

## 9. Examples

### Example A: Full batch for one model

Target model: `gpt-5.3-codex`

Create:
1. `public/submissions/clock/gpt-5.3-codex/index.html`
2. `public/submissions/recorder/gpt-5.3-codex/index.html`
3. `public/submissions/weather-card/gpt-5.3-codex/index.html`
4. `public/submissions/stock-panel/gpt-5.3-codex/index.html`
5. `public/submissions/click-fireworks/gpt-5.3-codex/index.html`
6. `public/submissions/neon-countdown/gpt-5.3-codex/index.html`
7. `public/submissions/particle-gravity/gpt-5.3-codex/index.html`
8. `public/submissions/cheetah-trophy-run/gpt-5.3-codex/index.html`
9. `public/submissions/dslr-camera/gpt-5.3-codex/index.html`
10. `public/submissions/schwarzschild-black-hole/gpt-5.3-codex/index.html`
11. `public/submissions/carwash-decision/gpt-5.3-codex/response.md`

### Example B: Single custom reasoning task

If user asks only one question task, create only:
1. `public/submissions/<custom-theme>/<model>/response.md`

If `<custom-theme>` is new, agent should:
1. ask user to confirm new theme id, or
2. reuse `carwash-decision` when it semantically matches.

## 10. Non-Negotiable Rules

1. Do not change existing unrelated submissions.
2. Do not rename themes without user approval.
3. Do not introduce build-time dependencies for submissions.
4. Keep outputs deterministic and reproducible.
5. If overwriting same model output, clear only `public/submissions/<theme>/<model>/` before writing new files.
6. Anti-cheating rule: never read or inspect other model directories under `public/submissions/<theme>/`; only write to the current target model directory.
7. Replica anti-cheat (`dslr-camera` and replica tasks): hand-draw with HTML + CSS + inline SVG only; no `<img>`, base64 / `data:` images, `<canvas>` bitmaps, emoji, or ready-made SVG/icon assets. Submissions using bitmaps are flagged 贴图 in the dashboard.
8. Physics WebGL anti-cheat (`schwarzschild-black-hole`): lensing must come from numerical null-geodesic integration inside the fragment shader; screen-space distortion or handcrafted photon rings are disqualifying.
