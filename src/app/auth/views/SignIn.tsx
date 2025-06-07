import { useState } from "react";
import { useAuthStore } from "@app_stores/authStore";
import { useValidationStore } from "@app_stores/validationStore";
import { Button, FloatingLabelInput } from "@app_components/index";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { signin } = useAuthStore();
  const { validateEmail } = useValidationStore();

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    setEmailError(validateEmail(newEmail));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await signin({ email, password });
    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
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
          type="email"
          label="Email"
          value={email}
          onChange={handleEmailChange}
          disabled={isLoading}
          required
          error={emailError}
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