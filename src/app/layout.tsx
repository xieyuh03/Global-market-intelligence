import type { Metadata } from "next";
import "./globals.css";
import PublicNav from "@/components/layout/PublicNav";

export const metadata: Metadata = {
  title: "World Ledger | 全球市场情报",
  description: "以国家、市场和共同因子为线索观察全球风险偏好与资本方向。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>
        <PublicNav />
        {children}
        <footer className="border-t border-white/[0.07] px-4 py-8 text-center text-[11px] leading-5 text-[#667077]">
          公开市场数据与模型观察，不构成投资建议。价格代理不等于基金申赎或真实跨境资金。
        </footer>
      </body>
    </html>
  );
}
