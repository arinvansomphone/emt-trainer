import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Shuffle } from 'lucide-react';

// The server picks a subtype for 'Random' (services/scenarioTypes.js RANDOM), each equally likely.
const RANDOM = 'Random';

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
            <Card
              onClick={() => !busy && onPick(type, RANDOM)}
              className={`cursor-pointer border-dashed bg-muted/40 hover:border-primary transition ${busy === RANDOM ? 'opacity-60' : ''}`}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <Shuffle className="h-4 w-4 text-primary" aria-hidden="true" />Random
                  </span>
                  {busy === RANDOM && <Loader2 className="h-4 w-4 animate-spin" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Any {type} scenario</p>
              </CardContent>
            </Card>
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
