import { Link } from 'react-router-dom';
import { useTeacher } from '@/lib/useTeacher';

const FEEDBACK_URL = import.meta.env.VITE_FEEDBACK_URL;

export default function Disclaimer() {
  const { teacher } = useTeacher();
  // The admin's way in: "site admin" links to /admin, but only for admins, so the area stays hidden.
  const siteAdmin = teacher?.isAdmin
    ? <Link to="/admin" className="underline underline-offset-2 hover:text-foreground">site admin</Link>
    : 'site admin';

  return (
    <footer className="mt-10 mb-6 border-t pt-4 text-xs text-muted-foreground space-y-1">
      <p>
        For educational practice only — not clinical guidance. Scenarios, patient responses, and grades are
        AI-generated and may contain errors; defer to your protocols and instructors.
      </p>
      <p>
        Conversations are processed by OpenAI. Do not enter real patient information or other personal data.
      </p>
      <p>
        Class runs share your name, email, scores, and transcript with your teacher and the {siteAdmin}; free practice is not shared with teachers, though the site admin may review transcripts (no name or email) to improve the trainer.
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
