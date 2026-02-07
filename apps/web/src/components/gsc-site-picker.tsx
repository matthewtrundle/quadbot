'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

export type GscSiteEntry = {
  siteUrl: string;
  permissionLevel: string;
  suggestedBrandName: string;
};

type SiteSelection = {
  siteUrl: string;
  brandName: string;
  selected: boolean;
};

type GscSitePickerProps = {
  sites: GscSiteEntry[];
  onImport: (sites: { siteUrl: string; brandName: string }[]) => Promise<void>;
  isLoading?: boolean;
};

export function GscSitePicker({ sites, onImport, isLoading }: GscSitePickerProps) {
  const [selections, setSelections] = useState<SiteSelection[]>(
    sites.map((site) => ({
      siteUrl: site.siteUrl,
      brandName: site.suggestedBrandName,
      selected: false,
    })),
  );

  const selectedCount = selections.filter((s) => s.selected).length;

  const toggleSite = (index: number) => {
    setSelections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, selected: !s.selected } : s)),
    );
  };

  const toggleAll = () => {
    const allSelected = selections.every((s) => s.selected);
    setSelections((prev) => prev.map((s) => ({ ...s, selected: !allSelected })));
  };

  const updateBrandName = (index: number, brandName: string) => {
    setSelections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, brandName } : s)),
    );
  };

  const handleImport = async () => {
    const selectedSites = selections
      .filter((s) => s.selected)
      .map((s) => ({ siteUrl: s.siteUrl, brandName: s.brandName }));

    if (selectedSites.length > 0) {
      await onImport(selectedSites);
    }
  };

  const getPermissionBadge = (level: string) => {
    switch (level) {
      case 'siteOwner':
        return <Badge variant="default">Owner</Badge>;
      case 'siteFullUser':
        return <Badge variant="secondary">Full</Badge>;
      case 'siteRestrictedUser':
        return <Badge variant="outline">Restricted</Badge>;
      default:
        return <Badge variant="outline">{level}</Badge>;
    }
  };

  if (sites.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            No GSC properties found. Make sure your Google account has access to Search Console properties.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Select Sites to Import</CardTitle>
          <Button variant="outline" size="sm" onClick={toggleAll}>
            {selections.every((s) => s.selected) ? 'Deselect All' : 'Select All'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y">
          {selections.map((selection, index) => {
            const site = sites[index];
            return (
              <div
                key={site.siteUrl}
                className={`flex items-center gap-4 py-4 ${selection.selected ? 'bg-muted/50' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selection.selected}
                  onChange={() => toggleSite(index)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      {site.siteUrl}
                    </span>
                    {getPermissionBadge(site.permissionLevel)}
                  </div>
                  {selection.selected && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`brand-${index}`} className="text-sm">
                        Brand name:
                      </Label>
                      <Input
                        id={`brand-${index}`}
                        value={selection.brandName}
                        onChange={(e) => updateBrandName(index, e.target.value)}
                        className="h-8 w-64"
                        placeholder="Enter brand name"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {selectedCount} site{selectedCount !== 1 ? 's' : ''} selected
          </p>
          <Button onClick={handleImport} disabled={selectedCount === 0 || isLoading}>
            {isLoading ? 'Importing...' : `Import ${selectedCount} Brand${selectedCount !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
