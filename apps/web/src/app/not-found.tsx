import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center text-center">
      {/* Decorative background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="gradient-orb absolute left-1/4 top-1/3 h-64 w-64 bg-quad-cyan" />
        <div className="gradient-orb absolute right-1/4 bottom-1/3 h-48 w-48 bg-quad-purple" />
      </div>

      <div className="relative z-10 space-y-6">
        {/* Large 404 display */}
        <h1 className="holographic text-8xl font-extrabold tracking-tighter sm:text-9xl">
          404
        </h1>

        {/* Heading */}
        <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
          Page Not Found
        </h2>

        {/* Description */}
        <p className="mx-auto max-w-md text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Let&apos;s get you back on track.
        </p>

        {/* Action button */}
        <div className="pt-2">
          <Button asChild size="lg">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
