import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenUI generation",
  description: "Live OpenUI Lang generation for sports, rendered with the Kino components.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
