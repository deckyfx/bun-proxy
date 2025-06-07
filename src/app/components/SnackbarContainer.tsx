import { useSnackbarStore } from "@app_stores/snackbarStore";
import { Snackbar } from "./Snackbar";

export function SnackbarContainer() {
  const { snackbars, removeSnackbar } = useSnackbarStore();

  if (snackbars.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {snackbars.map((snackbar) => (
        <Snackbar
          key={snackbar.id}
          {...snackbar}
          onClose={removeSnackbar}
        />
      ))}
    </div>
  );
}