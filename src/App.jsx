import { Routes, Route } from 'react-router-dom';
import Header from '@/components/Header';
import SelectionScreen from '@/pages/SelectionScreen';
import ScenarioRunner from '@/pages/ScenarioRunner';
import TestConnection from '@/pages/TestConnection';
import FeedbackDisplay from '@/pages/FeedbackDisplay';
import About from '@/pages/About';

export default function App() {
  return (
    <div className="max-w-3xl mx-auto px-4">
      <Header />
      <Routes>
        <Route path="/" element={<SelectionScreen />} />
        <Route path="/session/:id" element={<ScenarioRunner />} />
        <Route path="/session/:id/feedback" element={<FeedbackDisplay />} />
        <Route path="/about" element={<About />} />
        <Route path="/test" element={<TestConnection />} />
      </Routes>
    </div>
  );
}
