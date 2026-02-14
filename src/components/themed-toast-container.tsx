import { ToastContainer } from "react-toastify";
import { useTheme } from "../lib/use-theme";

export const ThemedToastContainer = () => {
  const { resolvedTheme } = useTheme();

  return (
    <ToastContainer
      position="top-right"
      autoClose={3500}
      newestOnTop
      theme={resolvedTheme}
      closeButton={false}
      closeOnClick
      draggable={false}
      toastClassName="domora-toast"
    />
  );
};
