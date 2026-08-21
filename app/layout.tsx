import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";

import { displayFont, monoFont, sansFont } from "./fonts";
import { themeInitScript } from "./theme/themeScript";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Product Engineer Copilot",
  description:
    "A multi-agent graph that generates PRDs, user stories, experiment designs, architecture reviews, and roadmaps.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${displayFont.variable} ${sansFont.variable} ${monoFont.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
