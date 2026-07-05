import type { CSSProperties } from "react";

export interface SkeletonProps {
  variant?: "text" | "line" | "avatar" | "thumb" | "block";
  width?: number | string;
  height?: number | string;
  className?: string;
}

const DIMS: Record<NonNullable<SkeletonProps["variant"]>, CSSProperties> = {
  text: { width: "60%", height: 12, borderRadius: 4 },
  line: { width: "100%", height: 10, borderRadius: 4 },
  avatar: { width: 40, height: 40, borderRadius: "50%" },
  thumb: { width: 56, height: 56, borderRadius: 8 },
  block: { width: "100%", height: 88, borderRadius: 12 },
};

export function Skeleton({ variant = "line", width, height, className }: SkeletonProps) {
  const base = DIMS[variant];
  const style: CSSProperties = {
    ...base,
    width: width ?? base.width,
    height: height ?? base.height,
  };
  return <div className={`zw-skeleton ${className ?? ""}`} style={style} aria-hidden />;
}
