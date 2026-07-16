"use client";

import { useRouter } from "next/navigation";

type FullscreenViewerProps = {
  src: string;
  themeLabel: string;
  model: string;
  returnPath: string;
};

const RETURN_MARKER_KEY = "arena-fullscreen-return";

export function FullscreenViewer({
  src,
  themeLabel,
  model,
  returnPath
}: FullscreenViewerProps) {
  const router = useRouter();

  const goBack = () => {
    let useHistory = false;

    try {
      const marker = JSON.parse(window.sessionStorage.getItem(RETURN_MARKER_KEY) ?? "null") as {
        viewerPath?: string;
        returnPath?: string;
      } | null;
      useHistory = marker?.viewerPath === window.location.pathname &&
        marker?.returnPath === returnPath;
      window.sessionStorage.removeItem(RETURN_MARKER_KEY);
    } catch {
      window.sessionStorage.removeItem(RETURN_MARKER_KEY);
    }

    if (useHistory) {
      router.back();
      return;
    }

    router.push(returnPath);
  };

  return (
    <main className="fullscreen-shell">
      <header className="fullscreen-toolbar">
        <button type="button" className="fullscreen-back" onClick={goBack}>
          返回
        </button>
        <p className="fullscreen-title" title={`${themeLabel} / ${model}`}>
          {themeLabel} / <strong>{model}</strong>
        </p>
      </header>
      <iframe
        className="fullscreen-frame"
        src={src}
        title={`${themeLabel}-${model}`}
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-pointer-lock"
        allow="camera; microphone; fullscreen"
        allowFullScreen
      />
    </main>
  );
}
