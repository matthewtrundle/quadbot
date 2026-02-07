'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

type BrandCardProps = {
  id: string;
  name: string;
  mode: string;
  modulesEnabled: string[];
  isActive: boolean;
};

export function BrandCard({ id, name, mode, modulesEnabled, isActive: initialActive }: BrandCardProps) {
  const router = useRouter();
  const [isActive, setIsActive] = useState(initialActive);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/brands/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      });

      if (response.ok) {
        setIsActive(!isActive);
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to toggle brand:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Link href={`/brands/${id}/inbox`}>
      <Card className={`hover:shadow-md transition-all cursor-pointer ${!isActive ? 'opacity-50' : ''}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{name}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={mode === 'assist' ? 'default' : 'secondary'}>{mode}</Badge>
            </div>
          </div>
          <CardDescription>
            {modulesEnabled.length > 0
              ? `Modules: ${modulesEnabled.join(', ')}`
              : 'No modules enabled'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {isActive ? 'Bot will process this brand' : 'Bot paused for this brand'}
            </p>
            <div
              className="flex items-center gap-2"
              onClick={handleToggle}
            >
              <span className="text-xs text-muted-foreground">
                {isActive ? 'Active' : 'Paused'}
              </span>
              <Switch
                checked={isActive}
                disabled={isUpdating}
                className="pointer-events-none"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
