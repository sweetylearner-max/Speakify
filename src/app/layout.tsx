import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Speakify · Practice public speaking with a virtual audience",
  description: "Speak to a 3D audience, get measured delivery metrics and personalised AI coaching, and watch yourself improve.",
};

export const viewport: Viewport = { themeColor: "#07051a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only-focusable btn btn-primary fixed left-3 top-3 z-50">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
