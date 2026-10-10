import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cabin Assistant — Local vehicle AI",
  description:
    "An inspectable local vision-language assistant for learning in-vehicle AI architecture.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
