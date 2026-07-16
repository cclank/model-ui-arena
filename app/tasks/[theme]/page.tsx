import Link from "next/link";
import { notFound } from "next/navigation";
import { PreviewFrame } from "@/components/preview-frame";
import { SharePath } from "@/components/share-path";
import { LINE_LIMIT, THEMES, UNLIMITED_LINE_THEMES, scanSubmissions } from "@/lib/submissions";
import { sortSubmissionsByModel } from "@/lib/model-order";

type TaskPageProps = {
  params: Promise<{
    theme: string;
  }>;
};

export async function generateStaticParams() {
  return THEMES.map((theme) => ({
    theme: theme.id
  }));
}

export async function generateMetadata({ params }: TaskPageProps) {
  const { theme: themeId } = await params;
  const theme = THEMES.find((item) => item.id === themeId);

  return {
    title: theme ? `${theme.label} Task` : "Task",
    description: theme?.objective ?? "Model Capability Arena task page"
  };
}

export default async function TaskPage({ params }: TaskPageProps) {
  const { theme: themeId } = await params;
  const theme = THEMES.find((item) => item.id === themeId);

  if (!theme) {
    notFound();
  }

  const submissions = sortSubmissionsByModel(
    (await scanSubmissions()).filter((item) => item.theme === theme.id)
  );
  const passCount = submissions.filter((item) => item.withinLineLimit).length;

  return (
    <main className="task-shell">
      <header className="task-hero">
        <Link href={`/themes/${theme.id}`} className="task-back">
          返回 Arena
        </Link>
        <p className="hero-kicker">Task Page</p>
        <h1 className="task-title">{theme.label}</h1>
        <p className="task-objective">{theme.objective}</p>
        <div className="task-stats">
          <span>主题 ID：{theme.id}</span>
          <span>作品数：{submissions.length}</span>
          <span>通过：{passCount}</span>
          <span>行数上限：{UNLIMITED_LINE_THEMES.has(theme.id) ? "不限" : LINE_LIMIT}</span>
        </div>
      </header>

      <section className="task-grid">
        {submissions.map((item) => (
          <article className="panel task-card" key={item.id}>
            <div className="card-top">
              <div>
                <h2>{item.model}</h2>
                <p className="meta">{item.filename}</p>
              </div>
              {item.unlimitedLines ? (
                <span className={item.usesBitmap ? "badge bad" : "badge ok"}>
                  {item.usesBitmap ? "贴图" : "手绘"}
                </span>
              ) : (
                <span className={item.withinLineLimit ? "badge ok" : "badge bad"}>
                  {item.withinLineLimit ? "PASS" : "OVER"}
                </span>
              )}
            </div>

            <div className="metrics">
              <span>Total: {item.linesTotal} lines</span>
              {item.renderKind === "html" ? <span>CSS: {item.linesCss}</span> : <span>Mode: text</span>}
              {item.renderKind === "html" ? <span>JS: {item.linesJs}</span> : <span>Type: reasoning</span>}
              <span>{Math.round(item.sizeBytes / 1024)} KB</span>
            </div>

            {item.renderKind === "html" ? (
              <PreviewFrame
                className="task-preview"
                src={item.publicPath}
                title={`${item.theme}-${item.model}`}
                loading="lazy"
              />
            ) : (
              <div className="qa-preview">
                <p className="qa-label">Question</p>
                <p className="qa-question">{item.questionText ?? "N/A"}</p>
                <p className="qa-label">Answer</p>
                <pre className="qa-answer">{item.answerText || "(empty answer)"}</pre>
              </div>
            )}

            <SharePath
              theme={item.theme}
              model={item.model}
              returnPath={`/tasks/${theme.id}`}
            />
          </article>
        ))}
      </section>
    </main>
  );
}
