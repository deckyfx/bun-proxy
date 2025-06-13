import { useState } from "react";
import { useAuthStore } from "@app_stores/authStore";
import { useValidationStore } from "@app_stores/validationStore";
import { Button, FloatingLabelInput } from "@app/components/index";
import { tryAsync } from '@src/utils/try';

export default function SignIn() {
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [emailOrUsernameError, setEmailOrUsernameError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { signin } = useAuthStore();
  const { validateEmail } = useValidationStore();

  const handleEmailOrUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setEmailOrUsername(newValue);
    // Only validate as email if it contains @ symbol
    if (newValue.includes('@')) {
      setEmailOrUsernameError(validateEmail(newValue));
    } else {
      setEmailOrUsernameError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const [, error] = await tryAsync(() => signin({ emailOrUsername, password }));

    if (error) {
      setError(error.message);
    }

    setIsLoading(false);
  };

  return (
    <div className="w-1/3 min-w-96 mx-auto p-8 bg-white rounded-lg shadow-md border">
      <h1 className="text-2xl font-bold text-center mb-6">Sign In</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="p-3 bg-red-50 text-red-800 rounded-md text-sm">
            {error}
          </div>
        )}
        <FloatingLabelInput
          type="text"
          label="Email or Username"
          value={emailOrUsername}
          onChange={handleEmailOrUsernameChange}
          disabled={isLoading}
          required
          status={emailOrUsernameError ? "error" : undefined}
          message={emailOrUsernameError}
        />
        <FloatingLabelInput
          type="password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          required
        />
        <Button
          type="submit"
          isLoading={isLoading}
          icon={!isLoading ? "login" : undefined}
          className="w-full"
        >
          {isLoading ? 'Signing In...' : 'Sign In'}
        </Button>
      </form>
      <p className="text-center text-sm text-gray-600 mt-4">
        Don't have an account?{' '}
        <a href="#/signup" className="text-blue-600 hover:underline">
          Sign Up
        </a>
      </p>
    </div>
  );
}