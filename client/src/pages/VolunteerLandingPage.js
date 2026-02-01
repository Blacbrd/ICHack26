import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import useTheme from '../lib/useTheme';
import './VolunteerLandingPage.css';

const VolunteerLandingPage = ({ user }) => {
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme('dark');
  const [myRooms, setMyRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [creating, setCreating] = useState(false);

  // Toggle Theme Helper
  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // --- MOCK DATA ---
  
  // Left Column: Hardcoded News (Future: API/Gemini)
  const newsItems = [
    { 
      id: 1, 
      tag: "Urgent",
      title: "Turkey-Syria Earthquake Response", 
      snippet: "International aid teams requesting additional translators and medical logistics volunteers in Hatay province immediately." 
    },
    { 
      id: 2, 
      tag: "Alert",
      title: "Flash Floods in Pakistan", 
      snippet: "Rising water levels in Sindh have displaced thousands. Emergency shelter construction volunteers needed for Phase 2 relief." 
    },
    { 
      id: 3, 
      tag: "Update",
      title: "Wildfire Recovery: Rhodes", 
      snippet: "Reforestation projects are opening for registration starting next week. Local transport provided from Athens." 
    },
    { 
      id: 4, 
      tag: "Local",
      title: "Food Bank Shortages", 
      snippet: "City-wide call for evening shift volunteers to assist with meal prep and distribution in downtown centers." 
    },
  ];

  // Middle Column: Charity Feed (Read Only for Volunteers)
  const charityPosts = [
    {
      id: 1,
      charity: "Red Cross International",
      initials: "RC",
      time: "2 hours ago",
      content: "We are deploying 3 new mobile clinics to the flood-affected regions. We are looking for logistics coordinators who can join remotely or on-site. Check the public rooms for 'Flood Relief 2024' to join the planning."
    },
    {
      id: 2,
      charity: "Habitat for Humanity",
      initials: "HH",
      time: "5 hours ago",
      content: "Big thanks to the volunteer team from Room #88291! They successfully mapped out the housing reconstruction plan for the Kathmandu project. Incredible work!"
    },
    {
      id: 3,
      charity: "World Central Kitchen",
      initials: "WC",
      time: "1 day ago",
      content: "Our relief kitchens are now operational. We need volunteers to help manage the supply chain data. If you have experience in logistics, please join our open planning room."
    }
  ];

  // --- LOGIC ---

  useEffect(() => {
    if (user) {
      fetchMyRooms();
    }
  }, [user]);

  const fetchMyRooms = async () => {
    try {
      setLoadingRooms(true);
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
      setLoadingRooms(false);
    }
  };

  const handleBeginExploring = async () => {
    if (!user) return;
    setCreating(true);

    try {
      // Reusing the create room logic from before
      const currentUserId = user.id;
      let roomCode;
      let codeExists = true;
      let attempts = 0;
      const maxAttempts = 10;

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

      await supabase
        .from('room_participants')
        .insert({
          room_code: room.room_code,
          user_id: room.master_id,
          is_master: true,
        });

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
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
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
          <h3 className="card-title">Disaster Alerts</h3>
          <div className="news-list">
            {newsItems.map(news => (
              <div key={news.id} className="news-item">
                <span className="news-badge">{news.tag}</span>
                <div className="news-headline">{news.title}</div>
                <div className="news-snippet">{news.snippet}</div>
              </div>
            ))}
          </div>
        </section>

        {/* MIDDLE COLUMN: CHARITY FEED (READ ONLY) */}
        <section className="dashboard-card middle-column">
          <h3 className="card-title">Latest Updates</h3>
          <div className="feed-section">
            {charityPosts.map(post => (
              <div key={post.id} className="feed-post">
                <div className="post-header">
                  <div className="charity-avatar">{post.initials}</div>
                  <div className="post-info">
                    <span className="charity-name">{post.charity}</span>
                    <span className="post-time">{post.time}</span>
                  </div>
                </div>
                <div className="post-body">{post.content}</div>
              </div>
            ))}
          </div>
        </section>

       {/* RIGHT COLUMN: PROFILE & ROOMS */}
        <section className="dashboard-card right-column">
          {/* Profile Top - New Compact Design */}
          <div className="profile-section">
            <div className="profile-avatar">
              <img 
                src={user?.user_metadata?.avatar_url || "https://api.dicebear.com/7.x/avataaars/svg?seed=default"} 
                alt="Profile" 
              />
            </div>
            <div className="profile-info-compact">
              <div className="profile-name">
                {user?.user_metadata?.username || user?.user_metadata?.full_name || 'Volunteer'}
              </div>
              <div className="profile-email">{user?.email}</div>
            </div>
            <button 
              className="btn-settings"
              onClick={() => navigate('/profile')} /* Navigate to settings page */
              title="Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.39a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>

          {/* My Rooms Section */}
          <div className="my-rooms-section">
            <div className="my-rooms-title">My Rooms</div>
            
            {loadingRooms ? (
              <div className="empty-rooms-state">Loading...</div>
            ) : myRooms.length === 0 ? (
              <div className="empty-rooms-state">
                <p>No rooms created yet.<br/>Get exploring!</p>
              </div>
            ) : (
              <div className="mini-rooms-list">
                {myRooms.map(room => (
                  <div key={room.room_code} className="mini-room-item" onClick={() => navigate(`/room/${room.room_code}`)}>
                    <span className="mini-room-name">{room.name}</span>
                    <span className="mini-room-code">#{room.room_code}</span>
                  </div>
                ))}
              </div>
            )}
            
            <div className="room-actions">
              <button 
                className="btn-full btn-join-room"
                onClick={() => navigate('/join')}
              >
                Join Room
              </button>
              <button 
                className="btn-full btn-begin-exploring"
                onClick={handleBeginExploring}
                disabled={creating}
              >
                {creating ? 'Creating...' : 'Begin Exploring'}
              </button>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
};

export default VolunteerLandingPage;