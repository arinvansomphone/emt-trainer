import TeacherGate from '@/components/TeacherGate';
import { useTeacher } from '@/lib/useTeacher';

// Every /admin/* page renders through this. The API answers 404 to non-admins; match it here.
function AdminOnly({ children }) {
  const { teacher } = useTeacher();
  if (!teacher.isAdmin) return <p className="mt-6 text-sm text-muted-foreground">Page not found.</p>;
  return children;
}

export default function AdminGate({ children }) {
  return (
    <TeacherGate>
      <AdminOnly>{children}</AdminOnly>
    </TeacherGate>
  );
}
