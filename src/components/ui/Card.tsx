import { cn } from "@/lib/utils";
import type { ReactNode, CSSProperties } from "react";

// ─── Variant ──────────────────────────────────────────────────────────────────
// default  — standard glass card (white/7 → white/2 gradient)
// code     — dark monospace card (black/40)
// cyan     — cyan-tinted highlight card
// red / green / orange — colored state cards

type Variant = "default" | "code" | "cyan" | "red" | "green" | "orange";

// ─── Padding scale (matches MADS UI card system) ─────────────────────────────
// none  — overflow:hidden tables, custom padding
// sm    — 24px  (3-col grids, compact info cards)
// md    — 28px  (standalone info / secondary cards)
// lg    — 32px  (primary 2-col feature cards, default)
// xl    — 40px  (large hero sections)

type Padding = "none" | "sm" | "md" | "lg" | "xl";

interface CardProps {
  variant?: Variant;
  padding?: Padding;
  hover?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  onClick?: () => void;
}

const VARIANT_STYLE: Record<Variant, { background: string; borderColor: string }> = {
  default: {
    background: "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  code: {
    background: "rgba(0,0,0,0.40)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  cyan: {
    background: "linear-gradient(135deg, rgba(34,211,238,0.10) 0%, rgba(255,255,255,0.02) 100%)",
    borderColor: "rgba(34,211,238,0.25)",
  },
  red: {
    background: "rgba(239,68,68,0.05)",
    borderColor: "rgba(239,68,68,0.15)",
  },
  green: {
    background: "rgba(34,197,94,0.05)",
    borderColor: "rgba(34,197,94,0.15)",
  },
  orange: {
    background: "rgba(249,115,22,0.05)",
    borderColor: "rgba(249,115,22,0.20)",
  },
};

const PADDING_PX: Record<Padding, string> = {
  none: "0",
  sm: "1.5rem",
  md: "1.75rem",
  lg: "2rem",
  xl: "2.5rem",
};

// ─── Card label — matches MADS: text-sm uppercase tracking-wider text-gray-500
// Use inside cards as section/eyebrow labels
export function CardLabel({
  children,
  className,
  color,
}: {
  children: ReactNode;
  className?: string;
  color?: string;
}) {
  return (
    <p
      className={cn("text-sm uppercase tracking-wider", className)}
      style={{ color: color ?? "#6b7280", marginBottom: "1.5rem" }}
    >
      {children}
    </p>
  );
}

export default function Card({
  variant = "default",
  padding = "lg",
  hover = false,
  className,
  style,
  children,
  onClick,
}: CardProps) {
  const { background, borderColor } = VARIANT_STYLE[variant];
  return (
    <div
      onClick={onClick}
      className={cn(
        "backdrop-blur-sm rounded-2xl border",
        hover && "transition-transform duration-200 hover:-translate-y-0.5",
        className,
      )}
      style={{
        background,
        borderColor,
        padding: PADDING_PX[padding],
        ...style,
      }}
    >
      {children}
    </div>
  );
}
