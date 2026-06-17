import { Avatar,Style } from "@dicebear/core";
import definition from "@dicebear/styles/adventurer.json" with { type: "json" };

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

export const getMemberAvatarSeed = (
  memberId: string,
  displayName?: string | null,
) => {
  const normalized = (displayName ?? "").trim();
  return normalized.length > 0 ? normalized : memberId;
};

export const createDiceBearAvatarDataUri = (
  seed: string | null | undefined,
  backgroundColor?: string | null,
) => {
  const normalizedSeed = normalizeSeed(seed, "domora-user");
  const normalizedColor = normalizeHexColor(backgroundColor);
const style = new Style(definition);
return new Avatar(style, {
  seed: normalizedSeed,
  borderRadius: 50,
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
        "ec4899",
      ],
}).toDataUri();

};
