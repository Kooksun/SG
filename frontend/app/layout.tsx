import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockGame",
  description: "Mock stock trading simulator",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(l){if(l.search&&l.search[0]==="?"&&l.search[1]==="/"){var decoded=l.search.slice(1).split("&").map(function(s){return s.replace(/~and~/g,"&");}).join("?");window.history.replaceState(null,null,decoded+(l.hash||""));}})(window.location);`,
          }}
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
