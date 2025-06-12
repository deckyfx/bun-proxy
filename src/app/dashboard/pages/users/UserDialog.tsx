import { useState } from 'react';
import { FloatingLabelInput } from '@app/components/FloatingLabelInput';
import { Button } from '@app/components/Button';
import { useValidationStore } from '@app/stores/validationStore';
import { useDialogStore } from '@app/stores/dialogStore';
import type { User, CreateUserData, UpdateUserData } from '@app/stores/userStore';
import { tryAsync } from '@src/utils/try';

export function useUserDialog() {
  const { showCustom, closeDialog } = useDialogStore();
  const { validateEmail, validateUsername } = useValidationStore();

  const showUserDialog = (
    onSubmit: (userData: CreateUserData | UpdateUserData) => Promise<void>,
    user?: User,
    loading = false
  ) => {
    const isEditMode = !!user;
    
    const UserDialogContent = () => {
      const [formData, setFormData] = useState({
        email: user?.email || '',
        username: user?.username || '',
        password: '',
        name: user?.name || '',
      });
      
      const [emailError, setEmailError] = useState('');
      const [usernameError, setUsernameError] = useState('');
      const [submitting, setSubmitting] = useState(loading);

      const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setFormData(prev => ({ ...prev, email: value }));
        setEmailError(validateEmail(value));
      };

      const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setFormData(prev => ({ ...prev, username: value }));
        setUsernameError(validateUsername(value));
      };

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validate email
        const emailValidationError = validateEmail(formData.email);
        if (emailValidationError) {
          setEmailError(emailValidationError);
          return;
        }

        // Validate username
        const usernameValidationError = validateUsername(formData.username);
        if (usernameValidationError) {
          setUsernameError(usernameValidationError);
          return;
        }

        // Validate other required fields
        if (!formData.name.trim()) {
          return;
        }

        if (!isEditMode && !formData.password.trim()) {
          return;
        }

        setSubmitting(true);
        
        let submitData: CreateUserData | UpdateUserData;
        if (isEditMode && user) {
          // Edit mode - only include changed/non-empty fields
          submitData = {
            id: user.id,
            email: formData.email !== user.email ? formData.email : undefined,
            username: formData.username !== user.username ? formData.username : undefined,
            name: formData.name !== user.name ? formData.name : undefined,
            password: formData.password.trim() ? formData.password : undefined,
          };
        } else {
          // Create mode
          submitData = {
            email: formData.email,
            username: formData.username,
            password: formData.password,
            name: formData.name,
          };
        }
        
        const [, error] = await tryAsync(() => onSubmit(submitData));
        
        if (!error) {
          closeDialog(dialogId);
        }
        // Error handling is done in the store
        
        setSubmitting(false);
      };

      return (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FloatingLabelInput
            label="Email"
            type="email"
            value={formData.email}
            onChange={handleEmailChange}
            error={emailError}
            disabled={submitting}
            required
          />

          <FloatingLabelInput
            label="Username"
            type="text"
            value={formData.username}
            onChange={handleUsernameChange}
            error={usernameError}
            disabled={submitting}
            required
          />

          <FloatingLabelInput
            label={isEditMode ? "Password (leave blank to keep current)" : "Password"}
            type="password"
            value={formData.password}
            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
            disabled={submitting}
            required={!isEditMode}
          />

          <FloatingLabelInput
            label="Full Name"
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            disabled={submitting}
            required
          />

          <div className="flex justify-end space-x-3 mt-6">
            <Button
              type="button"
              variant="secondary"
              onClick={() => closeDialog(dialogId)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={submitting}
              disabled={submitting}
            >
              {isEditMode ? 'Update User' : 'Create User'}
            </Button>
          </div>
        </form>
      );
    };

    const dialogId = showCustom(
      <UserDialogContent />,
      {
        title: isEditMode ? 'Edit User' : 'Create New User',
        showCloseButton: true,
      }
    );

    return dialogId;
  };

  return { showUserDialog };
}