"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Header, Field, Notice } from "../components/chrome";
import { api, messageOf } from "@/lib/ui-api";
import { createClient } from "@/utils/supabase/client";

export default function Invite() {
  const [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const v = new URLSearchParams(location.search).get("token");
    if (v) {
      setToken(v);
      history.replaceState(null, "", "/invite");
    }
  }, []);
  return (
    <div className="site">
      <Header />
      <main id="content" className="auth-wrap">
        <section className="auth-card">
          <p className="eyebrow">Staff access</p>
          <h1>Join your team</h1>
          <p>
            Sign in with the email address your restaurant invited, then enter
            the invitation code.
          </p>
          {error && <Notice error>{error}</Notice>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const user = await createClient().auth.getUser();
                if (!user.data.user)
                  throw new Error(
                    "Sign in first, then return to this invitation.",
                  );
                await api("management", {
                  action: "accept_invite",
                  data: { token: token.trim() },
                });
                location.assign("/staff");
              } catch (err) {
                setError(messageOf(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Invitation code">
              <input
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </Field>
            <button className="btn primary" disabled={busy}>
              Accept invitation
            </button>
          </form>
          <div className="actions">
            <Link href="/staff">Sign in</Link>
            <Link href="/register">Create an account</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
