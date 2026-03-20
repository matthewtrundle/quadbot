'use client';

import { PublishDialog } from './publish-dialog';

interface PlaybookActionsProps {
  playbook: {
    id: string;
    name: string;
    trigger_type: string;
    trigger_conditions: unknown;
    actions: unknown;
  };
  brandId: string;
}

export function PlaybookActions({ playbook, brandId }: PlaybookActionsProps) {
  return (
    <div className="flex items-center gap-1">
      <PublishDialog playbook={playbook} brandId={brandId} />
    </div>
  );
}
