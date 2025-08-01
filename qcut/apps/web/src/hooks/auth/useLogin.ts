import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
// Temporarily disabled for Electron build - auth requires server
// import { signIn } from "@opencut/auth/client";

export function useLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleLogin = useCallback(async () => {
    setError(null);
    setIsEmailLoading(true);

    // Mock auth for Electron - would need server integration
    setError("Authentication requires server setup. This is a demo build.");
    setIsEmailLoading(false);
    
    // For demo, just navigate to projects
    // navigate({ to: "/projects" });
  }, [navigate, email, password]);

  const handleGoogleLogin = async () => {
    setError(null);
    setIsGoogleLoading(true);

    // Mock Google auth for Electron
    setError("Google authentication requires server setup. This is a demo build.");
    setIsGoogleLoading(false);
  };

  const isAnyLoading = isEmailLoading || isGoogleLoading;

  return {
    email,
    setEmail,
    password,
    setPassword,
    error,
    isEmailLoading,
    isGoogleLoading,
    isAnyLoading,
    handleLogin,
    handleGoogleLogin,
  };
}
