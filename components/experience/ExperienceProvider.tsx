"use client";

import {
  createContext,
  useContext,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { ExperienceConfig } from "@/lib/config/experiences";

const ExperienceContext = createContext<ExperienceConfig | null>(null);

export function ExperienceProvider({
  config,
  children,
}: {
  config: ExperienceConfig;
  children: ReactNode;
}) {
  const value = useMemo(() => config, [config]);

  return (
    <ExperienceContext.Provider value={value}>
      <div
        className="experience-root min-h-dvh motion-reduce:transition-none"
        data-experience={config.id}
        data-theme={config.theme.mode}
        style={
          {
            "--accent": config.theme.accent,
            "--accent-foreground": config.theme.accentForeground,
            "--background": config.theme.background,
            "--foreground": config.theme.foreground,
            "--muted": config.theme.muted,
            "--muted-foreground": config.theme.mutedForeground,
            "--border": config.theme.border,
            "--card": config.theme.card,
            background: config.theme.background,
            color: config.theme.foreground,
          } as CSSProperties
        }
      >
        {children}
      </div>
    </ExperienceContext.Provider>
  );
}

export function useExperience(): ExperienceConfig {
  const ctx = useContext(ExperienceContext);
  if (!ctx) {
    throw new Error("useExperience must be used within ExperienceProvider");
  }
  return ctx;
}
