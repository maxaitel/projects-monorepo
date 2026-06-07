import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Make Image Unsettling",
  description:
    "Crush an image down to tiny pixels, then reconstruct it into an uncanny high-resolution output.",
  metadataBase: new URL("https://makeimageunsettling.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
