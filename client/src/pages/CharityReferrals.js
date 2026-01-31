// src/pages/CharityReferrals.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import './CharityReferrals.css'; // optional - you can inline style if preferred

// Small, simple modal component
const Modal = ({ open, onClose, children }) => {
  if (!open) return null;
  return (
    <div
      className="cr-modal-overlay"
      onClick={(e) => {
        // close when clicking the overlay itself
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cr-modal-content" role="dialog" aria-modal="true">
        <button className="cr-modal-close" onClick={onClose} aria-label="Close">✕</button>
        {children}
      </div>
    </div>
  );
};

const CharityReferrals = ({ user }) => {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRoomParticipants, setActiveRoomParticipants] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');

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
    if (!room || !room.room_code) {
      // If we only have room_id, try to fetch room_code first
      try {
        const { data: roomData } = await supabase
          .from('rooms')
          .select('room_code, id')
          .eq('id', room.room_id)
          .maybeSingle();
        room.room_code = roomData?.room_code || null;
      } catch (err) {
        console.error('Failed to fetch room data for room_id', room.room_id, err);
      }
    }

    if (!room.room_code) {
      alert('Room code not available.');
      return;
    }

    try {
      // Fetch participants and join profiles to get username
      const { data: parts, error } = await supabase
        .from('room_participants')
        .select('user_id, created_at, profiles(username)')
        .eq('room_code', room.room_code)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching room participants:', error);
        setActiveRoomParticipants([]);
      } else {
        const names = (parts || []).map((p) => p.profiles?.username || `User ${p.user_id?.slice(0, 8)}`);
        setActiveRoomParticipants(names);
        setModalTitle(`Room ${room.room_id} — ${room.room_code || ''}`);
        setModalOpen(true);
      }
    } catch (err) {
      console.error('Exception fetching participants:', err);
      setActiveRoomParticipants([]);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>Charity Referrals</h1>

      {loading ? (
        <p>Loading referrals…</p>
      ) : referrals.length === 0 ? (
        <p>No referrals found for this charity account.</p>
      ) : (
        <div className="cr-list">
          {referrals.map((r) => (
            <div
              key={r.referral_id}
              className="cr-referral-card"
              role="button"
              tabIndex={0}
              onClick={() => handleOpenRoom(r)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpenRoom(r); }}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <h3>{modalTitle}</h3>
        <div className="cr-participants-list">
          {activeRoomParticipants.length === 0 ? (
            <p>No participants found.</p>
          ) : (
            activeRoomParticipants.map((u, idx) => <div key={idx} className="cr-participant">{u}</div>)
          )}
        </div>
      </Modal>
    </div>
  );
};

export default CharityReferrals;
