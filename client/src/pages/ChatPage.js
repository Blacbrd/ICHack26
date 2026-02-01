// src/pages/ChatPage.js
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import useTheme from '../lib/useTheme';
import './ChatPage.css';

const ChatPage = ({ user, profile }) => {
  const { code } = useParams();
  const navigate = useNavigate();
  const roomCode = (code || '').toString().toUpperCase();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCharity, setIsCharity] = useState(false);

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [usernames, setUsernames] = useState({});
  const [masterId, setMasterId] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const [theme, setTheme] = useTheme('dark');
  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    (async () => {
      if (!user) { navigate('/login'); return; }

      // Verify room exists
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('master_id')
        .eq('room_code', roomCode)
        .maybeSingle();

      if (roomError || !room) {
        setError('Room not found or has been deleted.');
        setLoading(false);
        return;
      }
      setMasterId(room.master_id);

      // Determine isCharity using profile prop if present (fast), otherwise check both tables
      if (profile) {
        setIsCharity(Boolean(profile.is_charity));
      } else {
        const { data: profileRow } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
        if (profileRow) setIsCharity(false);
        else {
          const { data: charityRow } = await supabase.from('charities').select('charity_id').eq('charity_id', user.id).maybeSingle();
          setIsCharity(Boolean(charityRow));
        }
      }

      setLoading(false);
    })();
  }, [user, roomCode, navigate, profile]);

  // Load messages (initial + poll)
  useEffect(() => {
    if (!roomCode || loading) return;

    let stopped = false;

    const loadMessages = async () => {
      const { data, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('room_code', roomCode)
        .order('created_at', { ascending: true });

      if (msgError || stopped) return;

      if (data) {
        setMessages(data);

        // Resolve usernames for unique user IDs in messages
        const uniqueUserIds = [...new Set(data.map((m) => m.user_id))];
        const usernameMap = {};

        // For efficiency: batch fetch profiles and charities in parallel
        const [profilesRes, charitiesRes] = await Promise.all([
          supabase.from('profiles').select('id, username, email').in('id', uniqueUserIds),
          supabase.from('charities').select('charity_id, name, email').in('charity_id', uniqueUserIds),
        ]);

        const profiles = profilesRes.data || [];
        const charities = charitiesRes.data || [];

        profiles.forEach((p) => {
          usernameMap[p.id] = p.username || (p.email ? p.email.split('@')[0] : `User ${p.id.substring(0, 8)}`);
        });
        charities.forEach((c) => {
          usernameMap[c.charity_id] = c.name || (c.email ? c.email.split('@')[0] : `User ${c.charity_id.substring(0, 8)}`);
        });

        // Fallback names for any user ids not found in either table
        uniqueUserIds.forEach((uid) => {
          if (!usernameMap[uid]) usernameMap[uid] = `User ${uid?.substring?.(0, 8) ?? uid}`;
        });

        setUsernames(usernameMap);
      }
    };

    loadMessages();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from('messages').select('*').eq('room_code', roomCode).order('created_at', { ascending: true });
      if (data) {
        setMessages((prev) => (data.length > prev.length ? data : prev));
      }
    }, 2000);

    return () => {
      stopped = true;
      clearInterval(pollInterval);
    };
  }, [roomCode, loading]);

  // Real-time subscription for new messages and room deletion
  useEffect(() => {
    if (!roomCode || loading) return;

    const messagesChannel = supabase
      .channel(`chat-page-messages-${roomCode}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_code=eq.${roomCode}`,
      }, (payload) => {
        const newMsg = payload.new;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });

        // Resolve username for this single user if unknown
        setUsernames((prev) => {
          if (prev[newMsg.user_id]) return prev;
          // fetch profile then charity
          supabase.from('profiles').select('username, email').eq('id', newMsg.user_id).maybeSingle().then(({ data: p }) => {
            if (p) {
              const name = p.username || (p.email ? p.email.split('@')[0] : null);
              setUsernames((cur) => ({ ...cur, [newMsg.user_id]: name || `User ${newMsg.user_id.substring(0, 8)}` }));
            } else {
              supabase.from('charities').select('name, email').eq('charity_id', newMsg.user_id).maybeSingle().then(({ data: c }) => {
                if (c) {
                  const name = c.name || (c.email ? c.email.split('@')[0] : null);
                  setUsernames((cur) => ({ ...cur, [newMsg.user_id]: name || `User ${newMsg.user_id.substring(0, 8)}` }));
                } else {
                  setUsernames((cur) => ({ ...cur, [newMsg.user_id]: `User ${newMsg.user_id.substring(0, 8)}` }));
                }
              });
            }
          });
          return prev;
        });
      })
      .subscribe();

    const roomChannel = supabase
      .channel(`chat-page-room-${roomCode}`)
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'rooms',
        filter: `room_code=eq.${roomCode}`
      }, () => {
        alert('This chat room has been closed.');
        navigate('/');
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [roomCode, loading, navigate]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !roomCode || !user?.id) return;

    const messageText = newMessage.trim();
    setNewMessage('');

    const { data, error: sendError } = await supabase
      .from('messages')
      .insert({ room_code: roomCode, user_id: user.id, message: messageText })
      .select()
      .single();

    if (sendError) {
      alert(`Failed to send message: ${sendError.message}`);
      setNewMessage(messageText);
    } else if (data) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, data];
      });
      inputRef.current?.focus();
    }
  };

  const handleCloseChatRoom = async () => {
    if (!window.confirm('Are you sure you want to close this chat room? All participants will be removed.')) return;

    const { error: deleteError } = await supabase.from('rooms').delete().eq('room_code', roomCode);
    if (deleteError) {
      alert('Failed to close chat room.');
      console.error('Error closing chat room:', deleteError);
    } else {
      navigate('/');
    }
  };

  const getUsername = (uid) => usernames[uid] || `User ${uid?.substring?.(0, 8) ?? uid}`;
  const isMasterUser = (uid) => uid === masterId;

  if (loading) {
    return (
      <div className={`chat-page ${theme}`}>
        <div className="chat-page-loading"><p>Loading chat...</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`chat-page ${theme}`}>
        <div className="chat-page-error">
          <p>{error}</p>
          <button onClick={() => navigate('/')} className="chat-page-btn">Go Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-page ${theme}`}>
      <div className="chat-page-header">
        <h1>Chat: {roomCode}</h1>
        <div className="chat-page-header-actions">
          <button type="button" className="chat-page-theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          {isCharity && <button className="chat-page-close-btn" onClick={handleCloseChatRoom}>Close Chat Room</button>}
          <button className="chat-page-btn" onClick={() => navigate('/')}>Leave</button>
        </div>
      </div>

      <div className="chat-page-body">
        <div className="chat-page-container">
          <div className="chat-page-messages">
            {messages.length === 0 ? (
              <div className="chat-page-empty"><p>No messages yet. Start the conversation!</p></div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className="chat-page-message">
                  <div className="chat-page-msg-header">
                    <span className="chat-page-msg-username">
                      {isMasterUser(msg.user_id) && <span className="chat-page-host-badge">Host</span>}
                      {getUsername(msg.user_id)}
                    </span>
                    <span className="chat-page-msg-time">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="chat-page-msg-text">{msg.message}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-page-input-form" onSubmit={handleSendMessage}>
            <input ref={inputRef} type="text" className="chat-page-input" placeholder="Type a message..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} />
            <button type="submit" className="chat-page-send-btn" disabled={!newMessage.trim()}>Send</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
