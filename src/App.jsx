import { Routes, Route, useLocation } from 'react-router-dom';
import Header from '@/components/Header';
import SelectionScreen from '@/pages/SelectionScreen';
import ScenarioRunner from '@/pages/ScenarioRunner';
import FeedbackDisplay from '@/pages/FeedbackDisplay';
import JoinClass from '@/pages/JoinClass';
import AssignmentStart from '@/pages/AssignmentStart';
import About from '@/pages/About';
import Disclaimer from '@/components/Disclaimer';
import TeacherGate from '@/components/TeacherGate';
import TeacherClasses from '@/pages/teacher/TeacherClasses';
import ClassOverview from '@/pages/teacher/ClassOverview';
import StudentRuns from '@/pages/teacher/StudentRuns';
import RunDetail from '@/pages/teacher/RunDetail';
import { cn } from '@/lib/utils';

const gated = (el) => <TeacherGate>{el}</TeacherGate>;

export default function App() {
  const { pathname } = useLocation();
  const wide = pathname === '/teacher' || pathname.startsWith('/teacher/');

  return (
    <div className={cn('mx-auto px-4', wide ? 'max-w-5xl' : 'max-w-3xl')}>
      <Header />
      <Routes>
        <Route path="/" element={<SelectionScreen />} />
        <Route path="/session/:id" element={<ScenarioRunner />} />
        <Route path="/session/:id/feedback" element={<FeedbackDisplay />} />
        <Route path="/join/:code" element={<JoinClass />} />
        <Route path="/a/:assignmentId" element={<AssignmentStart />} />
        <Route path="/about" element={<About />} />
        <Route path="/teacher" element={gated(<TeacherClasses />)} />
        <Route path="/teacher/classes/:id" element={gated(<ClassOverview />)} />
        <Route path="/teacher/classes/:id/students/:studentId" element={gated(<StudentRuns />)} />
        <Route path="/teacher/runs/:sessionId" element={gated(<RunDetail />)} />
        <Route path="/teacher/*" element={gated(<TeacherClasses />)} />
      </Routes>
      <Disclaimer />
    </div>
  );
}
