import * as React from "react";
import { cn } from "@/lib/utils";

/** Lightweight wrapper — native overflow scroll with consistent styling. */
export const ScrollArea = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("overflow-auto [scrollbar-width:thin]", className)}
      {...props}
    >
      {children}
    </div>
  )
);
ScrollArea.displayName = "ScrollArea";
