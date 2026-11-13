"use client";
import { FormEvent, useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, ChefHat, ScanLine } from "lucide-react";
import { Header, Field, Notice } from "./chrome";
import { createClient } from "@/utils/supabase/client";
import { messageOf } from "@/lib/ui-api";

export function AuthScreen({
  initialMode = "login",
}: {
  initialMode?: "login" | "register";
}) {
  const [mode, setMode] = useState<"login" | "register" | "reset">(initialMode);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (new URLSearchParams(location.search).get("verification") === "expired")
      setError("This email link has expired. Request a new link or sign in.");
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const client = createClient(),
        emailRedirectTo = location.origin + "/auth/callback";
      if (mode === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: emailRedirectTo + "?next=/account/password",
        });
        if (error) throw error;
        setNotice("Check your inbox for a password reset link.");
      } else if (mode === "register") {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo },
        });
        if (error) throw error;
        if (data.session) location.assign("/staff");
        else
          setNotice(
            "Check your email to confirm your account, then sign in to set up or join a restaurant.",
          );
      } else {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        location.assign("/staff");
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="site">
      <Header />
      <main id="content" className="access-layout">
        <section className="access-story">
          <p className="eyebrow">
            <span className="dot" /> Staff workspace
          </p>
          <h2>
            At your
            <br />
            <em>service.</em>
          </h2>
          <p>
            Manage your menu, keep up with the kitchen and close each table’s
            bill.
          </p>
          <div className="access-icons">
            <BookOpenCheck />
            <ChefHat />
            <ScanLine />
          </div>
        </section>
        <section className="auth-card">
          <h1>
            {mode === "register"
              ? "Create your account"
              : mode === "reset"
                ? "Reset your password"
                : "Welcome back"}
          </h1>
          <p>
            {mode === "register"
              ? "Set up a restaurant or accept a staff invitation."
              : mode === "reset"
                ? "Enter your account email to receive a reset link."
                : "Sign in to your restaurant workspace."}
          </p>
          {error && <Notice error>{error}</Notice>}
          {notice && <Notice>{notice}</Notice>}
          <form onSubmit={submit}>
            <Field label="Email address">
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            {mode !== "reset" && (
              <Field label="Password">
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  required
                  minLength={mode === "register" ? 8 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            )}
            <button className="btn primary" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "register"
                  ? "Create account"
                  : mode === "reset"
                    ? "Send reset link"
                    : "Sign in"}
              <ArrowRight size={16} />
            </button>
          </form>
          {mode === "login" ? (
            <div className="auth-links">
              <Link href="/register">Create an account</Link>
              <button
                className="text-link"
                onClick={() => {
                  setMode("reset");
                  setNotice("");
                  setError("");
                }}
              >
                Forgot password?
              </button>
            </div>
          ) : (
            <Link
              href="/staff"
              onClick={() => {
                setMode("login");
                setNotice("");
                setError("");
              }}
            >
              Back to sign in
            </Link>
          )}
        </section>
      </main>
    </div>
  );
}
