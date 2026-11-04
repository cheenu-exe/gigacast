import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "GigaCast — Global Live TV",
  description: "Explore and watch live TV streams from around the world.",
  applicationName: "GigaCast",
  icons: {
    icon: [{ url: "/favicon.jpg", type: "image/jpeg", sizes: "64x64" }],
    shortcut: "/favicon.jpg",
  },
};

export const viewport: Viewport = {
  themeColor: "#090b10",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
