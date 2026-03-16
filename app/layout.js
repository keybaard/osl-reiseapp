import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "OSL Reisehjelper",
  description: "Planlegg reisen til Oslo Lufthavn",
};

export default function RootLayout({ children }) {
  return (
    <html lang="no">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
