import { ShoppingPage } from "./shopping-page";
import { useWorkspace } from "../../context/workspace-context";
import { useHouseholdShoppingBatch } from "../../hooks/use-household-data";
import type { ShoppingItem, ShoppingItemCompletion } from "../../lib/types";

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

  const shoppingBatchQuery = useHouseholdShoppingBatch(activeHousehold?.id ?? null);

  if (!activeHousehold || !userId) return null;

  const shoppingData = shoppingBatchQuery.data as
    | {
        shoppingItems: ShoppingItem[];
        shoppingCompletions: ShoppingItemCompletion[];
      }
    | undefined;

  return (
    <ShoppingPage
      section={section}
      items={shoppingData?.shoppingItems ?? []}
      completions={shoppingData?.shoppingCompletions ?? []}
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
