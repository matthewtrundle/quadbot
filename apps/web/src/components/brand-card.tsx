import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type BrandCardProps = {
  id: string;
  name: string;
  mode: string;
  modulesEnabled: string[];
};

export function BrandCard({ id, name, mode, modulesEnabled }: BrandCardProps) {
  return (
    <Link href={`/brands/${id}/inbox`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{name}</CardTitle>
            <Badge variant={mode === 'assist' ? 'default' : 'secondary'}>{mode}</Badge>
          </div>
          <CardDescription>
            {modulesEnabled.length > 0
              ? `Modules: ${modulesEnabled.join(', ')}`
              : 'No modules enabled'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Click to view inbox</p>
        </CardContent>
      </Card>
    </Link>
  );
}
