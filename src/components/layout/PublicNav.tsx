"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesCombined, Code2, Database, Globe2 } from "lucide-react";

const links = [
  { href: "/", label: "全球态势", icon: Globe2 },
  { href: "/markets", label: "市场数据", icon: ChartNoAxesCombined },
];

export default function PublicNav() {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.08] bg-[#080b0c]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1800px] items-center justify-between gap-4 px-3 sm:px-5 lg:px-8 xl:px-10">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="World Ledger 首页">
          <span className="grid h-9 w-9 shrink-0 place-items-center border border-[#d49a54]/35 bg-[#d49a54]/[0.08] text-[#d49a54]">
            <Database size={17} />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-serif text-base text-white">World Ledger</span>
            <span className="block truncate text-[9px] uppercase tracking-[0.2em] text-[#68737b]">Global market intelligence</span>
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <nav className="flex items-center gap-1" aria-label="主要导航">
            {links.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  title={item.label}
                  className="flex h-9 items-center gap-2 border px-2.5 text-xs transition-colors sm:px-3"
                  style={{
                    color: active ? "#f4f5f6" : "#7f8995",
                    borderColor: active ? "rgba(212,154,84,0.35)" : "transparent",
                    background: active ? "rgba(212,154,84,0.07)" : "transparent",
                  }}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <a
            href="https://github.com/xieyuh03/Global-market-intelligence"
            target="_blank"
            rel="noreferrer"
            title="查看源代码"
            aria-label="查看 GitHub 源代码"
            className="grid h-9 w-9 place-items-center text-[#68737b] transition-colors hover:text-white"
          >
            <Code2 size={16} />
          </a>
        </div>
      </div>
    </header>
  );
}