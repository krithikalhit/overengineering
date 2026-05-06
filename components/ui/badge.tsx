import * as React from "react";
import { cn } from "@/lib/cn";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 h-5 text-[11px] font-medium text-ink-700 bg-white",
        className,
      )}
      {...props}
    />
  );
}
