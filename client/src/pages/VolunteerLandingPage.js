import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import useTheme from '../lib/useTheme';
import './VolunteerLandingPage.css';

const VolunteerLandingPage = ({ user }) => {
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme('dark');
  const [myRooms, setMyRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Toggle Theme Helper
  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const newsItems = [
    { id: 1, title: "Earthquake Relief in Turkey", snippet: "Urgent volunteers needed for supply distribution centers in Hatay province." },
    { id: 2, title: "Flood Response in Pakistan", snippet: "Medical professionals and general volunteers required for mobile clinics." },
    { id: 3, title: "Wildfire Restoration in Greece", snippet: "Tree planting initiatives starting next month in Rhodes." },
    { id: 4, title: "Food Bank Crisis in London", snippet: "Local shelters seeking evening shift volunteers for meal prep." },
  ];

  useEffect(() => {
    if (user) {
      fetchMyRooms();
    }
  }, [user]);

  const fetchMyRooms = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('room_participants')
        .select(`
          room_code,
          rooms (
            id,
            name,
            description
          )
        `)
        .eq('user_id', user.id);

      if (error) throw error;
      
      const formattedRooms = data.map(item => ({
        room_code: item.room_code,
        name: item.rooms?.name || `Room ${item.room_code}`,
        description: item.rooms?.description
      }));

      setMyRooms(formattedRooms);
    } catch (error) {
      console.error('Error fetching my rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- RESTORED CREATE ROOM LOGIC ---
  const handleCreateRoom = async () => {
    if (!user) return;
    setCreating(true);

    try {
      const currentUserId = user.id;
      let roomCode;
      let codeExists = true;
      let attempts = 0;
      const maxAttempts = 10;

      // 1. Generate Unique Code
      while (codeExists && attempts < maxAttempts) {
        roomCode = Array.from({ length: 6 }, () => {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          return chars[Math.floor(Math.random() * chars.length)];
        }).join('');

        const { data: existing, error: checkError } = await supabase
          .from('rooms')
          .select('room_code')
          .eq('room_code', roomCode)
          .maybeSingle();

        codeExists = !!existing && !checkError;
        attempts++;
      }

      if (attempts >= maxAttempts) throw new Error('Failed to generate unique room code');

      // 2. Insert Room
      const { data: room, error: createError } = await supabase
        .from('rooms')
        .insert({
          room_code: roomCode,
          master_id: currentUserId,
          name: `Room ${roomCode}`,
          is_public: false,
        })
        .select()
        .single();

      if (createError) throw createError;

      // 3. Add Creator as Participant
      await supabase
        .from('room_participants')
        .insert({
          room_code: room.room_code,
          user_id: room.master_id,
          is_master: true,
        });

      // 4. Navigate
      navigate(`/room/${room.room_code}`);
    } catch (err) {
      console.error('Error creating room:', err);
      alert('Failed to create room. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={`volunteer-page ${theme}`}>
      <header className="landing-nav">
        <div className="logo-section" style={{ display: 'flex', alignItems: 'center', gap: '10px'}}>
             <img src="/imc-logo.svg" alt="IMC Logo" style={{ height: '40px' }} />
             <div style={{display:'flex', flexDirection:'column'}}>
                 <span style={{fontWeight:'700', fontSize:'18px'}}>VisaWorld</span>
             </div>
        </div>
        <div className="nav-actions" style={{ display: 'flex', gap: '10px' }}>
          <button type="button" className="btn-profile-signout" onClick={toggleTheme}>
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button 
            className="btn-profile-signout"
            onClick={() => supabase.auth.signOut()}
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="volunteer-layout">
        
        {/* LEFT COLUMN: NEWS */}
        <section className="dashboard-card left-column">
          <h3 className="card-title">News & Alerts</h3>
          <div className="news-list">
            {newsItems.map(news => (
              <div key={news.id} className="news-item">
                <div className="news-headline">{news.title}</div>
                <div className="news-snippet">{news.snippet}</div>
              </div>
            ))}
          </div>
        </section>

        {/* MIDDLE COLUMN: MY ROOMS */}
        <section className="dashboard-card middle-column">
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>Plan Your Impact</h1>
            <p style={{ color: 'var(--muted-color)' }}>Collaborate with your team</p>
          </div>

          <h3 className="card-title" style={{ fontSize: '1rem', borderBottom: 'none' }}>My Rooms</h3>
          
          <div className="rooms-list">
            {loading ? (
              <p style={{ textAlign: 'center', padding: '20px' }}>Loading rooms...</p>
            ) : myRooms.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '20px', color: 'var(--muted-color)' }}>
                You haven't joined any rooms yet.
              </p>
            ) : (
              myRooms.map(room => (
                <div key={room.room_code} className="room-item" onClick={() => navigate(`/room/${room.room_code}`)}>
                  <div>
                    <span className="room-name">{room.name}</span>
                    <span className="room-code">#{room.room_code}</span>
                  </div>
                  <span className="room-arrow">→</span>
                </div>
              ))
            )}
          </div>

          <div className="action-buttons-container">
            <button 
                className="action-btn btn-create" 
                onClick={handleCreateRoom}
                disabled={creating}
            >
              {creating ? 'Creating...' : '+ Create Room'}
            </button>
            <button 
                className="action-btn btn-join" 
                onClick={() => navigate('/join')}
            >
              → Join Room
            </button>
          </div>
        </section>

        {/* RIGHT COLUMN: PROFILE */}
        <section className="dashboard-card right-column">
          <h3 className="card-title">My Profile</h3>
          
          <div className="profile-section">
            <div className="profile-avatar">
               <span style={{color: 'var(--accent-color)'}}>👤</span>
            </div>
            <div className="profile-name">{user?.user_metadata?.full_name || 'Volunteer'}</div>
            <div className="profile-email">{user?.email}</div>
          </div>

          <div className="level-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color:'var(--text-color)' }}>
              <strong>Level 3 Scout</strong>
              <span>350/500 XP</span>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill"></div>
            </div>
          </div>

          <div className="history-list">
            <h4 style={{ fontSize: '0.9rem', marginBottom: '10px', color: 'var(--text-color)' }}>Past Impact</h4>
            <div className="history-item">Build Helper - Nepal 2024</div>
            <div className="history-item">English Tutor - Vietnam 2023</div>
          </div>
        </section>

      </main>
    </div>
  );
};

export default VolunteerLandingPage;