import { cn } from "../../lib/utils";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  highlight?: boolean;
}

export function Card({ children, className, onClick, highlight }: Props) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-[#111827] border border-[#1F2937] rounded-xl",
        highlight && "ring-1 ring-cobalt-500/50 border-cobalt-500/30",
        onClick && "cursor-pointer hover:border-[#374151] transition-colors",
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps { title: string; subtitle?: string; actions?: ReactNode; className?: string; }
export function CardHeader({ title, subtitle, actions, className }: CardHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between px-4 py-3 border-b border-[#1F2937]", className)}>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
