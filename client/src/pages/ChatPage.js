import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import useTheme from '../lib/useTheme';
import './ChatPage.css';

const ChatPage = ({ user }) => {
  const { code } = useParams();
  const navigate = useNavigate();
  const roomCode = (code || '').toString().toUpperCase();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCharity, setIsCharity] = useState(false);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [usernames, setUsernames] = useState({});
  const [masterId, setMasterId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const [theme, setTheme] = useTheme('dark');
  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initial load: verify room, check isCharity
  useEffect(() => {
    (async () => {
      if (!user) {
        navigate('/login');
        return;
      }

      // Verify room exists
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('master_id')
        .eq('room_code', roomCode)
        .single();

      if (roomError || !room) {
        setError('Room not found or has been deleted.');
        setLoading(false);
        return;
      }

      setMasterId(room.master_id);

      // Check isCharity from user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_charity')
        .eq('id', user.id)
        .maybeSingle();

      if (profile && profile.is_charity) {
        setIsCharity(true);
      }

      setLoading(false);
    })();
  }, [user, roomCode, navigate]);

  // Load messages and poll
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

        const uniqueUserIds = [...new Set(data.map((m) => m.user_id))];
        const usernamePromises = uniqueUserIds.map(async (uid) => {
          try {
            const { data: prof } = await supabase
              .from('profiles')
              .select('username, email')
              .eq('id', uid)
              .maybeSingle();

            let username = null;
            if (prof) {
              username =
                prof.username ||
                (prof.email ? prof.email.split('@')[0] : null) ||
                prof.email ||
                null;
            }
            return { userId: uid, username: username || `User ${uid?.substring?.(0, 8) ?? uid}` };
          } catch {
            return { userId: uid, username: `User ${uid?.substring?.(0, 8) ?? uid}` };
          }
        });

        const usernameData = await Promise.all(usernamePromises);
        const usernameMap = {};
        usernameData.forEach(({ userId: uid, username }) => {
          usernameMap[uid] = username;
        });
        setUsernames(usernameMap);
      }
    };

    loadMessages();

    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('room_code', roomCode)
        .order('created_at', { ascending: true });

      if (data) {
        setMessages((prev) => (data.length > prev.length ? data : prev));
      }
    }, 2000);

    return () => {
      stopped = true;
      clearInterval(pollInterval);
    };
  }, [roomCode, loading]);

  // Real-time subscription
  useEffect(() => {
    if (!roomCode || loading) return;

    const channel = supabase
      .channel(`chat-page-messages-${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_code=eq.${roomCode}`,
        },
        (payload) => {
          const newMsg = payload.new;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });

          // Fetch username if not cached
          setUsernames((prev) => {
            if (prev[newMsg.user_id]) return prev;
            supabase
              .from('profiles')
              .select('username, email')
              .eq('id', newMsg.user_id)
              .maybeSingle()
              .then(({ data: prof }) => {
                let username = null;
                if (prof) {
                  username =
                    prof.username ||
                    (prof.email ? prof.email.split('@')[0] : null) ||
                    prof.email ||
                    null;
                }
                const displayName = username || `User ${newMsg.user_id?.substring?.(0, 8) ?? newMsg.user_id}`;
                setUsernames((current) => ({ ...current, [newMsg.user_id]: displayName }));
              });
            return prev;
          });
        }
      )
      .subscribe();

    // Also subscribe to room deletion
    const roomChannel = supabase
      .channel(`chat-page-room-${roomCode}`)
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'rooms', filter: `room_code=eq.${roomCode}` },
        () => {
          alert('This chat room has been closed.');
          navigate('/');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
    if (!window.confirm('Are you sure you want to close this chat room? All participants will be removed.')) {
      return;
    }

    const { error: deleteError } = await supabase
      .from('rooms')
      .delete()
      .eq('room_code', roomCode);

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
        <div className="chat-page-loading">
          <p>Loading chat...</p>
        </div>
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
          {isCharity && (
            <button className="chat-page-close-btn" onClick={handleCloseChatRoom}>
              Close Chat Room
            </button>
          )}
          <button className="chat-page-btn" onClick={() => navigate('/')}>
            Leave
          </button>
        </div>
      </div>

      <div className="chat-page-body">
        <div className="chat-page-container">
          <div className="chat-page-messages">
            {messages.length === 0 ? (
              <div className="chat-page-empty">
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className="chat-page-message">
                  <div className="chat-page-msg-header">
                    <span className="chat-page-msg-username">
                      {isMasterUser(msg.user_id) && <span className="chat-page-host-badge">Host</span>}
                      {getUsername(msg.user_id)}
                    </span>
                    <span className="chat-page-msg-time">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="chat-page-msg-text">{msg.message}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-page-input-form" onSubmit={handleSendMessage}>
            <input
              ref={inputRef}
              type="text"
              className="chat-page-input"
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
            <button type="submit" className="chat-page-send-btn" disabled={!newMessage.trim()}>
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
