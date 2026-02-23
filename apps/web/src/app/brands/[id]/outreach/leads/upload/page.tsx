'use client';

import { useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TARGET_FIELDS = [
  { value: '', label: 'Skip' },
  { value: 'email', label: 'Email' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'company', label: 'Company' },
  { value: 'title', label: 'Title' },
  { value: 'linkedin_url', label: 'LinkedIn URL' },
  { value: 'phone', label: 'Phone' },
  { value: 'industry', label: 'Industry' },
  { value: 'employee_count', label: 'Employee Count' },
  { value: 'location', label: 'Location' },
];

type Preview = {
  columns: string[];
  auto_mapping: Record<string, string>;
  preview_rows: Record<string, string>[];
  total_rows: number;
};

export default function UploadLeadsPage() {
  const router = useRouter();
  const { id: brandId } = useParams<{ id: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);

    const formData = new FormData();
    formData.append('file', f);

    const res = await fetch('/api/outreach/leads/upload/preview', {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      setPreview(data);
      setMapping(data.auto_mapping);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('brandId', brandId);
    formData.append('columnMapping', JSON.stringify(mapping));

    const res = await fetch('/api/outreach/leads/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    setResult(data);
    setUploading(false);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Upload Leads CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>CSV File</Label>
            <Input type="file" accept=".csv" onChange={handleFileSelect} />
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>Field Mapping ({preview.total_rows} rows detected)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {preview.columns.map((col) => (
              <div key={col} className="flex items-center gap-4">
                <span className="w-48 text-sm font-mono truncate">{col}</span>
                <Select
                  value={mapping[col] || ''}
                  onValueChange={(v) => setMapping({ ...mapping, [col]: v })}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Skip" />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGET_FIELDS.map((f) => (
                      <SelectItem key={f.value} value={f.value || 'skip'}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}

            <div className="pt-4">
              <h4 className="text-sm font-medium mb-2">Preview</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border">
                  <thead>
                    <tr>
                      {preview.columns.map((c) => (
                        <th key={c} className="border p-1 text-left bg-muted">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview_rows.map((row, i) => (
                      <tr key={i}>
                        {preview.columns.map((c) => (
                          <td key={c} className="border p-1 truncate max-w-[200px]">{row[c]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
              <Button onClick={handleUpload} disabled={uploading || !mapping.email}>
                {uploading ? 'Uploading...' : 'Upload & Import'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="pt-4">
            <p className="font-medium">Import Complete</p>
            <div className="text-sm mt-2 space-y-1">
              <p>Imported: {result.imported}</p>
              <p>Duplicates: {result.duplicates}</p>
              <p>Errors: {result.errors}</p>
            </div>
            <Button size="sm" className="mt-3" onClick={() => router.push(`/brands/${brandId}/outreach/leads`)}>
              View Leads
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
