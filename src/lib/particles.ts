import type { Engine } from "@tsparticles/engine";
import { loadSlim } from "@tsparticles/slim";

export const initDomoraParticles = async (engine: Engine) => {
  await loadSlim(engine);
};
