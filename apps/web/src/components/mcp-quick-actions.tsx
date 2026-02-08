'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check, Terminal } from 'lucide-react';

type McpAction = {
  label: string;
  tool: string;
  args: Record<string, unknown>;
};

export function McpQuickActions({ actions }: { actions: McpAction[] }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  async function handleCopy(idx: number, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">MCP Quick Actions</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.map((action, i) => {
          const command = JSON.stringify({ tool: action.tool, arguments: action.args }, null, 2);
          return (
            <div key={i} className="rounded-md border border-border/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{action.label}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => handleCopy(i, command)}
                >
                  {copiedIdx === i ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <pre className="text-xs bg-muted p-2 rounded-md overflow-auto max-h-32">
                {command}
              </pre>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
