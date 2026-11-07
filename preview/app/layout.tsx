import type { Metadata } from "next";
import { AppNav } from "@/components/app-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenUI generation",
  description: "Live OpenUI Lang generation for sports, rendered with the design system components.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex h-full flex-col overflow-hidden">
        <AppNav />
        <div className="min-h-0 flex-1">{children}</div>
      </body>
    </html>
  );
}
