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
    // Keep stable but high-contrast default avatar backgrounds.
    backgroundType: ["solid"],
    backgroundColor: [
      "ef4444",
      "f97316",
      "eab308",
      "22c55e",
      "14b8a6",
      "06b6d4",
      "3b82f6",
      "6366f1",
      "a855f7",
      "ec4899"
    ]
  }).toDataUri();
};
