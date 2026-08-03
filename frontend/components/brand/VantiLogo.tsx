import Image from "next/image";
import { cn } from "@/lib/utils";

interface VantiLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const SIZES = {
  sm: "max-w-[120px]",
  md: "max-w-[180px]",
  lg: "max-w-[210px]",
};

/**
 * Vanti logo component using next/image.
 * Uses the official logo file provided at /brand/logo-vanti.jpg.
 */
export function VantiLogo({ className, size = "md" }: VantiLogoProps) {
  return (
    <div className={cn("bg-white rounded-lg p-2", className)}>
      <Image
        src="/brand/logo-vanti.jpg"
        alt="Vanti — Más formas de avanzar"
        width={240}
        height={100}
        priority
        className={cn("h-auto w-full object-contain", SIZES[size])}
      />
    </div>
  );
}
