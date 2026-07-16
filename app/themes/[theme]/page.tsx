import { notFound } from "next/navigation";
import { ArenaDashboard } from "@/components/arena-dashboard";
import { THEMES } from "@/lib/submissions";

type ThemePageProps = {
  params: Promise<{
    theme: string;
  }>;
};

export function generateStaticParams() {
  return THEMES.map((theme) => ({
    theme: theme.id
  }));
}

export async function generateMetadata({ params }: ThemePageProps) {
  const { theme: themeId } = await params;
  const theme = THEMES.find((item) => item.id === themeId);

  return {
    title: theme ? `${theme.label} | Model Capability Arena` : "Model Capability Arena",
    description: theme?.objective ?? "Model capability comparison"
  };
}

export default async function ThemePage({ params }: ThemePageProps) {
  const { theme: themeId } = await params;
  const theme = THEMES.find((item) => item.id === themeId);

  if (!theme) {
    notFound();
  }

  return <ArenaDashboard initialTheme={theme.id} />;
}
