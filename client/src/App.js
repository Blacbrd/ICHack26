// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import LoginPage from './pages/LoginPage';
import VolunteerLandingPage from './pages/VolunteerLandingPage';
import JoinRoomPage from './pages/JoinRoomPage';
import PublicRoomsPage from './pages/PublicRoomsPage';
import RoomPage from './pages/RoomPage';
import PlanningPage from './pages/PlanningPage';
import CharityReferrals from './pages/CharityReferrals';
import CharityPostPage from './pages/CharityPostPage';
import ChatPage from './pages/ChatPage';
import MyProfile from './pages/MyProfile';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null); // includes is_charity flag
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId) => {
    try {
      // Try charities first (priority)
      const { data: charityData, error: charityError } = await supabase
        .from('charities')
        .select('*')
        .eq('charity_id', userId)
        .maybeSingle();

      if (charityError) throw charityError;

      if (charityData) {
        setProfile({ ...charityData, is_charity: true });
        return;
      }

      // Then try profiles (volunteers)
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (profileData) {
        setProfile({ ...profileData, is_charity: false });
        return;
      }

      setProfile(null);
    } catch (err) {
      console.error('Error loading profile:', err);
      setProfile(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) loadProfile(currentUser.id);
      else setProfile(null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) loadProfile(currentUser.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: '100vh', fontSize: '18px', color: '#666'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

        <Route path="/" element={
          user ? (
            profile?.is_charity ? <CharityReferrals user={user} profile={profile} /> : <VolunteerLandingPage user={user} profile={profile} />
          ) : <Navigate to="/login" replace />
        } />

        <Route path="/join" element={user ? <JoinRoomPage user={user} profile={profile} /> : <Navigate to="/login" replace />} />
        <Route path="/public-rooms" element={user ? <PublicRoomsPage user={user} profile={profile} /> : <Navigate to="/login" replace />} />
        <Route path="/room/:code" element={user ? <RoomPage user={user} profile={profile} /> : <Navigate to="/login" replace />} />
        <Route path="/planning/:code" element={user ? <PlanningPage user={user} profile={profile} /> : <Navigate to="/login" replace />} />
        <Route path="/charity-referrals" element={user ? <CharityReferrals user={user} profile={profile} /> : <Navigate to="/login" replace />} />
        <Route path="/charity-post" element={user ? <CharityPostPage user={user} profile={profile} /> : <Navigate to="/login" replace />} />
        <Route path="/chat/:code" element={user ? <ChatPage user={user} profile={profile} /> : <Navigate to="/login" replace />} />
        <Route path="/profile" element={user ? <MyProfile user={user} profile={profile} /> : <Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
