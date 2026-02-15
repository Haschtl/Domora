import { ShoppingPage } from "./shopping-page";
import { useWorkspace } from "../../context/workspace-context";
import { useHouseholdShoppingCompletions, useHouseholdShoppingItems } from "../../hooks/use-household-data";

interface ShoppingPageContainerProps {
  section: "list" | "history";
}

export const ShoppingPageContainer = ({ section }: ShoppingPageContainerProps) => {
  const {
    activeHousehold,
    householdMembers,
    userId,
    busy,
    mobileTabBarVisible,
    onAddShoppingItem,
    onToggleShoppingItem,
    onUpdateShoppingItem,
    onDeleteShoppingItem
  } = useWorkspace();

  const itemsQuery = useHouseholdShoppingItems(activeHousehold?.id ?? null);
  const completionsQuery = useHouseholdShoppingCompletions(activeHousehold?.id ?? null);

  if (!activeHousehold || !userId) return null;

  return (
    <ShoppingPage
      section={section}
      items={itemsQuery.data ?? []}
      completions={completionsQuery.data ?? []}
      members={householdMembers}
      userId={userId}
      busy={busy}
      mobileTabBarVisible={mobileTabBarVisible}
      onAdd={onAddShoppingItem}
      onToggle={onToggleShoppingItem}
      onUpdate={onUpdateShoppingItem}
      onDelete={onDeleteShoppingItem}
    />
  );
};
