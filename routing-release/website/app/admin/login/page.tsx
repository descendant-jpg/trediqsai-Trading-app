import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-16">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-8">
        <p className="text-xs font-bold uppercase tracking-[.25em] text-cyan">Restricted area</p>
        <h1 className="mt-3 text-2xl font-black">Admin sign in</h1>
        <p className="mt-2 text-sm text-muted">
          Use your authorized administrator email and password to access the CMS.
        </p>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
