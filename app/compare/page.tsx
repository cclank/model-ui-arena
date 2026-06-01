import { Suspense } from "react";
import { CompareView } from "@/components/compare-view";

export default function ComparePage() {
  return (
    <Suspense fallback={<main className="arena-shell"><p className="hero-sub">加载中…</p></main>}>
      <CompareView />
    </Suspense>
  );
}
