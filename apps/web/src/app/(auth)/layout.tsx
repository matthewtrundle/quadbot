import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In — Quadbot',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-grid overflow-hidden">
      {/* Gradient orbs */}
      <div className="gradient-orb h-96 w-96 bg-quad-cyan -top-20 -left-20" />
      <div className="gradient-orb h-80 w-80 bg-quad-purple top-1/2 -right-16" />
      <div className="gradient-orb h-64 w-64 bg-quad-pink -bottom-10 left-1/3" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
