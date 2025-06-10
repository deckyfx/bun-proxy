import { useState } from "react";
import { useAuthStore } from "@app_stores/authStore";
import { useValidationStore } from "@app_stores/validationStore";
import { Button, FloatingLabelInput } from "@app_components/index";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { signup } = useAuthStore();
  const { validateEmail, validateUsername, validatePasswordMatch } = useValidationStore();

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    setEmailError(validateEmail(newEmail));
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUsername = e.target.value;
    setUsername(newUsername);
    setUsernameError(validateUsername(newUsername));
  };

  const handleConfirmPasswordChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newConfirmPassword = e.target.value;
    setConfirmPassword(newConfirmPassword);
    setConfirmPasswordError(
      validatePasswordMatch(password, newConfirmPassword)
    );
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value;
    setPassword(newPassword);
    // Re-validate confirm password if it has a value
    if (confirmPassword) {
      setConfirmPasswordError(
        validatePasswordMatch(newPassword, confirmPassword)
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setIsLoading(true);

    try {
      await signup({ email, username, password, name, confirmPassword });

      // Show success alert
      alert("Account created successfully! Redirecting to sign in...");

      // Redirect to sign in route
      window.location.hash = "#/signin";

      // Reset form
      setEmail("");
      setUsername("");
      setPassword("");
      setName("");
      setConfirmPassword("");
    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-1/3 min-w-96 mx-auto p-8 bg-white rounded-lg shadow-md border">
      <h1 className="text-2xl font-bold text-center mb-6">Sign Up</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="p-3 bg-red-50 text-red-800 rounded-md text-sm">
            {error}
          </div>
        )}
        <FloatingLabelInput
          type="text"
          label="Full Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading}
          required
        />
        <FloatingLabelInput
          type="email"
          label="Email Address"
          value={email}
          onChange={handleEmailChange}
          disabled={isLoading}
          required
          error={emailError}
        />
        <FloatingLabelInput
          type="text"
          label="Username"
          value={username}
          onChange={handleUsernameChange}
          disabled={isLoading}
          required
          error={usernameError}
        />
        <FloatingLabelInput
          type="password"
          label="Password"
          value={password}
          onChange={handlePasswordChange}
          disabled={isLoading}
          required
        />
        <FloatingLabelInput
          type="password"
          label="Confirm Password"
          value={confirmPassword}
          onChange={handleConfirmPasswordChange}
          disabled={isLoading}
          required
          error={confirmPasswordError}
        />
        <Button
          type="submit"
          isLoading={isLoading}
          icon={!isLoading ? "person_add" : undefined}
          className="w-full"
        >
          {isLoading ? "Signing Up..." : "Sign Up"}
        </Button>
      </form>
      <p className="text-center text-sm text-gray-600 mt-4">
        Already have an account?{" "}
        <a href="#/signin" className="text-blue-600 hover:underline">
          Sign In
        </a>
      </p>
    </div>
  );
}
