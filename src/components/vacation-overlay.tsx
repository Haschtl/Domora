import {  useEffect, useMemo, useState } from "react";
import Particles from "@tsparticles/react";
import type { ISourceOptions } from "@tsparticles/engine";
import { useTheme } from "../lib/use-theme";

export const VacationOverlay = () => {
  const { resolvedTheme } = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const options = useMemo<ISourceOptions>(
    () => ({
      background: { color: "transparent" },
      fullScreen: { enable: false },
      detectRetina: true,
      fpsLimit: 60,
      pauseOnOutsideViewport: true,
      particles: {
        number: { value: 28, density: { enable: true, area: 900 } },
        opacity: { value: resolvedTheme === "dark" ? 0.65 : 0.8 },
        color: { value: resolvedTheme === "dark" ? ["#fde68a", "#34d399", "#7dd3fc"] : ["#f97316", "#22c55e", "#0ea5e9"] },
        size: { value: { min: 12, max: 20 } },
        rotate: { value: { min: 0, max: 360 }, direction: "random", animation: { enable: !reduceMotion, speed: 1 } },
        move: {
          enable: !reduceMotion,
          speed: 0.3,
          direction: "none",
          outModes: { default: "out" }
        },
        shape: {
          type: "circle"
        }
      }
    }),
    [reduceMotion, resolvedTheme]
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-120 h-dvh w-dvw overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50/35 via-emerald-50/20 to-sky-50/35 dark:from-amber-900/20 dark:via-emerald-900/10 dark:to-sky-900/15" />
      <Particles
        id="domora-vacation"
        className="absolute inset-0 h-full w-full"
        options={options}
      />
    </div>
  );
};
