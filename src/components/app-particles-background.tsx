import { useEffect, useMemo, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";
import { useTheme } from "../lib/use-theme";

export const AppParticlesBackground = () => {
  const { resolvedTheme } = useTheme();
  const [engineReady, setEngineReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      if (mounted) setEngineReady(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

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
        number: { value: resolvedTheme === "dark" ? 30 : 34, density: { enable: true, area: 1000 } },
        color: { value: resolvedTheme === "dark" ? ["#22c55e", "#0ea5a4", "#94a3b8"] : ["#0f766e", "#14b8a6", "#0d9488"] },
        shape: { type: ["circle", "square"] },
        opacity: { value: resolvedTheme === "dark" ? 0.2 : 0.18 },
        size: { value: { min: 1, max: 3 } },
        links: {
          enable: true,
          distance: 140,
          color: resolvedTheme === "dark" ? "#1f3a35" : "#8dd8cb",
          opacity: resolvedTheme === "dark" ? 0.16 : 0.2,
          width: 1
        },
        move: {
          enable: true,
          speed: reduceMotion ? 0.1 : 0.35,
          direction: "none",
          outModes: { default: "out" }
        }
      },
      interactivity: {
        detectsOn: "window",
        events: {
          resize: { enable: true },
          onHover: {
            enable: !reduceMotion,
            mode: "grab",
            parallax: { enable: true, force: 7, smooth: 30 }
          }
        },
        modes: {
          grab: {
            distance: 90,
            links: { opacity: 0.18 }
          }
        }
      }
    }),
    [reduceMotion, resolvedTheme]
  );

  if (!engineReady) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 opacity-95">
      <Particles id="domora-particles" options={options} />
    </div>
  );
};
