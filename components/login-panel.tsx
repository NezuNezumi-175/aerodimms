"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { profiles, setStoredUser } from "@/lib/demo-data";

export function LoginPanel() {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("PEN12345");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();

    const user = profiles.find(
      (profile) => profile.employeeId.toLowerCase() === employeeId.trim().toLowerCase(),
    );

    if (!user || password.trim() === "") {
      setError("Invalid credentials. Please check your Employee ID and password.");
      return;
    }

    if (employeeId.trim().toLowerCase() === "pen12345" && password.trim() === "password123") {
      setStoredUser(user);
      router.replace("/dashboard");
      return;
    }

    if (employeeId.trim().toLowerCase() === "pen23456" && password.trim() === "password123") {
      setStoredUser(user);
      router.replace("/dashboard");
      return;
    }

    if (employeeId.trim().toLowerCase() === "pen34567" && password.trim() === "password123") {
      setStoredUser(user);
      router.replace("/dashboard");
      return;
    }

    setError("Invalid credentials. Please check your Employee ID and password.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.25em] text-sky-600">AeroDIMMS</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Fukuoka Airport</h1>
          <p className="mt-2 text-sm text-slate-600">Operations dashboard and issue tracker</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label htmlFor="employeeId" className="mb-1 block text-sm font-medium text-slate-700">
              Employee ID
            </label>
            <input
              id="employeeId"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none ring-0 transition focus:border-sky-400 focus:bg-white"
              placeholder="PEN12345"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none transition focus:border-sky-400 focus:bg-white"
              placeholder="********"
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            LOGIN
          </button>
        </form>

        <div className="mt-6 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          Demo accounts: PEN12345, PEN23456, PEN34567 / password123
        </div>
      </div>
    </div>
  );
}
