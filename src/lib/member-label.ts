import type { HouseholdMember } from "./types";

export type MemberLabelCase = "nominative" | "dative" | "accusative";

export const createMemberLabelGetter = (input: {
  members: HouseholdMember[];
  currentUserId?: string;
  youLabel: string;
  youLabels?: Partial<Record<MemberLabelCase, string>>;
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

  const pronounByCase: Record<MemberLabelCase, string> = {
    nominative: input.youLabels?.nominative ?? input.youLabel,
    dative: input.youLabels?.dative ?? input.youLabel,
    accusative: input.youLabels?.accusative ?? input.youLabel
  };

  return (memberId: string, labelCase: MemberLabelCase = "nominative") => {
    if (memberId === input.currentUserId) return pronounByCase[labelCase];
    const displayName = byUserId.get(memberId)?.display_name?.trim();
    if (displayName) return displayName;
    const fallbackIndex = fallbackIndexByUserId.get(memberId);
    return fallbackIndex ? `${input.fallbackLabel} ${fallbackIndex}` : input.fallbackLabel;
  };
};
