"use client";
import { useState } from "react";
import { Header, Field, Notice } from "../../components/chrome";
import { createClient } from "@/utils/supabase/client";
import { messageOf } from "@/lib/ui-api";
export default function Password() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="site">
      <Header />
      <main className="auth-wrap" id="content">
        <section className="auth-card">
          <h1>Choose a new password</h1>
          {error && <Notice error>{error}</Notice>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const password = String(
                new FormData(e.currentTarget).get("password"),
              );
              setBusy(true);
              try {
                const { error } = await createClient().auth.updateUser({
                  password,
                });
                if (error) throw error;
                location.assign("/staff");
              } catch (err) {
                setError(messageOf(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="New password">
              <input
                required
                name="password"
                autoComplete="new-password"
                minLength={8}
                type="password"
              />
            </Field>
            <button className="btn primary" disabled={busy}>
              Save password
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
