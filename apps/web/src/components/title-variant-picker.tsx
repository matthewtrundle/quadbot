'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type TitleVariant = {
  title: string;
  rationale: string;
  predicted_ctr_lift: number;
};

type TitleVariantPickerProps = {
  artifactId: string;
  variants: TitleVariant[];
  status: string;
};

export function TitleVariantPicker({ artifactId, variants, status }: TitleVariantPickerProps) {
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const handleApprove = async () => {
    if (selectedIndex === null) return;

    setIsApproving(true);
    try {
      const response = await fetch(`/api/artifacts/${artifactId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_variant_index: selectedIndex,
          selected_title: variants[selectedIndex].title,
        }),
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to approve artifact:', err);
    } finally {
      setIsApproving(false);
    }
  };

  const isApproved = status === 'approved' || status === 'deployed';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {variants.map((variant, index) => (
          <div
            key={index}
            onClick={() => !isApproved && setSelectedIndex(index)}
            className={`rounded border p-3 transition-colors ${
              isApproved
                ? 'cursor-default'
                : selectedIndex === index
                  ? 'border-primary bg-primary/5 cursor-pointer'
                  : 'hover:border-muted-foreground cursor-pointer'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-1">
                <p className="font-medium text-sm">{variant.title}</p>
                <p className="text-xs text-muted-foreground">{variant.rationale}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={variant.predicted_ctr_lift > 20 ? 'default' : 'secondary'}
                  className="whitespace-nowrap"
                >
                  +{variant.predicted_ctr_lift}% CTR
                </Badge>
                {!isApproved && selectedIndex === index && (
                  <div className="h-4 w-4 rounded-full bg-primary" />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!isApproved && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedIndex(null)}
            disabled={selectedIndex === null}
          >
            Clear Selection
          </Button>
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={selectedIndex === null || isApproving}
          >
            {isApproving ? 'Approving...' : 'Approve Selected'}
          </Button>
        </div>
      )}

      {isApproved && (
        <p className="text-sm text-muted-foreground">
          This artifact has been approved and is ready for deployment.
        </p>
      )}
    </div>
  );
}
