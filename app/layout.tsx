import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Model Capability Arena",
  description: "Benchmark model capabilities under standardized tasks and constraints in one evaluation surface.",
  icons: {
    icon: "/icon.svg"
  }
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
