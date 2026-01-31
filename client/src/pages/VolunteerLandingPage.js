import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import useTheme from '../lib/useTheme';
import './VolunteerLandingPage.css';

const UserIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

const VolunteerLandingPage = ({ user }) => {
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme('dark');
  const [myRooms, setMyRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [posts, setPosts] = useState([]);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [newPostText, setNewPostText] = useState('');
  const [newPostImages, setNewPostImages] = useState([]);

  // Toggle Theme Helper
  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleCreatePost = () => {
    if (!newPostText.trim() && newPostImages.length === 0) return;
    const imageUrls = newPostImages.map((file) => URL.createObjectURL(file));
    const post = {
      id: Date.now(),
      author: user?.email || 'Anonymous',
      text: newPostText.trim(),
      images: imageUrls,
      createdAt: new Date().toISOString(),
    };
    setPosts((prev) => [post, ...prev]);
    setNewPostText('');
    setNewPostImages([]);
    setShowCreatePost(false);
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || []);
    setNewPostImages((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const removeImage = (index) => {
    setNewPostImages((prev) => prev.filter((_, i) => i !== index));
  };

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
          <h3 className="card-title">Community Feed</h3>
          <div className="feed-section">
            {!showCreatePost ? (
              <button
                className="btn btn-primary btn-create-post"
                onClick={() => setShowCreatePost(true)}
              >
                Create Post
              </button>
            ) : (
              <div className="card create-post-card">
                <textarea
                  className="post-textarea"
                  placeholder="Share an update about your impact journey..."
                  value={newPostText}
                  onChange={(e) => setNewPostText(e.target.value)}
                  rows={4}
                />
                <div className="post-image-upload">
                  <label className="btn btn-secondary btn-upload-label">
                    + Images
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageSelect}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
                {newPostImages.length > 0 && (
                  <div className="post-image-previews">
                    {newPostImages.map((file, i) => (
                      <div key={i} className="preview-thumb">
                        <img src={URL.createObjectURL(file)} alt="" />
                        <button
                          className="preview-remove"
                          onClick={() => removeImage(i)}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="post-form-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowCreatePost(false);
                      setNewPostText('');
                      setNewPostImages([]);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary btn-submit-post"
                    onClick={handleCreatePost}
                    disabled={!newPostText.trim() && newPostImages.length === 0}
                  >
                    Post
                  </button>
                </div>
              </div>
            )}

            {posts.length === 0 ? (
              <div className="feed-empty">No posts yet. Be the first to share!</div>
            ) : (
              <div className="post-feed">
                {posts.map((post) => (
                  <div key={post.id} className="card post-card">
                    <div className="post-author">
                      <UserIcon className="post-author-icon" />
                      <span className="post-author-name">{post.author}</span>
                      <span className="post-time">
                        {new Date(post.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {post.text && <p className="post-content">{post.text}</p>}
                    {post.images.length > 0 && (
                      <div className="post-images">
                        {post.images.map((src, i) => (
                          <img key={i} src={src} alt="" className="post-image" />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
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
              <span className="profile-avatar-text">VW</span>
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
