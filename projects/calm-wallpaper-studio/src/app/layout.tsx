import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calm Wallpaper Studio",
  description: "A local procedural wallpaper generator for quiet, calming desktop and phone backgrounds."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
