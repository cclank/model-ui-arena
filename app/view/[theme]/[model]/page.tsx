import { notFound } from "next/navigation";
import { FullscreenViewer } from "@/components/fullscreen-viewer";
import { scanSubmissions, THEMES } from "@/lib/submissions";

type FullscreenPageProps = {
  params: Promise<{
    theme: string;
    model: string;
  }>;
  searchParams: Promise<{
    from?: string | string[];
  }>;
};

function safeReturnPath(value: string | string[] | undefined, fallback: string) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/") && !candidate.startsWith("//") ? candidate : fallback;
}

export async function generateMetadata({ params }: FullscreenPageProps) {
  const { theme: themeId, model } = await params;
  const theme = THEMES.find((item) => item.id === themeId);

  return {
    title: `${model} | ${theme?.label ?? themeId}`,
    description: `Full-screen submission for ${model}`
  };
}

export default async function FullscreenPage({ params, searchParams }: FullscreenPageProps) {
  const [{ theme: themeId, model }, query, submissions] = await Promise.all([
    params,
    searchParams,
    scanSubmissions()
  ]);
  const theme = THEMES.find((item) => item.id === themeId);
  const submission = submissions.find(
    (item) => item.theme === themeId && item.model === model
  );

  if (!theme || !submission) {
    notFound();
  }

  const returnPath = safeReturnPath(query.from, `/themes/${theme.id}`);

  return (
    <FullscreenViewer
      src={submission.publicPath}
      themeLabel={theme.label}
      model={submission.model}
      returnPath={returnPath}
    />
  );
}
