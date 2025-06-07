import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, Button, FloatingLabelInput } from "./index";
import { useDialogStore, type Dialog } from "@app_stores/dialogStore";

interface DialogProps {
  dialog: Dialog;
}

export function Dialog({ dialog }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [promptValue, setPromptValue] = useState("");
  const { closeDialog } = useDialogStore();

  useEffect(() => {
    const dialogElement = dialogRef.current;
    if (!dialogElement) return;

    if (dialog.isOpen) {
      dialogElement.showModal();
      
      // Set initial prompt value
      if (dialog.type === "prompt") {
        setPromptValue(dialog.defaultValue || "");
      }
    } else {
      dialogElement.close();
    }

    // Handle clicking outside the dialog to close
    const handleClickOutside = (event: MouseEvent) => {
      if (event.target === dialogElement) {
        handleClose();
      }
    };

    // Handle Escape key
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    dialogElement.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      dialogElement.removeEventListener("click", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [dialog.isOpen]);

  const handleClose = () => {
    if (dialog.type === "confirm" || dialog.type === "prompt") {
      dialog.onCancel?.();
    } else if (dialog.type === "custom") {
      dialog.onClose?.();
    }
    closeDialog(dialog.id);
  };

  const handleConfirm = () => {
    if (dialog.type === "alert") {
      dialog.onConfirm?.();
    } else if (dialog.type === "confirm") {
      dialog.onConfirm?.();
    } else if (dialog.type === "prompt") {
      dialog.onConfirm?.(promptValue);
    }
    closeDialog(dialog.id);
  };

  const renderDialogContent = () => {
    switch (dialog.type) {
      case "alert":
        return (
          <>
            <div className="mb-6">
              <div className="flex items-center space-x-3 mb-4">
                <Icon name="info" size={24} className="text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">
                  {dialog.title}
                </h2>
              </div>
              <p className="text-gray-600">{dialog.message}</p>
            </div>
            <div className="flex justify-end space-x-3">
              <Button onClick={handleConfirm} variant="primary">
                {dialog.confirmText || "OK"}
              </Button>
            </div>
          </>
        );

      case "confirm":
        return (
          <>
            <div className="mb-6">
              <div className="flex items-center space-x-3 mb-4">
                <Icon name="help" size={24} className="text-orange-600" />
                <h2 className="text-lg font-semibold text-gray-900">
                  {dialog.title}
                </h2>
              </div>
              <p className="text-gray-600">{dialog.message}</p>
            </div>
            <div className="flex justify-end space-x-3">
              <Button onClick={handleClose} variant="secondary">
                {dialog.cancelText || "Cancel"}
              </Button>
              <Button onClick={handleConfirm} variant="primary">
                {dialog.confirmText || "Confirm"}
              </Button>
            </div>
          </>
        );

      case "prompt":
        return (
          <>
            <div className="mb-6">
              <div className="flex items-center space-x-3 mb-4">
                <Icon name="edit" size={24} className="text-green-600" />
                <h2 className="text-lg font-semibold text-gray-900">
                  {dialog.title}
                </h2>
              </div>
              <p className="text-gray-600 mb-4">{dialog.message}</p>
              <FloatingLabelInput
                label={dialog.placeholder || "Enter value"}
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                placeholder={dialog.placeholder}
                autoFocus
              />
            </div>
            <div className="flex justify-end space-x-3">
              <Button onClick={handleClose} variant="secondary">
                {dialog.cancelText || "Cancel"}
              </Button>
              <Button onClick={handleConfirm} variant="primary">
                {dialog.confirmText || "OK"}
              </Button>
            </div>
          </>
        );

      case "custom":
        return (
          <>
            <div className="mb-6">
              {dialog.title && (
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {dialog.title}
                  </h2>
                  {dialog.showCloseButton && (
                    <button
                      onClick={handleClose}
                      className="text-gray-400 hover:text-gray-600 clickable"
                    >
                      <Icon name="close" size={20} />
                    </button>
                  )}
                </div>
              )}
              <div>{dialog.content}</div>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const dialogElement = (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black backdrop:bg-opacity-30 rounded-lg shadow-xl border-0 p-0 max-w-md w-full"
    >
      <div className="bg-white rounded-lg p-6 w-full">
        {renderDialogContent()}
      </div>
    </dialog>
  );

  // Render to document body using portal
  return typeof document !== 'undefined' 
    ? createPortal(dialogElement, document.body)
    : null;
}