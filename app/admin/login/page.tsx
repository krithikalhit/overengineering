import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div className="text-sm font-semibold tracking-tight">overengineering</div>
          <h1 className="mt-1 text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-ink-500">Internal access only.</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
