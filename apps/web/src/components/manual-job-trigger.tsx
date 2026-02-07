'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

type Brand = {
  id: string;
  name: string;
};

type JobType = {
  type: string;
  description: string;
};

export function ManualJobTrigger() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    // Fetch brands
    fetch('/api/brands')
      .then(res => res.json())
      .then(data => setBrands(data.brands || []))
      .catch(console.error);

    // Fetch job types
    fetch('/api/jobs/trigger')
      .then(res => res.json())
      .then(data => setJobTypes(data.availableJobTypes || []))
      .catch(console.error);
  }, []);

  async function triggerJob() {
    if (!selectedBrand || !selectedJob) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/jobs/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: selectedBrand,
          jobType: selectedJob,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({ success: true, message: data.message || 'Job triggered successfully!' });
      } else {
        setResult({ success: false, message: data.error || 'Failed to trigger job' });
      }
    } catch (error) {
      setResult({ success: false, message: 'Network error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          Manual Job Trigger
        </CardTitle>
        <CardDescription>
          Manually trigger jobs for testing. Jobs run in the background worker.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Brand</label>
            <Select value={selectedBrand} onValueChange={setSelectedBrand}>
              <SelectTrigger>
                <SelectValue placeholder="Select a brand" />
              </SelectTrigger>
              <SelectContent>
                {brands.map(brand => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Job Type</label>
            <Select value={selectedJob} onValueChange={setSelectedJob}>
              <SelectTrigger>
                <SelectValue placeholder="Select a job type" />
              </SelectTrigger>
              <SelectContent>
                {jobTypes.map(job => (
                  <SelectItem key={job.type} value={job.type}>
                    {job.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          onClick={triggerJob}
          disabled={!selectedBrand || !selectedJob || loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Triggering...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Trigger Job
            </>
          )}
        </Button>

        {result && (
          <div
            className={`flex items-center gap-2 rounded-lg p-3 ${
              result.success
                ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
                : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
            }`}
          >
            {result.success ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <span>{result.message}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
