import { useDialogStore } from "@app_stores/dialogStore";
import { Dialog } from "./Dialog";

export function DialogContainer() {
  const { dialogs } = useDialogStore();

  return (
    <>
      {dialogs.map((dialog) => (
        <Dialog key={dialog.id} dialog={dialog} />
      ))}
    </>
  );
}