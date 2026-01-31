import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import JoinRoomPage from './pages/JoinRoomPage';
import PublicRoomsPage from './pages/PublicRoomsPage';
import RoomPage from './pages/RoomPage';
import PlanningPage from './pages/PlanningPage';
import ChatPage from './pages/ChatPage';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#666'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/login" 
          element={user ? <Navigate to="/" replace /> : <LoginPage />} 
        />
        <Route 
          path="/" 
          element={user ? <LandingPage user={user} /> : <Navigate to="/login" replace />} 
        />
        <Route 
          path="/join" 
          element={user ? <JoinRoomPage user={user} /> : <Navigate to="/login" replace />} 
        />
        <Route 
          path="/public-rooms" 
          element={user ? <PublicRoomsPage user={user} /> : <Navigate to="/login" replace />} 
        />
        <Route 
          path="/room/:code" 
          element={user ? <RoomPage user={user} /> : <Navigate to="/login" replace />} 
        />
        <Route
          path="/planning/:code"
          element={user ? <PlanningPage user={user} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/chat/:code"
          element={user ? <ChatPage user={user} /> : <Navigate to="/login" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;

