// src/pages/CharityReferrals.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import './CharityReferrals.css'; // optional - keep for other styles

// Small, simple modal component
const Modal = ({ open, onClose, children, ariaLabel }) => {
  if (!open) return null;
  return (
    <div
      className="cr-modal-overlay"
      onClick={(e) => {
        // close when clicking the overlay itself
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cr-modal-content" role="dialog" aria-modal="true" aria-label={ariaLabel || 'Modal'}>
        <button className="cr-modal-close" onClick={onClose} aria-label="Close">✕</button>
        {children}
      </div>
    </div>
  );
};

const CharityReferrals = ({ user }) => {
  const navigate = useNavigate();
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRoomParticipants, setActiveRoomParticipants] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [selectedReferral, setSelectedReferral] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) {
      setReferrals([]);
      setLoading(false);
      return;
    }

    const fetchReferrals = async () => {
      setLoading(true);
      try {
        // Select referrals where charity_id = current user
        // Also join the rooms table to get room_code (if foreign key exists)
        const { data, error } = await supabase
          .from('referrals')
          .select('referral_id, room_id, created_at, rooms(room_code, name)')
          .eq('charity_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching referrals:', error);
          setReferrals([]);
        } else {
          // supabase returns nested rooms as rooms: {room_code, name}
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

  // When clicking a referral box, fetch participants for that room_code
  const handleOpenRoom = async (room) => {
    if (!room) return;

    // track which referral is selected for actions (deny/delete)
    setSelectedReferral(room);

    // ensure we have a room_code; if not, attempt to fetch by room_id
    let roomCode = room.room_code;
    if (!roomCode && room.room_id) {
      try {
        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('room_code, id')
          .eq('id', room.room_id)
          .maybeSingle();

        if (roomError) {
          console.error('Failed to fetch room data for room_id', room.room_id, roomError);
          roomCode = null;
        } else {
          roomCode = roomData?.room_code || null;
        }
      } catch (err) {
        console.error('Failed to fetch room data for room_id', room.room_id, err);
        roomCode = null;
      }
    }

    if (!roomCode) {
      alert('Room code not available.');
      return;
    }

    try {
      // 1) Fetch participants (no nested join)
      const { data: parts, error: partsError } = await supabase
        .from('room_participants')
        .select('user_id, created_at')
        .eq('room_code', roomCode)
        .order('created_at', { ascending: true });

      if (partsError) {
        console.error('Error fetching room participants:', partsError);
        setActiveRoomParticipants([]);
        setModalTitle(`Room ${room.room_id} — ${roomCode}`);
        setModalOpen(true);
        return;
      }

      const userIds = Array.from(new Set((parts || []).map((p) => p.user_id).filter(Boolean)));

      // 2) If we have user IDs, fetch usernames from profiles in a separate query
      let profilesById = {};
      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', userIds);

        if (profilesError) {
          // log, but we can still show fallback names
          console.error('Error fetching profiles for participants:', profilesError);
        } else if (profiles && profiles.length > 0) {
          profilesById = profiles.reduce((acc, p) => {
            acc[p.id] = p;
            return acc;
          }, {});
        }
      }

      // Build display names in the original participant order
      const names = (parts || []).map((p) => {
        const profile = profilesById[p.user_id];
        if (profile && profile.username) return profile.username;
        // fallback if profile missing
        return p.user_id ? `User ${String(p.user_id).slice(0, 8)}` : 'Unknown user';
      });

      setActiveRoomParticipants(names);
      setModalTitle(`Room ${room.room_id} — ${roomCode}`);
      setModalOpen(true);
    } catch (err) {
      console.error('Exception fetching participants:', err);
      setActiveRoomParticipants([]);
      setModalTitle(`Room ${room.room_id} — ${room.room_code || ''}`);
      setModalOpen(true);
    }
  };

  // Deny handler: delete referral from database and remove from UI
  const handleDeny = async () => {
    if (!selectedReferral || !selectedReferral.referral_id) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('referrals')
        .delete()
        .eq('referral_id', selectedReferral.referral_id);

      if (error) {
        console.error('Error deleting referral:', error);
        alert('Failed to delete referral. See console for details.');
      } else {
        // remove from local state so UI updates immediately
        setReferrals((prev) => prev.filter((r) => r.referral_id !== selectedReferral.referral_id));
        setModalOpen(false);
        setSelectedReferral(null);
        setActiveRoomParticipants([]);
      }
    } catch (err) {
      console.error('Exception deleting referral:', err);
      alert('Failed to delete referral. See console for details.');
    } finally {
      setDeleting(false);
    }
  };

  // Confirm handler (no-op for now)
  const handleConfirm = () => {
    console.log('Confirm clicked for referral', selectedReferral);
    // intentionally left blank per request
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Fixed Back / Logout button to always be visible */}
      <div
        style={{
          position: 'fixed',
          top: 12,
          left: 12,
          zIndex: 10000,
        }}
      >
        <button
          type="button"
          onClick={async () => {
            try {
              await supabase.auth.signOut();
            } catch (err) {
              // ignore signOut errors, still navigate
              console.error('Sign out error:', err);
            }
            navigate('/login');
          }}
          className="cr-back-button"
          aria-label="Back to login"
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid rgba(0,0,0,0.12)',
            background: '#ffffff',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ← Back / Logout
        </button>
      </div>

      {/* Add top spacer so fixed button doesn't overlap content */}
      <div style={{ height: 48 }} />

      <h1>Charity Referrals</h1>

      {loading ? (
        <p>Loading referrals…</p>
      ) : referrals.length === 0 ? (
        <p>No referrals found for this charity account.</p>
      ) : (
        <div className="cr-list" style={{ marginTop: 12 }}>
          {referrals.map((r) => (
            <div
              key={r.referral_id}
              className="cr-referral-card"
              role="button"
              tabIndex={0}
              onClick={() => {
                setActiveRoomParticipants([]); // clear previous
                handleOpenRoom(r);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') {
                setActiveRoomParticipants([]);
                handleOpenRoom(r);
              }}}
              style={{
                display: 'inline-block',
                margin: 8,
                verticalAlign: 'top',
              }}
            >
              <div className="cr-referral-box">
                <div className="cr-referral-label">RoomID:</div>
                <div className="cr-referral-value">{r.room_id}</div>
              </div>
              <div className="cr-referral-meta">
                <small>{r.room_code ? `Code: ${r.room_code}` : 'No code available'}</small>
                {r.room_name && <div className="cr-room-name">{r.room_name}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedReferral(null);
          setActiveRoomParticipants([]);
        }}
        ariaLabel="Room participants"
      >
        <h3>{modalTitle}</h3>
        <div className="cr-participants-list" style={{ marginBottom: 12 }}>
          {activeRoomParticipants.length === 0 ? (
            <p>No participants found.</p>
          ) : (
            activeRoomParticipants.map((u, idx) => <div key={idx} className="cr-participant">{u}</div>)
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleConfirm}
            className="cr-confirm-button"
            aria-label="Confirm referral"
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.12)',
              background: '#ffffff',
              cursor: 'pointer',
              fontSize: 14,
            }}
            disabled={deleting}
          >
            Confirm
          </button>

          <button
            type="button"
            onClick={handleDeny}
            className="cr-deny-button"
            aria-label="Deny (delete) referral"
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.12)',
              background: '#ffefef',
              cursor: 'pointer',
              fontSize: 14,
            }}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Deny'}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default CharityReferrals;
