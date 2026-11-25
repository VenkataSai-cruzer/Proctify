import { cn } from "../../lib/utils";
import type { ReactNode } from "react";

interface Props { children: ReactNode; className?: string; dot?: boolean; }

export function Badge({ children, className, dot }: Props) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums",
      className
    )}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}
