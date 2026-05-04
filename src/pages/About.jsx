import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export default function About() {
  return (
    <div className="mt-6 grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>About this trainer</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3 text-muted-foreground">
          <p>
            EMT Scenario Trainer is an AI-powered simulator for trauma and medical scenarios.
            You pick a scenario, talk to the patient and bystanders, perform physical assessments and interventions,
            and the moderator narrates findings drawn from a per-scenario findings map. Vitals shift in response to interventions.
            When you're done, an AI grader scores your run against a Stanford-style EMT rubric.
          </p>
          <Separator />
          <div>
            <div className="text-foreground font-medium mb-1">How to talk to the simulator</div>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="font-medium text-foreground">Speak to the patient</span> in plain English: "How would you rate the pain 1-10?"</li>
              <li><span className="font-medium text-foreground">Name a bystander</span> to address them: "Ask the wife what happened."</li>
              <li><span className="font-medium text-foreground">Perform a physical action</span>: "Auscultate lung sounds", "Inspect the right arm", "Check pupils".</li>
              <li><span className="font-medium text-foreground">Apply an intervention</span>: "Apply 15L NRB", "Splint the left wrist", "Give 0.4 mg nitro" — vitals will update accordingly.</li>
              <li><span className="font-medium text-foreground">Hit the mic</span> for voice input (Chrome / Safari).</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rubric</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <div>
            <div className="font-medium mb-2 flex items-center gap-2">Trauma <Badge variant="secondary">9 criteria</Badge></div>
            <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
              <li>Scene size-up & safety</li>
              <li>BSI / PPE</li>
              <li>General impression & primary survey (ABC)</li>
              <li>C-spine consideration</li>
              <li>Rapid trauma assessment / DCAP-BTLS</li>
              <li>Vital signs obtained</li>
              <li>SAMPLE history</li>
              <li>Appropriate interventions (oxygen, bleeding control, splinting)</li>
              <li>Transport decision and reassessment</li>
            </ul>
          </div>
          <div>
            <div className="font-medium mb-2 flex items-center gap-2">Medical <Badge variant="secondary">9 criteria</Badge></div>
            <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
              <li>Scene size-up & safety</li>
              <li>BSI / PPE</li>
              <li>General impression & primary survey (ABC)</li>
              <li>OPQRST history of present illness</li>
              <li>SAMPLE history</li>
              <li>Vital signs obtained</li>
              <li>Focused physical exam</li>
              <li>Appropriate interventions (oxygen, position, medications)</li>
              <li>Transport decision and reassessment</li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">Each criterion is scored 0 (missed), 1 (partial), 2 (adequate), or 3 (textbook).</p>
        </CardContent>
      </Card>
    </div>
  );
}
