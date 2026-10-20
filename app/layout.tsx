import type { Metadata } from "next";
import "./globals.css";
import "./focus.css";


export const metadata: Metadata = {
  title: "DRIVER INSIDERS - U.RAICE",
  icons: { icon: "/favicon.svg" },
  description: "Audit-ready motorsport race data visualisation and driver performance engineering.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
