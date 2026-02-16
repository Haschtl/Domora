import { useLocation, useNavigate } from "@tanstack/react-router";
import { SettingsPage } from "./settings-page";
import { useWorkspace } from "../../context/workspace-context";
import { useHouseholdTasks } from "../../hooks/use-household-data";

interface SettingsPageContainerProps {
  section: "me" | "household";
}

export const SettingsPageContainer = ({ section }: SettingsPageContainerProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    activeHousehold,
    householdMembers,
    currentMember,
    userId,
    userEmail,
    userAvatarUrl,
    userDisplayName,
    userPaypalName,
    userRevolutName,
    userWeroName,
    busy,
    notificationPermission,
    onEnableNotifications,
    onReregisterPushToken,
    onUpdateHousehold,
    onUpdateUserAvatar,
    onUpdateUserDisplayName,
    onUpdateUserColor,
    onUpdateUserPaymentHandles,
    onUpdateVacationMode,
    onSetMemberRole,
    onRemoveMember,
    onSignOut,
    onLeaveHousehold,
    onDissolveHousehold
  } = useWorkspace();

  const tasksQuery = useHouseholdTasks(activeHousehold?.id ?? null);

  const onLeaveHouseholdWithRedirect = async () => {
    await onLeaveHousehold();
    if (location.pathname.startsWith("/settings")) {
      void navigate({ to: "/home" });
    }
  };

  const onDissolveHouseholdWithRedirect = async () => {
    await onDissolveHousehold();
    if (location.pathname.startsWith("/settings")) {
      void navigate({ to: "/home" });
    }
  };

  if (!activeHousehold || !userId) return null;

  return (
    <SettingsPage
      section={section}
      household={activeHousehold}
      members={householdMembers}
      currentMember={currentMember}
      tasks={tasksQuery.data ?? []}
      userId={userId}
      userEmail={userEmail}
      userAvatarUrl={userAvatarUrl}
      userDisplayName={userDisplayName}
      userPaypalName={userPaypalName}
      userRevolutName={userRevolutName}
      userWeroName={userWeroName}
      busy={busy}
      notificationPermission={notificationPermission}
      onEnableNotifications={onEnableNotifications}
      onReregisterPushToken={onReregisterPushToken}
      onUpdateHousehold={onUpdateHousehold}
      onUpdateUserAvatar={onUpdateUserAvatar}
      onUpdateUserDisplayName={onUpdateUserDisplayName}
      onUpdateUserColor={onUpdateUserColor}
      onUpdateUserPaymentHandles={onUpdateUserPaymentHandles}
      onUpdateVacationMode={onUpdateVacationMode}
      onSetMemberRole={onSetMemberRole}
      onRemoveMember={onRemoveMember}
      onSignOut={onSignOut}
      onLeaveHousehold={onLeaveHouseholdWithRedirect}
      onDissolveHousehold={onDissolveHouseholdWithRedirect}
    />
  );
};
