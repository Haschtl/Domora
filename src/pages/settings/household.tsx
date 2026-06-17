import { SettingsPageContainer } from "./settings-page-container";

interface SettingsHouseholdPageProps {
  onStartWizard?: () => void;
}

export const SettingsHouseholdPage = ({ onStartWizard }: SettingsHouseholdPageProps) => (
  <SettingsPageContainer section="household" onStartWizard={onStartWizard} />
);
