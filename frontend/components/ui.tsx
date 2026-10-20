"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/** Shared motion tokens. See app/globals.css. */
export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap " +
  "transition-[transform,background-color,border-color,color,opacity] duration-150 " +
  "ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 " +
  "disabled:pointer-events-none disabled:opacity-40";

const variants = {
  primary: "bg-emerald-500 text-neutral-950 hover:bg-emerald-400",
  subtle: "border border-neutral-800 text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100",
  danger: "border border-red-900/70 text-red-300 hover:bg-red-950/50",
  ghost: "text-neutral-400 hover:text-neutral-100"
} as const;

const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm"
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function Button({ variant = "subtle", size = "sm", className = "", ...props }: ButtonProps) {
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}

const badgeTones = {
  neutral: "bg-neutral-800/80 text-neutral-300",
  emerald: "bg-emerald-500/10 text-emerald-400",
  amber: "bg-amber-500/10 text-amber-400",
  red: "bg-red-500/10 text-red-400"
} as const;

export function Badge({
  tone = "neutral",
  className = "",
  children
}: {
  tone?: keyof typeof badgeTones;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${badgeTones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className = ""
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-neutral-800 p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-neutral-500">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export const inputClass =
  "w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 " +
  "placeholder:text-neutral-600 transition-colors duration-150 focus:border-neutral-700 " +
  "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-400";

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${className}`} {...props} />;
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${inputClass} ${className}`} {...props}>
      {children}
    </select>
  );
}
