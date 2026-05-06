import * as React from "react";
import { cn } from "@/lib/cn";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-8 w-full rounded border bg-white px-2.5 text-sm placeholder:text-ink-400 focus:border-ink-950 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[72px] w-full rounded border bg-white px-2.5 py-2 text-sm placeholder:text-ink-400 focus:border-ink-950 focus:outline-none resize-y",
        className,
      )}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-8 rounded border bg-white px-2 text-sm focus:border-ink-950 focus:outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
