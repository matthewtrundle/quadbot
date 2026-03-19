'use client';

import * as React from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Brand = { id: string; name: string; mode: string };

type BrandSelectorProps = {
  brands: Brand[];
  selected: string[];
  onChange: (brandIds: string[]) => void;
  maxSelection?: number;
};

const MODE_BADGE_VARIANT: Record<string, 'default' | 'success' | 'warning'> = {
  observe: 'default',
  assist: 'success',
  auto: 'warning',
};

export function BrandSelector({ brands, selected, onChange, maxSelection = 5 }: BrandSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const atLimit = selected.length >= maxSelection;
  const belowMinimum = selected.length < 2;

  const selectedBrands = brands.filter((b) => selected.includes(b.id));

  function toggleBrand(brandId: string) {
    if (selected.includes(brandId)) {
      onChange(selected.filter((id) => id !== brandId));
    } else if (!atLimit) {
      onChange([...selected, brandId]);
    }
  }

  function selectAll() {
    const ids = brands.slice(0, maxSelection).map((b) => b.id);
    onChange(ids);
  }

  function clearAll() {
    onChange([]);
  }

  function removeBrand(brandId: string) {
    onChange(selected.filter((id) => id !== brandId));
  }

  // Trigger label
  let triggerLabel: string;
  if (selected.length === 0) {
    triggerLabel = 'Select brands...';
  } else if (selected.length <= 3) {
    triggerLabel = selectedBrands.map((b) => b.name).join(', ');
  } else {
    triggerLabel = `${selected.length} brands selected`;
  }

  return (
    <div ref={containerRef} className="relative min-w-[200px] w-full">
      {/* Trigger */}
      <Button
        variant="outline"
        className="w-full justify-between text-left font-normal"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown
          className={cn(
            'ml-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </Button>

      {/* Selected badges below trigger */}
      {selectedBrands.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {selectedBrands.map((brand) => (
            <Badge key={brand.id} variant="secondary" className="gap-1 pr-1">
              <span className="max-w-[100px] truncate">{brand.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeBrand(brand.id);
                }}
                className="ml-0.5 rounded-sm p-0.5 hover:bg-foreground/10 transition-colors"
                aria-label={`Remove ${brand.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95 duration-100">
          {/* Header actions */}
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <button
              type="button"
              onClick={selectAll}
              disabled={brands.length <= maxSelection && selected.length === brands.length}
              className="text-xs font-medium text-primary hover:text-primary/80 disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={selected.length === 0}
              className="text-xs font-medium text-destructive hover:text-destructive/80 disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors"
            >
              Clear
            </button>
          </div>

          {/* Brand list */}
          <div className="max-h-[280px] overflow-y-auto py-1" role="listbox" aria-multiselectable>
            {brands.map((brand) => {
              const isSelected = selected.includes(brand.id);
              const isDisabled = !isSelected && atLimit;

              return (
                <button
                  key={brand.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={isDisabled}
                  onClick={() => toggleBrand(brand.id)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors',
                    'hover:bg-secondary focus:bg-secondary outline-none',
                    isDisabled && 'opacity-40 cursor-not-allowed hover:bg-transparent',
                  )}
                >
                  {/* Checkbox */}
                  <div
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/40 bg-transparent',
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>

                  {/* Brand name */}
                  <span className="flex-1 text-left truncate text-foreground">{brand.name}</span>

                  {/* Mode badge */}
                  <Badge variant={MODE_BADGE_VARIANT[brand.mode] ?? 'outline'} className="text-[10px] px-1.5 py-0">
                    {brand.mode}
                  </Badge>
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <div className="border-t border-border px-3 py-2">
            <p className="text-[11px] text-muted-foreground">
              {belowMinimum && selected.length > 0
                ? 'Select at least 2 brands to compare'
                : atLimit
                  ? `Maximum ${maxSelection} brands selected`
                  : `${selected.length} of ${maxSelection} max selected`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
