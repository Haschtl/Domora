import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import type { Session } from "@supabase/supabase-js";
import { appStore, setActiveHouseholdId } from "../lib/app-store";
import { getCurrentSession, getHouseholdsForUser } from "../lib/api";
import { householdQueryOptions } from "../lib/household-queries";
import { queryKeys } from "../lib/query-keys";
import { supabase } from "../lib/supabase";
import type { Household, HouseholdMember } from "../lib/types";

export const useWorkspaceData = () => {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery<Session | null>({
    queryKey: queryKeys.session,
    queryFn: getCurrentSession
  });

  useEffect(() => {
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      queryClient.setQueryData(queryKeys.session, nextSession);
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  const session = sessionQuery.data ?? null;
  const userId = session?.user.id;

  const householdsQuery = useQuery<Household[]>({
    queryKey: userId ? queryKeys.households(userId) : ["households", "anonymous"],
    queryFn: () => getHouseholdsForUser(userId!),
    enabled: Boolean(userId)
  });
  const householdsLoadError = useMemo(() => {
    const queryError = householdsQuery.error;
    if (!queryError) return null;
    return queryError instanceof Error ? queryError.message : "Unknown error";
  }, [householdsQuery.error]);
  const households = useMemo<Household[]>(() => householdsQuery.data ?? [], [householdsQuery.data]);
  const activeHouseholdId = useStore(appStore, (state: { activeHouseholdId: string | null }) => state.activeHouseholdId);

  useEffect(() => {
    if (households.length === 0) {
      setActiveHouseholdId(null);
      return;
    }

    if (activeHouseholdId && households.some((entry) => entry.id === activeHouseholdId)) {
      return;
    }

    setActiveHouseholdId(households[0].id);
  }, [activeHouseholdId, households]);

  useEffect(() => {
    if (!activeHouseholdId) return;

    const channel = supabase
      .channel(`household-events-${activeHouseholdId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "household_events",
          filter: `household_id=eq.${activeHouseholdId}`
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.householdEvents(activeHouseholdId) });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeHouseholdId, queryClient]);

  const activeHousehold = useMemo(
    () => households.find((entry) => entry.id === activeHouseholdId) ?? null,
    [activeHouseholdId, households]
  );

  const householdMembersQuery = useQuery<HouseholdMember[]>({
    queryKey: activeHousehold ? queryKeys.householdMembers(activeHousehold.id) : ["household", "none", "members"],
    queryFn: () => householdQueryOptions.householdMembers(activeHousehold!.id).queryFn(),
    enabled: Boolean(activeHousehold)
  });
  const householdMembers = householdMembersQuery.data ?? [];

  const userEmail = session?.user.email;
  const userAvatarUrl = useMemo(() => {
    const raw = session?.user.user_metadata?.avatar_url;
    return typeof raw === "string" ? raw : null;
  }, [session?.user.user_metadata?.avatar_url]);
  const userDisplayName = useMemo(() => {
    const metadata = session?.user.user_metadata;
    const rawDisplayName = metadata?.display_name;
    if (typeof rawDisplayName === "string" && rawDisplayName.trim().length > 0) return rawDisplayName.trim();

    const rawFullName = metadata?.full_name;
    if (typeof rawFullName === "string" && rawFullName.trim().length > 0) return rawFullName.trim();

    return null;
  }, [session?.user.user_metadata]);

  const currentMember = useMemo(
    () =>
      userId ? householdMembers.find((entry: HouseholdMember) => entry.user_id === userId) ?? null : null,
    [householdMembers, userId]
  );
  const userPaypalName = currentMember?.paypal_name ?? null;
  const userRevolutName = currentMember?.revolut_name ?? null;
  const userWeroName = currentMember?.wero_name ?? null;

  return {
    sessionQuery,
    queryClient,
    session,
    userId,
    households,
    householdsLoadError,
    activeHouseholdId,
    activeHousehold,
    householdMembers,
    userEmail,
    userAvatarUrl,
    userDisplayName,
    userPaypalName,
    userRevolutName,
    userWeroName,
    currentMember
  };
};
