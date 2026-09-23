import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SanaBrief — конструктор бизнес-задач",
  description:
    "Превратите идею в понятную задачу для студенческой команды AI Sana.",
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
