'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Plus, Trophy } from 'lucide-react';

type AbTestVariant = {
  content: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
};

type AbTest = {
  id: string;
  name: string;
  test_type: 'subject' | 'body' | 'send_time' | 'sequence_length';
  status: 'active' | 'completed' | 'draft';
  split_percentage: number;
  variant_a: AbTestVariant;
  variant_b: AbTestVariant;
  winner?: 'a' | 'b' | null;
};

const TEST_TYPE_LABELS: Record<string, string> = {
  subject: 'Subject Line',
  body: 'Body Content',
  send_time: 'Send Time',
  sequence_length: 'Sequence Length',
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  completed: 'secondary',
  draft: 'outline',
};

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : '0%';
}

export function AbTestPanel({ campaignId }: { campaignId: string }) {
  const [tests, setTests] = useState<AbTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New test form
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<string>('subject');
  const [newVariantA, setNewVariantA] = useState('');
  const [newVariantB, setNewVariantB] = useState('');
  const [newSplit, setNewSplit] = useState(50);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Complete test
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completingTest, setCompletingTest] = useState<AbTest | null>(null);
  const [selectedWinner, setSelectedWinner] = useState<'a' | 'b'>('a');
  const [completing, setCompleting] = useState(false);

  const fetchTests = async () => {
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/ab-test`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setTests(data);
    } catch {
      setError('Failed to load A/B tests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTests();
  }, [campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/ab-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          test_type: newType,
          variant_a: newVariantA,
          variant_b: newVariantB,
          split_percentage: newSplit,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create A/B test');
      }
      setDialogOpen(false);
      setNewName('');
      setNewType('subject');
      setNewVariantA('');
      setNewVariantB('');
      setNewSplit(50);
      await fetchTests();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create test.');
    } finally {
      setCreating(false);
    }
  };

  const handleComplete = async () => {
    if (!completingTest) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/ab-test/${completingTest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winner: selectedWinner }),
      });
      if (!res.ok) throw new Error('Failed to complete test');
      setCompleteDialogOpen(false);
      setCompletingTest(null);
      await fetchTests();
    } catch {
      // Error handled silently, user can retry
    } finally {
      setCompleting(false);
    }
  };

  const usesTextarea = newType === 'body';

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold">A/B Tests</h4>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              New A/B Test
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create A/B Test</DialogTitle>
              <DialogDescription>Test different variants to optimize your campaign performance.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Test Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Subject line test - direct vs. question"
                />
              </div>

              <div className="space-y-2">
                <Label>Test Type</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subject">Subject Line</SelectItem>
                    <SelectItem value="body">Body Content</SelectItem>
                    <SelectItem value="send_time">Send Time</SelectItem>
                    <SelectItem value="sequence_length">Sequence Length</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Variant A</Label>
                {usesTextarea ? (
                  <Textarea
                    value={newVariantA}
                    onChange={(e) => setNewVariantA(e.target.value)}
                    placeholder="Variant A content..."
                    rows={4}
                  />
                ) : (
                  <Input
                    value={newVariantA}
                    onChange={(e) => setNewVariantA(e.target.value)}
                    placeholder="Variant A..."
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label>Variant B</Label>
                {usesTextarea ? (
                  <Textarea
                    value={newVariantB}
                    onChange={(e) => setNewVariantB(e.target.value)}
                    placeholder="Variant B content..."
                    rows={4}
                  />
                ) : (
                  <Input
                    value={newVariantB}
                    onChange={(e) => setNewVariantB(e.target.value)}
                    placeholder="Variant B..."
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label>
                  Split Percentage: {newSplit}% / {100 - newSplit}%
                </Label>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={newSplit}
                  onChange={(e) => setNewSplit(parseInt(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Variant A: {newSplit}%</span>
                  <span>Variant B: {100 - newSplit}%</span>
                </div>
              </div>
            </div>

            {createError && <p className="text-sm text-destructive">{createError}</p>}

            <DialogFooter>
              <Button
                onClick={handleCreate}
                disabled={creating || !newName.trim() || !newVariantA.trim() || !newVariantB.trim()}
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Test'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {tests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No A/B tests yet. Create one to start optimizing your campaign.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {tests.map((test) => (
            <Card key={test.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{test.name}</CardTitle>
                    <Badge variant={STATUS_VARIANTS[test.status] || 'secondary'}>{test.status}</Badge>
                    <Badge variant="outline">{TEST_TYPE_LABELS[test.test_type] || test.test_type}</Badge>
                  </div>
                  {test.status === 'active' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCompletingTest(test);
                        setSelectedWinner('a');
                        setCompleteDialogOpen(true);
                      }}
                    >
                      Complete Test
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Variant A */}
                  <div
                    className={`rounded-lg border p-4 space-y-3 ${
                      test.winner === 'a' ? 'border-green-500 bg-green-500/5' : 'border-border/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Variant A</span>
                      <Badge variant="outline" className="text-xs">
                        {test.split_percentage}%
                      </Badge>
                      {test.winner === 'a' && (
                        <Badge className="gap-1 bg-green-600">
                          <Trophy className="h-3 w-3" />
                          Winner
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">{test.variant_a.content}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Sent</p>
                        <p className="font-medium">{test.variant_a.sent}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Opened</p>
                        <p className="font-medium">
                          {test.variant_a.opened} ({pct(test.variant_a.opened, test.variant_a.sent)})
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Clicked</p>
                        <p className="font-medium">
                          {test.variant_a.clicked} ({pct(test.variant_a.clicked, test.variant_a.sent)})
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Replied</p>
                        <p className="font-medium">
                          {test.variant_a.replied} ({pct(test.variant_a.replied, test.variant_a.sent)})
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Variant B */}
                  <div
                    className={`rounded-lg border p-4 space-y-3 ${
                      test.winner === 'b' ? 'border-green-500 bg-green-500/5' : 'border-border/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Variant B</span>
                      <Badge variant="outline" className="text-xs">
                        {100 - test.split_percentage}%
                      </Badge>
                      {test.winner === 'b' && (
                        <Badge className="gap-1 bg-green-600">
                          <Trophy className="h-3 w-3" />
                          Winner
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">{test.variant_b.content}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Sent</p>
                        <p className="font-medium">{test.variant_b.sent}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Opened</p>
                        <p className="font-medium">
                          {test.variant_b.opened} ({pct(test.variant_b.opened, test.variant_b.sent)})
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Clicked</p>
                        <p className="font-medium">
                          {test.variant_b.clicked} ({pct(test.variant_b.clicked, test.variant_b.sent)})
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Replied</p>
                        <p className="font-medium">
                          {test.variant_b.replied} ({pct(test.variant_b.replied, test.variant_b.sent)})
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Complete Test Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete A/B Test</DialogTitle>
            <DialogDescription>
              Select the winning variant. The losing variant will stop receiving traffic.
            </DialogDescription>
          </DialogHeader>

          {completingTest && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    name="winner"
                    value="a"
                    checked={selectedWinner === 'a'}
                    onChange={() => setSelectedWinner('a')}
                    className="accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium">Variant A</p>
                    <p className="text-xs text-muted-foreground">
                      Open: {pct(completingTest.variant_a.opened, completingTest.variant_a.sent)} | Click:{' '}
                      {pct(completingTest.variant_a.clicked, completingTest.variant_a.sent)} | Reply:{' '}
                      {pct(completingTest.variant_a.replied, completingTest.variant_a.sent)}
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    name="winner"
                    value="b"
                    checked={selectedWinner === 'b'}
                    onChange={() => setSelectedWinner('b')}
                    className="accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium">Variant B</p>
                    <p className="text-xs text-muted-foreground">
                      Open: {pct(completingTest.variant_b.opened, completingTest.variant_b.sent)} | Click:{' '}
                      {pct(completingTest.variant_b.clicked, completingTest.variant_b.sent)} | Reply:{' '}
                      {pct(completingTest.variant_b.replied, completingTest.variant_b.sent)}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleComplete} disabled={completing}>
              {completing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Completing...
                </>
              ) : (
                'Pick Winner'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
