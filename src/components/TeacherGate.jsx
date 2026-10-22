import { Skeleton } from '@/components/ui/skeleton';
import TeacherSignIn from '@/pages/teacher/TeacherSignIn';
import { useTeacher } from '@/lib/useTeacher';

// Every /teacher/* page renders through this: signed-out visitors get the sign-in form.
export default function TeacherGate({ children }) {
  const { teacher, loading } = useTeacher();
  if (loading) return <Skeleton className="h-24 mt-6" />;
  if (!teacher) return <TeacherSignIn />;
  return children;
}
