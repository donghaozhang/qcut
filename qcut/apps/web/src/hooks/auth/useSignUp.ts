import { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
// Temporarily disabled for Electron build - auth requires server
// import { signUp, signIn } from "@opencut/auth/client";

export function useSignUp() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleSignUp = useCallback(async () => {
    setError(null);
    setIsEmailLoading(true);

    // Mock signup for Electron - would need server integration
    setError("Sign up requires server setup. This is a demo build.");
    setIsEmailLoading(false);

    // For demo, could navigate to login
    // navigate({ to: "/login" });
  }, [name, email, password, navigate]);

  const handleGoogleSignUp = useCallback(async () => {
    setError(null);
    setIsGoogleLoading(true);

    // Mock Google signup for Electron
    setError("Google sign up requires server setup. This is a demo build.");
    setIsGoogleLoading(false);
  }, [navigate]);

  const isAnyLoading = isEmailLoading || isGoogleLoading;

  return {
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    error,
    isEmailLoading,
    isGoogleLoading,
    isAnyLoading,
    handleSignUp,
    handleGoogleSignUp,
  };
}
