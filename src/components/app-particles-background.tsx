import { useEffect, useMemo, useState } from "react";
import Particles, { ParticlesProvider } from "@tsparticles/react";
import type { ISourceOptions } from "@tsparticles/engine";
import { initDomoraParticles } from "../lib/particles";
import { useTheme } from "../lib/use-theme";

export const AppParticlesBackground = () => {
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
      pauseOnOutsideViewport: false,
      particles: {
        number: { value: resolvedTheme === "dark" ? 52 : 58, density: { enable: true, area: 900 } },
        color: {
          value:
            resolvedTheme === "dark"
              ? ["#34d399", "#22d3ee", "#a7f3d0"]
              : ["#0f766e", "#14b8a6", "#0891b2"]
        },
        shape: { type: "circle" },
        opacity: { value: resolvedTheme === "dark" ? 0.42 : 0.34 },
        size: { value: { min: 2, max: 5 } },
        links: {
          enable: true,
          distance: 140,
          color: resolvedTheme === "dark" ? "#34d399" : "#0f766e",
          opacity: resolvedTheme === "dark" ? 0.24 : 0.28,
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

  return (
    <ParticlesProvider init={initDomoraParticles}>
      <div className="pointer-events-none fixed inset-0 z-0 h-dvh w-dvw opacity-95">
        <Particles
          id="domora-particles"
          className="absolute inset-0 h-full w-full"
          style={{ height: "100%", width: "100%" }}
          options={options}
        />
      </div>
    </ParticlesProvider>
  );
};
