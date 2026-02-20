import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Model Capability Benchmark",
  description: "Benchmark model capabilities under standardized tasks and constraints in one evaluation surface."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
