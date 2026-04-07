import { useState } from "react";
import seatedLogo from "@/assets/images/paolas-logo-transparent.png";

const SESSION_KEY = "seated_admin";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === "1"
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  if (unlocked) return <>{children}</>;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);

    setTimeout(() => {
      if (password === "Seated") {
        sessionStorage.setItem(SESSION_KEY, "1");
        setUnlocked(true);
      } else {
        setError(true);
        setLoading(false);
      }
    }, 300);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F7F4]">
      <div className="w-full max-w-sm px-6 mt-24">
        <div className="flex justify-center" style={{ marginBottom: "1.5px" }}>
          <img
            src={seatedLogo}
            alt="Seated"
            style={{ height: "150px" }}
            className="w-auto object-contain"
          />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#E8E5DF] px-8 py-10">
          <h1 className="text-xl font-semibold text-[#1D3A3A] mb-1">
            Restricted area
          </h1>
          <p className="text-sm text-gray-400 mb-8">
            Enter the password to continue
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <input
                data-testid="input-admin-password"
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(false); }}
                placeholder="Enter password"
                autoComplete="current-password"
                autoFocus
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
                Incorrect password. Please try again.
              </p>
            )}

            <button
              data-testid="button-admin-unlock"
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#1D3A3A] text-white text-sm font-semibold
                hover:bg-[#0D7377] transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Verifying…" : "Unlock"}
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
