import { cn } from "@/lib/utils";

interface WaggleLogoProps {
  className?: string;
  iconOnly?: boolean;
  light?: boolean;
}

export function WaggleLogo({ className, iconOnly = false, light = false }: WaggleLogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Hexagon icon — Hivenet-style */}
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M16 2L28 9V23L16 30L4 23V9L16 2Z"
          fill="#E8610A"
          stroke="#C4500A"
          strokeWidth="1"
        />
        <path
          d="M16 8L22 11.5V18.5L16 22L10 18.5V11.5L16 8Z"
          fill="white"
          fillOpacity="0.25"
        />
        <circle cx="16" cy="15" r="3" fill="white" />
      </svg>
      {!iconOnly && (
        <span
          className={cn(
            "text-xl font-bold tracking-tight",
            light ? "text-white" : "text-[var(--color-foreground)]"
          )}
        >
          Waggle
        </span>
      )}
    </div>
  );
}
