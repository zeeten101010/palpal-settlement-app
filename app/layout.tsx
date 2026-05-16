import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "팔팔너구리해장 월결산",
  description: "식당 손익 확인용 월결산 웹앱"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
