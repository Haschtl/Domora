import { useMemo } from "react";
import { User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createDiceBearAvatarDataUri } from "../lib/avatar";
import type { HouseholdMember } from "../lib/types";
import { createMemberLabelGetter } from "../lib/member-label";
import { cn } from "../lib/utils";
import { MemberAvatar } from "./member-avatar";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface PersonSelectCommonProps {
  members: HouseholdMember[];
  currentUserId?: string;
  youLabel?: string;
  youLabels?: {
    nominative?: string;
    dative?: string;
    accusative?: string;
  };
  disabled?: boolean;
  className?: string;
}

interface PersonSelectSingleProps extends PersonSelectCommonProps {
  mode?: "single";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allValue?: string;
  allLabel?: string;
}

interface PersonSelectMultipleProps extends PersonSelectCommonProps {
  mode: "multiple";
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

type PersonSelectProps = PersonSelectSingleProps | PersonSelectMultipleProps;

export const PersonSelect = (props: PersonSelectProps) => {
  const { t } = useTranslation();
  const members = useMemo(() => {
    const dedup = new Map<string, HouseholdMember>();
    props.members.forEach((member) => {
      dedup.set(member.user_id, member);
    });
    return [...dedup.values()];
  }, [props.members]);

  const youLabel = props.youLabel ?? t("common.youNominative");
  const getMemberLabel = useMemo(
    () =>
      createMemberLabelGetter({
        members,
        currentUserId: props.currentUserId,
        youLabel,
        youLabels: props.youLabels ?? {
          nominative: t("common.youNominative"),
          dative: t("common.youDative"),
          accusative: t("common.youAccusative")
        },
        fallbackLabel: t("common.memberFallback")
      }),
    [members, props.currentUserId, props.youLabels, t, youLabel]
  );
  const getMemberAvatar = (member: HouseholdMember) =>
    member.avatar_url?.trim() || createDiceBearAvatarDataUri(member.display_name?.trim() || member.user_id, member.user_color);
  const firstNameFromLabel = (label: string) => {
    const normalized = label.trim();
    if (!normalized) return normalized;
    const parts = normalized.split(/\s+/);
    return parts[0] ?? normalized;
  };
  const getMemberName = (memberId: string) => getMemberLabel(memberId);
  const getMemberFirstName = (memberId: string) => firstNameFromLabel(getMemberName(memberId));

  if (props.mode === "multiple") {
    const selectedSet = new Set(props.value);
    const householdMemberIds = members.map((member) => member.user_id);
    const selectedMembers = members.filter((member) => selectedSet.has(member.user_id));
    const selectedInHousehold = selectedMembers.map((member) => member.user_id);
    const selectedLabels = selectedMembers.map((member) => getMemberFirstName(member.user_id));
    const allSelected = householdMemberIds.length > 0 && selectedInHousehold.length === householdMemberIds.length;
    const allExceptOne = householdMemberIds.length >= 4 && selectedInHousehold.length === householdMemberIds.length - 1;
    const selectedText = allSelected
      ? t("common.all")
      : allExceptOne
      ? t("common.allExcept", {
          member: getMemberFirstName(
            householdMemberIds.find((memberId) => !selectedSet.has(memberId)) ?? ""
          )
        })
      : selectedLabels.join(", ");
    const stackedSelectedMembers = selectedMembers.slice(0, 3);

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" disabled={props.disabled} className={cn("w-full justify-between", props.className)}>
            <span className="flex min-w-0 items-center gap-2">
              {selectedMembers.length > 0 ? (
                <span className="flex items-center gap-1.5">
                  <span className="flex -space-x-2">
                    {stackedSelectedMembers.map((member) => (
                      <MemberAvatar
                        key={member.user_id}
                        src={getMemberAvatar(member)}
                        alt={getMemberName(member.user_id)}
                        isVacation={member.vacation_mode}
                        className="h-5 w-5 rounded-full border border-white dark:border-slate-900"
                      />
                    ))}
                  </span>
                  {selectedMembers.length > stackedSelectedMembers.length ? (
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      +{selectedMembers.length - stackedSelectedMembers.length}
                    </span>
                  ) : null}
                </span>
              ) : (
                <User className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
              )}
              <span className="truncate">
                {selectedLabels.length > 0
                  ? selectedText
                  : (props.placeholder ?? "Select members")}
              </span>
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-2">
          <ul className="space-y-1">
            {members.map((member) => {
              const checked = selectedSet.has(member.user_id);
              return (
                <li key={member.user_id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-brand-50 dark:hover:bg-slate-800">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => {
                        const next = checked
                          ? props.value.filter((entry) => entry !== member.user_id)
                          : [...props.value, member.user_id];
                        props.onChange(next);
                      }}
                    />
                    <span className="text-sm">{getMemberFirstName(member.user_id)}</span>
                    <MemberAvatar
                      src={getMemberAvatar(member)}
                      alt={getMemberName(member.user_id)}
                      isVacation={member.vacation_mode}
                      className="ml-auto h-4 w-4 rounded-full border border-brand-200 dark:border-slate-700"
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    );
  }

  const allValue = props.allValue ?? "";
  const selectedKnown = members.some((member) => member.user_id === props.value);

  return (
    <Select value={props.value} onValueChange={props.onChange} disabled={props.disabled}>
      <SelectTrigger className={props.className}>
        <SelectValue placeholder={props.placeholder ?? "Select member"} />
      </SelectTrigger>
      <SelectContent>
        {props.allLabel ? <SelectItem value={allValue}>{props.allLabel}</SelectItem> : null}
        {!selectedKnown && props.value !== allValue ? (
          <SelectItem value={props.value}>
            <span className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              {getMemberFirstName(props.value)}
            </span>
          </SelectItem>
        ) : null}
        {members.map((member) => (
          <SelectItem key={member.user_id} value={member.user_id}>
            <span className="flex items-center gap-2">
              <MemberAvatar
                src={getMemberAvatar(member)}
                alt={getMemberName(member.user_id)}
                isVacation={member.vacation_mode}
                className="h-4 w-4 rounded-full border border-brand-200 dark:border-slate-700"
              />
              {getMemberFirstName(member.user_id)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
