import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import useTheme from '../lib/useTheme';
import './RoomPage.css';

const UserIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);

const Crown = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" /><path d="M12 17a1 1 0 0 0 1-1V4" />
  </svg>
);

const RoomPage = ({ user }) => {
  const { code } = useParams();
  const navigate = useNavigate();
  const roomCode = (code || '').toString().toUpperCase();

  const [userId, setUserId] = useState(null);
  const [masterId, setMasterId] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [room, setRoom] = useState(null);
  const [isPublic, setIsPublic] = useState(false);
  const [planningStarted, setPlanningStarted] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomDescription, setRoomDescription] = useState('');
  const [descriptionError, setDescriptionError] = useState('');
  const planningStartedRef = useRef(false);
  const [theme, setTheme] = useTheme('dark');
  const [language, setLanguage] = useState(() => {
    if (typeof window === 'undefined') return 'en';
    return localStorage.getItem('roomLanguage') || 'en';
  });

  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'pt', label: 'Português' },
  ];

  const translations = {
    en: {
      waitingTitle: 'Waiting for Session Start',
      waitingIntro: 'You are in room',
      waitingHost: 'You are the host. Start planning when ready.',
      waitingGuest: 'The host must begin planning.',
      participantsTitle: 'Participants',
      hostBadge: 'Host',
      makePublic: 'Make room public',
      roomNameLabel: 'Room Name',
      roomNameHint: 'Give your public room an inviting title.',
      roomDescriptionLabel: 'Description',
      roomDescriptionHint: 'Share what makes this room special for explorers.',
      beginPlanning: 'Begin Planning',
      deleteRoom: 'Delete Room',
      descriptionRequired: 'Description is required for public rooms. Please fill in the description below.',
      darkMode: 'Dark Mode',
      lightMode: 'Light Mode',
      signOut: 'Sign Out',
      languageAria: 'Select language',
      leaveRoom: 'Leave Room',
    },
    es: {
      waitingTitle: 'Esperando Para Comenzar',
      waitingIntro: 'Estás en la sala',
      waitingHost: 'Eres el anfitrión. Comienza cuando estés listo.',
      waitingGuest: 'El anfitrión debe iniciar la planificación.',
      participantsTitle: 'Participantes',
      hostBadge: 'Anfitrión',
      makePublic: 'Hacer la sala pública',
      roomNameLabel: 'Nombre de la sala',
      roomNameHint: 'Ponle un título atractivo a tu sala pública.',
      roomDescriptionLabel: 'Descripción',
      roomDescriptionHint: 'Conta o que torna esta sala especial para los demás.',
      beginPlanning: 'Comenzar planificación',
      deleteRoom: 'Eliminar sala',
      descriptionRequired: 'Se necesita una descripción para salas públicas. Complétala abajo.',
      darkMode: 'Modo oscuro',
      lightMode: 'Modo claro',
      signOut: 'Cerrar sesión',
      languageAria: 'Selecciona idioma',
      leaveRoom: 'Salir de la sala',
    },
    fr: {
      waitingTitle: 'En Attente du Départ',
      waitingIntro: 'Vous êtes dans la salle',
      waitingHost: 'Vous êtes l’hôte. Lancez la session quand vous êtes prêt.',
      waitingGuest: 'L’hôte doit démarrer la planification.',
      participantsTitle: 'Participants',
      hostBadge: 'Hôte',
      makePublic: 'Rendre la salle publique',
      roomNameLabel: 'Nom de la salle',
      roomNameHint: 'Donnez un titre attrayant à votre salle publique.',
      roomDescriptionLabel: 'Description',
      roomDescriptionHint: 'Expliquez pourquoi cette salle est spéciale.',
      beginPlanning: 'Commencer la planification',
      deleteRoom: 'Supprimer la salle',
      descriptionRequired: 'Une description est requise pour les salles publiques.',
      darkMode: 'Mode sombre',
      lightMode: 'Mode clair',
      signOut: 'Se déconnecter',
      languageAria: 'Sélectionnez la langue',
      leaveRoom: 'Quitter la salle',
    },
    de: {
      waitingTitle: 'Warten auf den Start',
      waitingIntro: 'Du bist im Raum',
      waitingHost: 'Du bist der Gastgeber. Starte, wenn du bereit bist.',
      waitingGuest: 'Der Gastgeber muss die Planung starten.',
      participantsTitle: 'Teilnehmende',
      hostBadge: 'Host',
      makePublic: 'Raum veröffentlichen',
      roomNameLabel: 'Raumname',
      roomNameHint: 'Gib deinem öffentlichen Raum einen einladenden Titel.',
      roomDescriptionLabel: 'Beschreibung',
      roomDescriptionHint: 'Erkläre, was diesen Raum besonders macht.',
      beginPlanning: 'Planung starten',
      deleteRoom: 'Raum löschen',
      descriptionRequired: 'Für öffentliche Räume ist eine Beschreibung erforderlich.',
      darkMode: 'Dunkler Modus',
      lightMode: 'Heller Modus',
      signOut: 'Abmelden',
      languageAria: 'Sprache wählen',
      leaveRoom: 'Raum verlassen',
    },
    pt: {
      waitingTitle: 'Aguardando o Início',
      waitingIntro: 'Você está na sala',
      waitingHost: 'Você é o anfitrião. Comece quando estiver pronto.',
      waitingGuest: 'O anfitrião precisa iniciar o planejamento.',
      participantsTitle: 'Participantes',
      hostBadge: 'Host',
      makePublic: 'Tornar sala pública',
      roomNameLabel: 'Nome da sala',
      roomNameHint: 'Dê um título acolhedor para sua sala pública.',
      roomDescriptionLabel: 'Descrição',
      roomDescriptionHint: 'Conte o que torna esta sala especial.',
      beginPlanning: 'Iniciar planejamento',
      deleteRoom: 'Excluir sala',
      descriptionRequired: 'Descrição obrigatória para salas públicas.',
      darkMode: 'Modo escuro',
      lightMode: 'Modo claro',
      signOut: 'Sair',
      languageAria: 'Selecione o idioma',
      leaveRoom: 'Sair da sala',
    },
  };

  const copy = translations[language] || translations.en;
  const isMaster = useMemo(() => userId && masterId && userId === masterId, [userId, masterId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('roomLanguage', language);
    }
  }, [language]);

  useEffect(() => {
    if (descriptionError) {
      setDescriptionError(copy.descriptionRequired);
    }
  }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshParticipants = async () => {
    const { data, error } = await supabase
      .from('room_participants')
      .select('user_id, is_master')
      .eq('room_code', roomCode)
      .order('is_master', { ascending: false });

    if (!error && data) {
      // Fetch usernames separately
      const participantsWithProfiles = await Promise.all(
        data.map(async (p) => {
          let username = null;

          // Try to get username from profiles table
          try {
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('username, email')
              .eq('id', p.user_id)
              .maybeSingle();

            console.log('Profile fetch for user:', p.user_id, 'Profile:', profile, 'Error:', profileError);

            if (!profileError && profile) {
              // Prioritize: username -> email prefix -> full email -> null
              // This ensures we use the actual username from the profiles table first
              username = profile.username ||
                profile.email?.split('@')[0] ||
                profile.email ||
                null;
            } else if (profileError) {
              console.error('Profile error for user', p.user_id, ':', profileError);
            }
          } catch (err) {
            console.error('Error fetching profile for participant:', err);
          }

          // Always set a username - use fallback if profile doesn't exist
          const displayName = username || `User ${p.user_id.substring(0, 8)}`;

          return {
            user_id: p.user_id,
            is_master: p.is_master,
            profiles: { username: displayName },
          };
        })
      );

      console.log('Participants with profiles:', participantsWithProfiles);
      setParticipants(participantsWithProfiles);
    } else if (error) {
      console.error('Error fetching participants:', error);
    }
  };

  useEffect(() => {
    (async () => {
      if (!user) {
        navigate('/login');
        return;
      }

      setUserId(user.id);

      // Load room info - check if room exists
      const { data: roomData, error: roomErr } = await supabase
        .from('rooms')
        .select('master_id, planning_started, is_public, name, description')
        .eq('room_code', roomCode)
        .single();

      if (roomErr || !roomData) {
        alert('Room not found or has been deleted.');
        navigate('/');
        return;
      }

      setMasterId(roomData.master_id);
      setRoom(roomData);
      setIsPublic(roomData.is_public);
      setPlanningStarted(roomData.planning_started);
      setRoomName(roomData.name || '');
      setRoomDescription(roomData.description || '');
      planningStartedRef.current = roomData.planning_started;

      // If planning has already started, redirect to planning page immediately
      if (roomData.planning_started) {
        // Still add user to room if not already in it
        const { data: existing } = await supabase
          .from('room_participants')
          .select('*')
          .eq('room_code', roomCode)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!existing) {
          await supabase
            .from('room_participants')
            .insert({
              room_code: roomCode,
              user_id: user.id,
              is_master: false,
            });
        }

        navigate(`/planning/${roomCode}`);
        return;
      }

      // Check if user is in room, if not add them
      const { data: existing, error: checkError } = await supabase
        .from('room_participants')
        .select('*')
        .eq('room_code', roomCode)
        .eq('user_id', user.id)
        .maybeSingle();

      // Only insert if user is not already in the room
      if (!existing && !checkError) {
        const { error: insertError } = await supabase
          .from('room_participants')
          .insert({
            room_code: roomCode,
            user_id: user.id,
            is_master: false,
          });

        // 409 Conflict means user is already in room, which is fine
        if (insertError && insertError.code !== '23505') {
          console.error('Error adding participant:', insertError);
        }
      }

      await refreshParticipants();
    })();
  }, [roomCode, navigate, user]);

  // Real-time subscriptions
  useEffect(() => {
    if (!roomCode) return;

    const channel = supabase
      .channel(`room-${roomCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_participants', filter: `room_code=eq.${roomCode}` },
        () => refreshParticipants()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `room_code=eq.${roomCode}` },
        (payload) => {
          const updatedRoom = payload.new;
          setIsPublic(updatedRoom.is_public);
          setRoomName(updatedRoom.name || '');
          setRoomDescription(updatedRoom.description || '');
          const wasPlanningStarted = planningStartedRef.current;
          setPlanningStarted(updatedRoom.planning_started);
          planningStartedRef.current = updatedRoom.planning_started;

          // Redirect all users when planning starts (but only if it just changed from false to true)
          if (!wasPlanningStarted && updatedRoom.planning_started) {
            navigate(`/planning/${roomCode}`);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'rooms', filter: `room_code=eq.${roomCode}` },
        () => {
          // Room was deleted, redirect to home
          alert('Room has been deleted.');
          navigate('/');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode, navigate]);

  const beginPlanning = async () => {
    const { data, error } = await supabase
      .from('rooms')
      .update({ planning_started: true })
      .eq('room_code', roomCode)
      .eq('master_id', user.id)
      .select();

    if (error || !data || data.length === 0) {
      alert('Failed to start planning.');
    } else {
      navigate(`/planning/${roomCode}`);
    }
  };


  const togglePublic = async () => {
    const newIsPublic = !isPublic;

    // If making public, require description before saving
    if (newIsPublic && !roomDescription.trim()) {
      // Allow checkbox to toggle visually, but show error and don't save
      setIsPublic(newIsPublic);
      setDescriptionError(copy.descriptionRequired);
      // Set default name if not set
      if (!roomName) {
        setRoomName(`Room ${roomCode}`);
      }
      return; // Don't save to database yet
    }

    // If making private, allow immediate toggle
    if (!newIsPublic) {
      const { error } = await supabase
        .from('rooms')
        .update({
          is_public: false,
          description: null
        })
        .eq('room_code', roomCode)
        .eq('master_id', userId);

      if (error) {
        alert('Failed to update room settings.');
      } else {
        setIsPublic(false);
        setDescriptionError('');
      }
      return;
    }

    // Making public and description exists - save to database
    const nameToSave = newIsPublic && !roomName ? `Room ${roomCode}` : roomName;

    const { error } = await supabase
      .from('rooms')
      .update({
        is_public: newIsPublic,
        name: nameToSave,
        description: roomDescription.trim() || null
      })
      .eq('room_code', roomCode)
      .eq('master_id', userId);

    if (error) {
      alert('Failed to update room settings.');
      // Revert checkbox state on error
      setIsPublic(!newIsPublic);
    } else {
      setIsPublic(newIsPublic);
      setDescriptionError('');
      if (!roomName && newIsPublic) {
        setRoomName(`Room ${roomCode}`);
      }
    }
  };

  const updateRoomName = async () => {
    if (!roomName.trim()) {
      alert('Room name cannot be empty.');
      return;
    }

    const { error } = await supabase
      .from('rooms')
      .update({ name: roomName.trim() })
      .eq('room_code', roomCode)
      .eq('master_id', userId);

    if (error) {
      alert('Failed to update room name.');
    }
  };

  const updateRoomDescription = async () => {
    // If room is public, description is required
    if (isPublic && !roomDescription.trim()) {
      setDescriptionError(copy.descriptionRequired);
      return;
    }

    setDescriptionError('');

    // If making public and description is now filled, update both is_public and description
    const updateData = { description: roomDescription.trim() || null };

    // If checkbox is checked but room isn't public yet (pending description), make it public now
    if (isPublic && roomDescription.trim()) {
      const nameToSave = !roomName ? `Room ${roomCode}` : roomName;
      updateData.is_public = true;
      updateData.name = nameToSave;
    }

    const { error } = await supabase
      .from('rooms')
      .update(updateData)
      .eq('room_code', roomCode)
      .eq('master_id', userId);

    if (error) {
      alert('Failed to update room description.');
    } else {
      // If we just made it public, ensure state is synced
      if (isPublic && roomDescription.trim() && !roomName) {
        setRoomName(`Room ${roomCode}`);
      }
    }
  };

  const handleDeleteRoom = async () => {
    if (!window.confirm('Are you sure you want to delete this room? This action cannot be undone.')) {
      return;
    }

    try {
      // First delete all participants (handles foreign key constraint)
      const { error: participantsError } = await supabase
        .from('room_participants')
        .delete()
        .eq('room_code', roomCode);

      if (participantsError) {
        console.error('Error deleting participants:', participantsError);
      }

      // Then delete the room
      const { error } = await supabase
        .from('rooms')
        .delete()
        .eq('room_code', roomCode)
        .eq('master_id', userId);

      if (error) {
        alert('Failed to delete room.');
      } else {
        // Room deleted successfully, redirect to home
        navigate('/');
      }
    } catch (err) {
      console.error('Error in handleDeleteRoom:', err);
      alert('Failed to delete room.');
    }
  };

  const handleLeaveRoom = async () => {
    if (!window.confirm('Are you sure you want to leave this room?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('room_participants')
        .delete()
        .eq('room_code', roomCode)
        .eq('user_id', userId);

      if (error) throw error;

      // Left successfully, redirect to home
      navigate('/');
    } catch (err) {
      console.error('Error leaving room:', err);
      alert('Failed to leave room.');
    }
  };

  return (
    <div className={`room-page ${theme}`}>
      <header className="room-header">
        <div className="room-header-title">
          <UserIcon className="icon" />
          <span>Room Code:</span>
          <span className="room-code-display">{roomCode}</span>
        </div>
        <div className="room-header-right">
          <div className="room-controls">
            <div className="language-control">
              <div className="language-select-wrapper">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  aria-label={copy.languageAria}
                >
                  {languageOptions.map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? copy.lightMode : copy.darkMode}
            </button>
          </div>
          {user && (
            <div className="profile-section">
              <div className="profile-info">
                <UserIcon className="profile-icon" />
                <span className="profile-email">{user.email}</span>
              </div>
              <button
                className="btn-profile-signout"
                onClick={async () => {
                  await supabase.auth.signOut();
                }}
              >
                {copy.signOut}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="room-main">
        <div className="room-content">
          <div className="room-info-section">
            <h2 className="room-title">{copy.waitingTitle}</h2>
            <p className="room-description">
              {copy.waitingIntro} <span className="code-highlight">{roomCode}</span>.{' '}
              {isMaster ? copy.waitingHost : copy.waitingGuest}
            </p>
          </div>

          <section className="participants-section">
            <h3 className="participants-title">
              <UserIcon className="icon-small" />
              {copy.participantsTitle} ({participants.length})
            </h3>
            <ul className="participants-list">
              {participants.map((p) => (
                <li key={p.user_id} className={`participant-item ${p.is_master ? 'master' : ''}`}>
                  <span className="participant-icon">
                    {p.is_master ? <Crown className="crown-icon" /> : <UserIcon className="user-icon" />}
                  </span>
                  <span className="participant-name">
                    {p.profiles?.username || `User ${p.user_id.substring(0, 8)}`}
                  </span>
                  {p.is_master && <span className="master-badge">{copy.hostBadge}</span>}
                </li>
              ))}
            </ul>
          </section>

          {isMaster && (
            <div className="master-controls">
              <div className="setting-group">
                <label className="setting-label">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={togglePublic}
                    className="setting-checkbox"
                  />
                  {copy.makePublic}
                </label>
              </div>

              {isPublic && (
                <div className="room-public-fields">
                  <div className="room-name-input-group">
                    <label className="room-name-label">{copy.roomNameLabel}</label>
                    <input
                      type="text"
                      className="room-name-input"
                      placeholder="e.g., Wellbeing Explorers"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      onBlur={updateRoomName}
                    />
                    <p className="room-name-hint">{copy.roomNameHint}</p>
                  </div>
                  <div className="room-description-input-group">
                    <label className="room-name-label">{copy.roomDescriptionLabel}</label>
                    <textarea
                      className="room-description-input"
                      placeholder="Share your mission, travel focus, or vibe."
                      value={roomDescription}
                      onChange={(e) => setRoomDescription(e.target.value)}
                      onBlur={updateRoomDescription}
                      rows={4}
                      required={isPublic}
                    />
                    <p className="room-description-hint">{copy.roomDescriptionHint}</p>
                    {descriptionError && <p className="room-description-error">{descriptionError}</p>}
                  </div>
                </div>
              )}

              <div className="master-actions">
                <button onClick={beginPlanning} className="btn btn-primary btn-large">
                  {copy.beginPlanning}
                </button>
                <button onClick={handleDeleteRoom} className="btn btn-delete">
                  {copy.deleteRoom}
                </button>
              </div>
            </div>
          )}

          {!isMaster && (
            <div className="waiting-message">
              <p>{copy.waitingGuest}</p>
              <div className="guest-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
                <button onClick={handleLeaveRoom} className="btn btn-delete">
                  {copy.leaveRoom}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default RoomPage;
