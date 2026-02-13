import { Store } from "@tanstack/store";

interface AppStoreState {
  activeHouseholdId: string | null;
}

export const appStore = new Store<AppStoreState>({
  activeHouseholdId: null
});

export const setActiveHouseholdId = (householdId: string | null) => {
  appStore.setState((state: AppStoreState) => ({ ...state, activeHouseholdId: householdId }));
};
