import { createAvatar } from "@dicebear/core";
import { adventurer } from "@dicebear/collection";
const normalizeSeed = (value: string | null | undefined, fallback: string) => {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : fallback;
};

const normalizeHexColor = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const raw = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return raw.toLowerCase();
};

export const createDiceBearAvatarDataUri = (seed: string | null | undefined, backgroundColor?: string | null) => {
  const normalizedSeed = normalizeSeed(seed, "domora-user");
  const normalizedColor = normalizeHexColor(backgroundColor);

  return createAvatar(adventurer, {
    seed: normalizedSeed,
    radius: 50,
    backgroundType: ["solid"],
    backgroundColor: normalizedColor
      ? [normalizedColor]
      : [
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
