import type { Metadata } from "next";
import { SvgBenchmarkShell } from "@/components/svg-benchmark-shell";

export const metadata: Metadata = {
  title: "SVG Benchmark",
  description: "Load Qoder and Claude Code SVG pages together in one comparison surface."
};

export default function SvgBenchmarkPage() {
  return <SvgBenchmarkShell />;
}
