// src/pages/CharityReferrals.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import './CharityReferrals.css';

// Small modal component
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

const CharityReferrals = ({ user }) => {
  const navigate = useNavigate();

  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRoomParticipants, setActiveRoomParticipants] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [selectedReferral, setSelectedReferral] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);

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

  // Generate unique room code
  const generateRoomCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += characters.charAt(
        Math.floor(Math.random() * characters.length)
      );
    }
    return result;
  };

  // Open referral modal
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
      const profile = profilesById[p.user_id];
      return profile?.username
        ? profile.username
        : `User ${String(p.user_id).slice(0, 8)}`;
    });

    setActiveRoomParticipants(names);
    setModalTitle(`Room ${room.room_id} — ${roomCode}`);
    setModalOpen(true);
  };

  // Deny referral (delete)
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

  // Confirm referral → create chat
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

  return (
    <div className="cr-container">
      <h1 className="cr-title">Charity Referrals</h1>

      {loading ? (
        <p>Loading referrals…</p>
      ) : referrals.length === 0 ? (
        <p>No referrals found for this charity account.</p>
      ) : (
        <div className="cr-referral-grid">
          {referrals.map((r) => (
            <div
              key={r.referral_id}
              className="cr-referral-card"
              role="button"
              tabIndex={0}
              onClick={() => handleOpenRoom(r)}
            >
              <div>RoomID: {r.room_id}</div>
              <small>
                {r.room_code
                  ? `Code: ${r.room_code}`
                  : 'No code available'}
              </small>
              {r.room_name && <div>{r.room_name}</div>}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        ariaLabel="Room participants"
      >
        <h3>{modalTitle}</h3>

        {activeRoomParticipants.map((u, i) => (
          <div key={i}>{u}</div>
        ))}

        <div className="cr-modal-actions">
          <button 
            onClick={handleConfirm} 
            disabled={creatingChat}
            style={{
              backgroundColor: 'green',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: creatingChat ? 'not-allowed' : 'pointer',
              opacity: creatingChat ? 0.7 : 1,
              marginRight: '10px'
            }}
          >
            {creatingChat ? 'Creating Chat...' : 'Confirm'}
          </button>

          <button
            onClick={handleDeny}
            disabled={deleting}
            style={{
              backgroundColor: 'red',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: deleting ? 'not-allowed' : 'pointer',
              opacity: deleting ? 0.7 : 1
            }}
          >
            {deleting ? 'Deleting…' : 'Deny'}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default CharityReferrals;