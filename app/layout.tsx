import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// The font variables sit on <html>: the App shell tokens live on :root and read them from there.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const description = "Create a temporary webhook capture address and inspect incoming request headers and bodies.";

export const metadata: Metadata = {
  title: "Webhook tester | Bookchaowalit",
  description,
  authors: [{ name: "Bookchaowalit", url: "https://bookchaowalit.com" }],
  creator: "Bookchaowalit",
  metadataBase: new URL("https://webhook-tester.bookchaowalit.com"),
  alternates: { canonical: "/" },
  openGraph: { type: "website", title: "Webhook tester | Bookchaowalit", description, siteName: "Bookchaowalit", url: "/" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={geistSans.variable + " " + geistMono.variable}>
      <body>{children}</body>
    </html>
  );
}
