const FEEDBACK_URL = import.meta.env.VITE_FEEDBACK_URL;

export default function Disclaimer() {
  return (
    <footer className="mt-10 mb-6 border-t pt-4 text-xs text-muted-foreground space-y-1">
      <p>
        For educational practice only — not clinical guidance. Scenarios, patient responses, and grades are
        AI-generated and may contain errors; defer to your protocols and instructors.
      </p>
      <p>
        Conversations are processed by OpenAI. Do not enter real patient information or other personal data.
      </p>
      {FEEDBACK_URL && (
        <p>
          Found a bad scenario or an unfair grade?{' '}
          <a href={FEEDBACK_URL} target="_blank" rel="noreferrer" className="underline">Send feedback</a>.
        </p>
      )}
    </footer>
  );
}
