import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';

export default function ScenarioGrid({ catalog, busy, onPick }) {
  return (
    <Tabs defaultValue="trauma">
      <TabsList>
        <TabsTrigger value="trauma">Trauma</TabsTrigger>
        <TabsTrigger value="medical">Medical</TabsTrigger>
      </TabsList>
      {['trauma', 'medical'].map((type) => (
        <TabsContent key={type} value={type}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
            {catalog[type].map((subtype) => (
              <Card
                key={subtype}
                onClick={() => !busy && onPick(type, subtype)}
                className={`cursor-pointer hover:border-primary transition ${busy === subtype ? 'opacity-60' : ''}`}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    {subtype}
                    {busy === subtype && <Loader2 className="h-4 w-4 animate-spin" />}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground capitalize">{type}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
