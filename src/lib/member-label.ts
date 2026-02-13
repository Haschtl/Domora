import type { HouseholdMember } from "./types";

export const createMemberLabelGetter = (input: {
  members: HouseholdMember[];
  currentUserId?: string;
  youLabel: string;
  fallbackLabel: string;
}) => {
  const byUserId = new Map<string, HouseholdMember>();
  const fallbackIndexByUserId = new Map<string, number>();
  let nextFallbackIndex = 1;
  input.members.forEach((member) => {
    byUserId.set(member.user_id, member);
    const displayName = member.display_name?.trim();
    if (!displayName && !fallbackIndexByUserId.has(member.user_id)) {
      fallbackIndexByUserId.set(member.user_id, nextFallbackIndex);
      nextFallbackIndex += 1;
    }
  });

  return (memberId: string) => {
    if (memberId === input.currentUserId) return input.youLabel;
    const displayName = byUserId.get(memberId)?.display_name?.trim();
    if (displayName) return displayName;
    const fallbackIndex = fallbackIndexByUserId.get(memberId);
    return fallbackIndex ? `${input.fallbackLabel} ${fallbackIndex}` : input.fallbackLabel;
  };
};
