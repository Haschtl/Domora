import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.domora.mobile",
  appName: "Domora",
  webDir: "dist",
  loggingBehavior: "debug",
  backgroundColor: "#f0f5f4",
  zoomEnabled: false,
  initialFocus: true,
  android: {
    backgroundColor: "#f0f5f4",
    zoomEnabled: false,
    allowMixedContent: false,
    captureInput: true,
    minWebViewVersion: 80,
    resolveServiceWorkerRequests: true
  },
  ios: {
    backgroundColor: "#f0f5f4",
    zoomEnabled: false,
    contentInset: "never",
    scrollEnabled: true,
    allowsLinkPreview: false,
    preferredContentMode: "recommended",
    handleApplicationNotifications: true
  },
  server: {
    hostname: "localhost",
    iosScheme: "capacitor",
    androidScheme: "https"
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 300,
      showSpinner: false,
      backgroundColor: "#f0f5f4",
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: false
    },
    CapacitorHttp: {
      enabled: true
    },
    SystemBars: {
      insetsHandling: "css"
    }
  }
};

export default config;
