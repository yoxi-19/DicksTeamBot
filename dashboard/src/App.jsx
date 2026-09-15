import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import PlayersPage from './pages/PlayersPage.jsx';
import TeamPage from './pages/TeamPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import LogsPage from './pages/LogsPage.jsx';
import ConsolePage from './pages/ConsolePage.jsx';
import AfkPage from './pages/AfkPage.jsx';
import PaymentsPage from './pages/PaymentsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-windsmp-primary text-lg">Lade...</div>
      </div>
    );
  }
  return isAuthenticated ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="spieler" element={<PlayersPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="console" element={<ConsolePage />} />
        <Route path="afk" element={<AfkPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="einstellungen" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}