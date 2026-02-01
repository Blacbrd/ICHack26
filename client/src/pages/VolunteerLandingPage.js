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
  const [activeRoomTab, setActiveRoomTab] = useState('my-rooms'); // 'my-rooms' or 'public-rooms'
  const [publicRooms, setPublicRooms] = useState([]);
  const [expandedDescription, setExpandedDescription] = useState(null);

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
      loadPublicRooms();
    }

    // Subscribe to real-time updates for public rooms
    const channel = supabase
      .channel('volunteer-public-rooms')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: 'is_public=eq.true',
        },
        () => {
          loadPublicRooms();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

  const loadPublicRooms = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('rooms')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;

      // Get participant counts and creator usernames for each room
      const roomsWithCounts = await Promise.all(
        (data || []).map(async (room) => {
          const { count } = await supabase
            .from('room_participants')
            .select('*', { count: 'exact', head: true })
            .eq('room_code', room.room_code);

          // Get creator's username (or email as fallback)
          let creatorUsername = null;
          try {
            const { data: creatorProfile, error: profileError } = await supabase
              .from('profiles')
              .select('username, email')
              .eq('id', room.master_id)
              .maybeSingle();

            if (!profileError && creatorProfile) {
              creatorUsername = creatorProfile.username ||
                creatorProfile.email?.split('@')[0] ||
                creatorProfile.email ||
                null;
            }
          } catch (err) {
            console.error('Error fetching creator profile:', err);
          }

          return {
            ...room,
            participant_count: count || 0,
            creator_username: creatorUsername,
          };
        })
      );

      setPublicRooms(roomsWithCounts);
    } catch (err) {
      console.error('Error loading public rooms:', err);
    }
  };

  const handleJoinPublicRoom = async (roomCode) => {
    try {
      if (!user) {
        alert('Please sign in to join a room.');
        return;
      }

      const currentUser = user;

      // Check if room exists and get planning status
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('planning_started')
        .eq('room_code', roomCode)
        .single();

      if (roomError || !room) {
        alert('Room not found or has been deleted.');
        loadPublicRooms();
        return;
      }

      // If planning has already started, redirect to planning page immediately
      if (room.planning_started) {
        const { data: existing } = await supabase
          .from('room_participants')
          .select('*')
          .eq('room_code', roomCode)
          .eq('user_id', currentUser.id)
          .maybeSingle();

        if (!existing) {
          await supabase
            .from('room_participants')
            .insert({
              room_code: roomCode,
              user_id: currentUser.id,
              is_master: false,
            });
        }

        navigate(`/planning/${roomCode}`);
        return;
      }

      // Check current participant count
      const { count: participantCount } = await supabase
        .from('room_participants')
        .select('*', { count: 'exact', head: true })
        .eq('room_code', roomCode);

      // Check if room is full (max 4 people)
      if (participantCount >= 4) {
        alert('Room is full. Maximum 4 people allowed per room.');
        return;
      }

      // Check if user is already in the room
      const { data: existing } = await supabase
        .from('room_participants')
        .select('*')
        .eq('room_code', roomCode)
        .eq('user_id', currentUser.id)
        .maybeSingle();

      // Only insert if user is not already in the room
      if (!existing) {
        const { error: joinError } = await supabase
          .from('room_participants')
          .insert({
            room_code: roomCode,
            user_id: currentUser.id,
            is_master: false,
          });

        if (joinError && joinError.code !== '23505') {
          throw joinError;
        }
      }

      navigate(`/room/${roomCode}`);
    } catch (err) {
      console.error('Error joining room:', err);
      alert('Failed to join room. Please try again.');
    }
  };

  return (
    <div className={`volunteer-page ${theme}`}>
      <header className="landing-nav">
        <div className="logo-section" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/imcharitable-white.png" alt="IMCharitable" style={{ height: '40px' }} />
        </div>
        <div className="nav-actions" style={{ display: 'flex', gap: '10px' }}>
          <button type="button" className="volunteer-btn-signout" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button
            className="volunteer-btn-signout"
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
          <div className="volunteer-profile-section">
            <div className="profile-avatar">
              <img
                src={user?.user_metadata?.avatar_url || "https://api.dicebear.com/7.x/avataaars/svg?seed=default"}
                alt="Profile"
              />
            </div>
            <div className="profile-name">
              {(() => {
                const name = user?.user_metadata?.username || user?.user_metadata?.full_name || 'Volunteer';
                return name.charAt(0).toUpperCase() + name.slice(1);
              })()}
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

          {/* Rooms Section with Tabs */}
          <div className="my-rooms-section">
            {/* Tab Headers */}
            <div className="room-tabs">
              <button
                className={`room-tab ${activeRoomTab === 'my-rooms' ? 'active' : ''}`}
                onClick={() => setActiveRoomTab('my-rooms')}
              >
                My Rooms
              </button>
              <button
                className={`room-tab ${activeRoomTab === 'public-rooms' ? 'active' : ''}`}
                onClick={() => setActiveRoomTab('public-rooms')}
              >
                Public Rooms
              </button>
            </div>

            {/* My Rooms Tab Content */}
            {activeRoomTab === 'my-rooms' && (
              <>
                {loadingRooms ? (
                  <div className="empty-rooms-state">Loading...</div>
                ) : myRooms.length === 0 ? (
                  <div className="empty-rooms-state">
                    <p>No rooms created yet.<br />Get exploring!</p>
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
              </>
            )}

            {/* Public Rooms Tab Content */}
            {activeRoomTab === 'public-rooms' && (
              <>
                {publicRooms.length === 0 ? (
                  <div className="empty-rooms-state">
                    <p>No public rooms available.</p>
                  </div>
                ) : (
                  <div className="mini-rooms-list">
                    {publicRooms.map(room => (
                      <div key={room.id} className="public-room-item">
                        <div className="public-room-info" onClick={() => handleJoinPublicRoom(room.room_code)}>
                          <span className="mini-room-name">{room.name || `Room ${room.room_code}`}</span>
                          <span className="mini-room-code">#{room.room_code}</span>
                          <span className="public-room-meta">
                            {room.participant_count} {room.participant_count === 1 ? 'member' : 'members'}
                            {room.creator_username && ` • ${room.creator_username}`}
                          </span>
                        </div>
                        {room.description && (
                          <button
                            className="btn-expand-description"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedDescription(expandedDescription === room.id ? null : room.id);
                            }}
                            aria-label="Toggle description"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="1" />
                              <circle cx="12" cy="5" r="1" />
                              <circle cx="12" cy="19" r="1" />
                            </svg>
                          </button>
                        )}
                        {expandedDescription === room.id && room.description && (
                          <div className="public-room-description">
                            <p>{room.description}</p>
                          </div>
                        )}
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
              </>
            )}
          </div>
        </section>

      </main>
    </div>
  );
};

export default VolunteerLandingPage;