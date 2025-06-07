import React from "react";
import { useDialogStore } from "@app/stores/dialogStore";
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