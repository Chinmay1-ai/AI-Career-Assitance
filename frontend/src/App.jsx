import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import InterviewSession from './pages/InterviewSession.jsx';
import InterviewSetup from './pages/InterviewSetup.jsx';
import InterviewReport from './pages/InterviewReport.jsx';
import Landing from './pages/Landing.jsx';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/interviews/new" element={<InterviewSetup />} />
          <Route path="/interviews/:sessionId" element={<InterviewSession />} />
          <Route path="/interviews/:sessionId/report" element={<InterviewReport />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
