import * as React from "react";
import { cn } from "@/lib/cn";

type Variant = "default" | "outline" | "ghost" | "subtle";
type Size = "sm" | "md";

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button({ className, variant = "default", size = "md", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none select-none",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
        variant === "default" &&
          "bg-ink-950 text-white hover:bg-ink-800",
        variant === "outline" &&
          "border bg-white text-ink-950 hover:bg-ink-50",
        variant === "ghost" &&
          "bg-transparent text-ink-950 hover:bg-ink-100",
        variant === "subtle" &&
          "bg-ink-100 text-ink-950 hover:bg-ink-200",
        className,
      )}
      {...props}
    />
  );
});
