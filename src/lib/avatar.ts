import { createAvatar } from "@dicebear/core";
import { adventurer } from "@dicebear/collection";
const normalizeSeed = (value: string | null | undefined, fallback: string) => {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : fallback;
};

export const createDiceBearAvatarDataUri = (seed: string | null | undefined) => {
  const normalizedSeed = normalizeSeed(seed, "domora-user");

  return createAvatar(adventurer, {
    seed: normalizedSeed,
    radius: 50,
    // fontWeight: 600,
    backgroundType: ["gradientLinear"],
    backgroundColor: ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf"]
  }).toDataUri();
};
