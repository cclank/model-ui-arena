"use client";

import Link from "next/link";

type SharePathProps = {
  theme: string;
  model: string;
  returnPath: string;
};

const RETURN_MARKER_KEY = "arena-fullscreen-return";

export function SharePath({ theme, model, returnPath }: SharePathProps) {
  const viewerPath = `/view/${encodeURIComponent(theme)}/${encodeURIComponent(model)}`;
  const href = `${viewerPath}?from=${encodeURIComponent(returnPath)}`;

  return (
    <div className="share-path">
      <Link
        href={href}
        title={`${theme} / ${model}`}
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
          }

          window.sessionStorage.setItem(
            RETURN_MARKER_KEY,
            JSON.stringify({ viewerPath, returnPath })
          );
        }}
      >
        全屏展示
      </Link>
    </div>
  );
}
