'use client';

export function LiveIndicator({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span
        className={`inline-block h-2 w-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}
      />
      <span className={isConnected ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
        {isConnected ? 'Live' : 'Offline'}
      </span>
    </div>
  );
}
