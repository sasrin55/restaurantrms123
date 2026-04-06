import { useState } from "react";
import seatedLogo from "@assets/WhatsApp_Image_2026-02-24_at_9.45.59_AM_1774930513535.jpeg";

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);

    setTimeout(() => {
      if (username === "Server1" && password === "PaolasCosa") {
        sessionStorage.setItem("seated_auth", "1");
        onLogin();
      } else {
        setError(true);
        setLoading(false);
      }
    }, 400);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F7F4]">
      <div className="w-full max-w-sm px-6">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <img
            src={seatedLogo}
            alt="Seated"
            className="h-20 w-auto object-contain"
          />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#E8E5DF] px-8 py-10">
          <h1 className="text-xl font-semibold text-[#1D3A3A] mb-1">
            Welcome back
          </h1>
          <p className="text-sm text-gray-400 mb-8">
            Sign in to the PAOLA'S dashboard
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                Username
              </label>
              <input
                data-testid="input-username"
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(false); }}
                placeholder="Enter username"
                autoComplete="username"
                required
                className={`w-full px-4 py-3 rounded-xl border text-sm text-gray-800 placeholder:text-gray-300 outline-none transition-all
                  ${error
                    ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    : "border-[#E8E5DF] bg-[#FAFAF8] focus:border-[#0D7377] focus:ring-2 focus:ring-[#0D7377]/10"
                  }`}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <input
                data-testid="input-password"
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(false); }}
                placeholder="Enter password"
                autoComplete="current-password"
                required
                className={`w-full px-4 py-3 rounded-xl border text-sm text-gray-800 placeholder:text-gray-300 outline-none transition-all
                  ${error
                    ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    : "border-[#E8E5DF] bg-[#FAFAF8] focus:border-[#0D7377] focus:ring-2 focus:ring-[#0D7377]/10"
                  }`}
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 text-center">
                Incorrect username or password.
              </p>
            )}

            <button
              data-testid="button-login"
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#1D3A3A] text-white text-sm font-semibold
                hover:bg-[#0D7377] transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-300 mt-6">
          PAOLA'S Cosa Nostra · Powered by Seated
        </p>
      </div>
    </div>
  );
}
