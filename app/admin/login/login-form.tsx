"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pw, setPw] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    setLoading(false);
    if (!res.ok) {
      setErr("Wrong password.");
      return;
    }
    const next = params.get("next") || "/admin";
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input
        type="password"
        placeholder="Password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        autoFocus
      />
      {err && <div className="text-xs text-ink-700">{err}</div>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "..." : "Sign in"}
      </Button>
    </form>
  );
}
