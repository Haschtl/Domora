import { Capacitor, registerPlugin } from "@capacitor/core";

type LaunchScreenPlugin = {
  hide: () => Promise<void>;
};

const LaunchScreen = registerPlugin<LaunchScreenPlugin>("LaunchScreen");

let hasHiddenNativeLaunchScreen = false;

export const hideNativeLaunchScreen = async () => {
  if (hasHiddenNativeLaunchScreen) return;
  if (!Capacitor.isNativePlatform()) return;

  try {
    await LaunchScreen.hide();
    hasHiddenNativeLaunchScreen = true;
  } catch {
    // Ignore missing plugin/no-op platforms.
  }
};
