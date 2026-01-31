import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import './PublicRoomsPage.css';

const PublicRoomsPage = ({ user }) => {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedDescription, setExpandedDescription] = useState(null);

  useEffect(() => {
    loadPublicRooms();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('public-rooms')
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
  }, []);

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
              // Use username if available, otherwise use email prefix, otherwise use email
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

      setRooms(roomsWithCounts);
    } catch (err) {
      console.error('Error loading public rooms:', err);
      setError('Failed to load public rooms.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (roomCode) => {
    try {
      if (!user) {
        setError('Please sign in to join a room.');
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
        setError('Room not found or has been deleted.');
        // Reload public rooms list to remove deleted room
        loadPublicRooms();
        return;
      }

      // If planning has already started, redirect to planning page immediately
      if (room.planning_started) {
        // Still add user to room if not already in it
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
        setError('Room is full. Maximum 4 people allowed per room.');
        return;
      }

      // Check if user is already in the room
      const { data: existing, error: checkError } = await supabase
        .from('room_participants')
        .select('*')
        .eq('room_code', roomCode)
        .eq('user_id', currentUser.id)
        .maybeSingle();

      // Only insert if user is not already in the room
      if (!existing && !checkError) {
        // Add user to room
        const { error: joinError } = await supabase
          .from('room_participants')
          .insert({
            room_code: roomCode,
            user_id: currentUser.id,
            is_master: false,
          });

        // 409 Conflict means user is already in room, which is fine
        if (joinError && joinError.code !== '23505') {
          throw joinError;
        }
      }

      navigate(`/room/${roomCode}`);
    } catch (err) {
      console.error('Error joining room:', err);
      setError('Failed to join room. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="public-rooms-page">
        <div className="loading">Loading public rooms...</div>
      </div>
    );
  }

  return (
    <div className="public-rooms-page">
      <div className="public-rooms-container">
        <div className="page-header">
          <h1 className="page-title">Public Rooms</h1>
          <button className="btn btn-link" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {rooms.length === 0 ? (
          <div className="empty-state">
            <p>No public rooms available at the moment.</p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              Create a Room
            </button>
          </div>
        ) : (
          <div className="rooms-list">
            {rooms.map((room) => (
              <div key={room.id} className="room-card">
                <div className="room-info">
                  <div className="room-header">
                    <h3 className="room-name">{room.name || `Room ${room.room_code}`}</h3>
                    {room.description && (
                      <button
                        className="btn-dots"
                        onClick={() => setExpandedDescription(
                          expandedDescription === room.id ? null : room.id
                        )}
                        aria-label="Show description"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="1"/>
                          <circle cx="12" cy="5" r="1"/>
                          <circle cx="12" cy="19" r="1"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  <p className="room-code">Code: {room.room_code}</p>
                  <p className="room-meta">
                    {room.participant_count} participant{room.participant_count !== 1 ? 's' : ''} • Active now
                    {room.creator_username ? (
                      <span className="room-creator">
                        {' • Created by '}
                        <span className="creator-name">{room.creator_username}</span>
                      </span>
                    ) : (
                      <span className="room-creator">
                        {' • Created by '}
                        <span className="creator-name">Unknown</span>
                      </span>
                    )}
                  </p>
                  {expandedDescription === room.id && room.description && (
                    <div className="room-description">
                      <p>{room.description}</p>
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-primary btn-small"
                  onClick={() => handleJoinRoom(room.room_code)}
                >
                  Join
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicRoomsPage;

