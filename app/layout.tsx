import type { Metadata } from "next";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "./globals.css";
import "./workspace.css";
import "./results.css";
export const metadata: Metadata = { title: "Improvexus | Upwork Profile Audit", description: "Explore the Improvexus profile audit workspace, inspect sample findings, and download branded PDF or Word reports.", icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" } };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body className="antialiased">{children}</body></html>; }
