// src/pages/CharityReferrals.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import useTheme from '../lib/useTheme';
import './CharityReferrals.css';

// Modal component
const Modal = ({ open, onClose, children, ariaLabel }) => {
  if (!open) return null;

  return (
    <div
      className="cr-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="cr-modal-content"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || 'Modal'}
      >
        <button
          className="cr-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
};

const CharityReferrals = ({ user, profile }) => {
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme('light');

  const [referrals, setReferrals] = useState([]);
  const [recentPosts, setRecentPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRoomParticipants, setActiveRoomParticipants] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [selectedReferral, setSelectedReferral] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [charityInfo, setCharityInfo] = useState(null);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  // Fetch charity info
  useEffect(() => {
    if (!user) return;

    const fetchCharityInfo = async () => {
      const { data } = await supabase
        .from('charities')
        .select('name, email')
        .eq('charity_id', user.id)
        .single();

      if (data) setCharityInfo(data);
    };

    fetchCharityInfo();
  }, [user]);

  // Fetch referrals
  useEffect(() => {
    if (!user) {
      setReferrals([]);
      setLoading(false);
      return;
    }

    const fetchReferrals = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('referrals')
          .select('referral_id, room_id, created_at, rooms(room_code, name)')
          .eq('charity_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching referrals:', error);
          setReferrals([]);
        } else {
          const normalized = (data || []).map((r) => ({
            referral_id: r.referral_id,
            room_id: r.room_id,
            created_at: r.created_at,
            room_code: r.rooms?.room_code || null,
            room_name: r.rooms?.name || null,
          }));
          setReferrals(normalized);
        }
      } catch (err) {
        console.error('Exception fetching referrals', err);
        setReferrals([]);
      } finally {
        setLoading(false);
      }
    };

    fetchReferrals();
  }, [user]);

  // Fetch recent posts
  useEffect(() => {
    if (!user) return;

    const fetchRecentPosts = async () => {
      const { data } = await supabase
        .from('posts')
        .select('id, content, image_urls, created_at')
        .eq('charity_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3);

      if (data) {
        const formatted = data.map(p => {
          let imgs = p.image_urls;
          if (typeof imgs === 'string') {
            try { imgs = JSON.parse(imgs); } catch { imgs = []; }
          }
          return {
            id: p.id,
            content: p.content,
            image: Array.isArray(imgs) && imgs.length > 0 ? imgs[0] : null,
            time: formatTimeAgo(new Date(p.created_at))
          };
        });
        setRecentPosts(formatted);
      }
    };

    fetchRecentPosts();
  }, [user]);

  const formatTimeAgo = (date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    if (diffInSeconds > 86400) return Math.floor(diffInSeconds / 86400) + 'd ago';
    if (diffInSeconds > 3600) return Math.floor(diffInSeconds / 3600) + 'h ago';
    if (diffInSeconds > 60) return Math.floor(diffInSeconds / 60) + 'm ago';
    return 'Just now';
  };

  const generateRoomCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleOpenRoom = async (room) => {
    if (!room) return;

    setSelectedReferral(room);

    let roomCode = room.room_code;

    if (!roomCode && room.room_id) {
      const { data: roomData } = await supabase
        .from('rooms')
        .select('room_code')
        .eq('id', room.room_id)
        .maybeSingle();

      roomCode = roomData?.room_code || null;
    }

    if (!roomCode) {
      alert('Room code not available.');
      return;
    }

    const { data: parts } = await supabase
      .from('room_participants')
      .select('user_id, created_at')
      .eq('room_code', roomCode)
      .order('created_at', { ascending: true });

    const userIds = Array.from(
      new Set((parts || []).map((p) => p.user_id).filter(Boolean))
    );

    let profilesById = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);

      if (profiles) {
        profilesById = profiles.reduce((acc, p) => {
          acc[p.id] = p;
          return acc;
        }, {});
      }
    }

    const names = (parts || []).map((p) => {
      const pr = profilesById[p.user_id];
      return pr?.username ? pr.username : `User ${String(p.user_id).slice(0, 8)}`;
    });

    setActiveRoomParticipants(names);
    setModalTitle(room.room_name || `Room ${roomCode}`);
    setModalOpen(true);
  };

  const handleDeny = async () => {
    if (!selectedReferral?.referral_id) return;

    setDeleting(true);

    const { error } = await supabase
      .from('referrals')
      .delete()
      .eq('referral_id', selectedReferral.referral_id);

    if (!error) {
      setReferrals((prev) =>
        prev.filter((r) => r.referral_id !== selectedReferral.referral_id)
      );
      setModalOpen(false);
      setSelectedReferral(null);
      setActiveRoomParticipants([]);
    } else {
      alert('Failed to delete referral.');
      console.error(error);
    }

    setDeleting(false);
  };

  const handleConfirm = async () => {
    if (!selectedReferral?.room_code) {
      alert('No referral selected or room code not available.');
      return;
    }

    setCreatingChat(true);

    const { data: participants } = await supabase
      .from('room_participants')
      .select('user_id')
      .eq('room_code', selectedReferral.room_code);

    const participantIds = Array.from(
      new Set(
        (participants || [])
          .map((p) => p.user_id)
          .filter((id) => id && id !== user.id)
      )
    );

    if (participantIds.length === 0) {
      alert('No participants found in the original room.');
      setCreatingChat(false);
      return;
    }

    let newRoomCode;
    let attempts = 0;

    while (attempts < 10) {
      newRoomCode = generateRoomCode();
      const { data: existing } = await supabase
        .from('rooms')
        .select('room_code')
        .eq('room_code', newRoomCode)
        .maybeSingle();

      if (!existing) break;
      attempts++;
    }

    const { error: roomError } = await supabase
      .from('rooms')
      .insert({
        room_code: newRoomCode,
        name: `Chat for referral ${selectedReferral.referral_id}`,
        master_id: user.id,
        is_public: false,
      });

    if (roomError) {
      alert('Failed to create new chat room.');
      setCreatingChat(false);
      return;
    }

    const allParticipantIds = [user.id, ...participantIds];

    const records = allParticipantIds.map((uid) => ({
      room_code: newRoomCode,
      user_id: uid,
    }));

    await supabase.from('room_participants').insert(records);

    setModalOpen(false);
    setSelectedReferral(null);
    setActiveRoomParticipants([]);

    navigate(`/chat/${newRoomCode}`);

    setCreatingChat(false);
  };

  const charityName = charityInfo?.name || profile?.username || 'Charity';
  const charityInitials = charityName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div className={`charity-page ${theme}`}>
      {/* Navigation Header */}
      <nav className="charity-nav">
        <div className="charity-nav-left">
          <img src="/imcharitable.png" alt="Logo" className="charity-logo" />
          <span className="charity-nav-title">{charityName}</span>
        </div>
        <div className="charity-nav-right">
          <button className="btn-theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
          <button className="btn-signout" onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Layout */}
      <main className="charity-layout">
        {/* LEFT COLUMN: Recent Posts */}
        <section className="dashboard-card left-column">
          <h3 className="card-title">Recent Posts</h3>
          {recentPosts.length === 0 ? (
            <div className="empty-posts">
              You haven't posted any updates yet. Share your first update with volunteers!
            </div>
          ) : (
            <div className="posts-preview">
              {recentPosts.map(post => (
                <div key={post.id} className="post-preview-item">
                  {post.image && (
                    <img src={post.image} alt="" className="post-preview-image" />
                  )}
                  <div className="post-preview-content">{post.content}</div>
                  <div className="post-preview-time">{post.time}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* MIDDLE COLUMN */}
        <div className="middle-column-wrapper">
          {/* Create Post Button */}
          <button
            className="btn-create-post"
            onClick={() => navigate('/charity-post')}
          >
            ✨ Create Post
          </button>

          {/* Referrals Dashboard */}
          <section className="dashboard-card middle-column">
            <h3 className="card-title">Volunteer Referrals</h3>
            {loading ? (
              <div className="empty-referrals">Loading referrals...</div>
            ) : referrals.length === 0 ? (
              <div className="empty-referrals">
                No referrals yet.<br />
                When volunteer groups choose your charity during planning, they'll appear here.
              </div>
            ) : (
              <div className="referrals-section">
                {referrals.map((r) => (
                  <div
                    key={r.referral_id}
                    className="referral-card"
                    onClick={() => handleOpenRoom(r)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="referral-header">
                      <span className="referral-room-name">
                        {r.room_name || `Room ${r.room_id}`}
                      </span>
                      {r.room_code && (
                        <span className="referral-room-code">{r.room_code}</span>
                      )}
                    </div>
                    <div className="referral-meta">
                      Received {formatTimeAgo(new Date(r.created_at))}
                    </div>
                    <span className="referral-status">Pending Review</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: Dashboard & Stats */}
        <section className="dashboard-card right-column">
          <div className="charity-profile-section">
            <div className="profile-name">Dashboard</div>
          </div>

          <div className="stats-section">
            <h3 className="card-title">Quick Stats</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{referrals.length}</div>
                <div className="stat-label">Referrals</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{recentPosts.length}</div>
                <div className="stat-label">Posts</div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        ariaLabel="Room participants"
      >
        <h3 className="cr-modal-title">{modalTitle}</h3>

        <div className="cr-modal-participants">
          {activeRoomParticipants.length === 0 ? (
            <div className="cr-participant">No participants found</div>
          ) : (
            activeRoomParticipants.map((u, i) => (
              <div key={i} className="cr-participant">{u}</div>
            ))
          )}
        </div>

        <div className="cr-modal-actions">
          <button
            className="btn-confirm"
            onClick={handleConfirm}
            disabled={creatingChat}
          >
            {creatingChat ? 'Creating Chat...' : '✓ Accept & Chat'}
          </button>

          <button
            className="btn-deny"
            onClick={handleDeny}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : '✕ Decline'}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default CharityReferrals;