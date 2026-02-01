// PlanningPage.js
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import GlobeComponent from '../components/globe';
import Chat from '../components/Chat';
import OpportunitiesPanel from '../components/OpportunitiesPanel';
import DinosaurGame from '../components/DinosaurGame';
import useTheme from '../lib/useTheme';
import './PlanningPage.css';

const PlanningPage = ({ user }) => {
  const { code } = useParams();
  const navigate = useNavigate();
  const roomCode = (code || '').toString().toUpperCase();

  const [loading, setLoading] = useState(true);
  const [roomExists, setRoomExists] = useState(false);
  const [error, setError] = useState('');
  const [isMaster, setIsMaster] = useState(false);
  const [masterId, setMasterId] = useState(null);
  const [userId, setUserId] = useState(null);

  const [opportunityMarker, setOpportunityMarker] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);

  const [opportunities, setOpportunities] = useState([]);
  const [paginatedOpportunities, setPaginatedOpportunities] = useState([]);
  const [opportunitiesData, setOpportunitiesData] = useState(null);

  const [rankedOpportunityIds, setRankedOpportunityIds] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);

  const [voiceSelectedIndex, setVoiceSelectedIndex] = useState(null);
  const [voiceGoBack, setVoiceGoBack] = useState(false);

  const [masterIdle, setMasterIdle] = useState(false);
  const masterIdleTimeoutRef = useRef(null);
  const lastMasterActionRef = useRef(Date.now());

  const [showDinosaurGame, setShowDinosaurGame] = useState(false);
  const [theme, setTheme] = useTheme('dark');

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // ---------------- LOAD ROOM ----------------
  useEffect(() => {
    (async () => {
      if (!user) {
        navigate('/login');
        return;
      }

      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select(
          'planning_started, master_id, selected_opportunity_lat, selected_opportunity_lng, selected_country'
        )
        .eq('room_code', roomCode)
        .single();

      if (roomError || !room) {
        setError('Room not found or has been deleted.');
        setLoading(false);
        return;
      }

      if (!room.planning_started) {
        navigate(`/room/${roomCode}`);
        return;
      }

      const userIsMaster = room.master_id === user.id;

      setIsMaster(userIsMaster);
      setMasterId(room.master_id);
      setUserId(user.id);

      if (room.selected_country) {
        setSelectedCountry(room.selected_country);
      }

      if (room.selected_opportunity_lat && room.selected_opportunity_lng) {
        setOpportunityMarker({
          lat: room.selected_opportunity_lat,
          lng: room.selected_opportunity_lng,
          name: null,
        });
      }

      setRoomExists(true);
      setLoading(false);
    })();
  }, [user, roomCode, navigate]);

  // ---------------- LOAD CHARITIES ----------------
  useEffect(() => {
    const fetchCharities = async () => {
      const { data, error } = await supabase
        .from('charities')
        .select(
          'charity_id, name, email, lat, lon, country, causes, link, created_at'
        );

      if (error || !data) return;

      const flattened = data.map(row => ({
        latlon: [Number(row.lat), Number(row.lon)],
        country: (row.country || '').toLowerCase(),
        link: row.link || null,
        name: row.name || '(no name)',
        charity_id: row.charity_id,
        email: row.email || null,
        causes: row.causes || [],
        created_at: row.created_at || null,
      }));

      const grouped = flattened.reduce((acc, opp) => {
        const c = opp.country || 'unknown';
        if (!acc[c]) acc[c] = [];
        acc[c].push(opp);
        return acc;
      }, {});

      setOpportunities(flattened);
      setPaginatedOpportunities(flattened.slice(0, 50));
      setOpportunitiesData(grouped);
    };

    fetchCharities();
  }, []);

  // ---------------- REALTIME ROOM UPDATES ----------------
  useEffect(() => {
    if (!roomCode) return;

    const channel = supabase
      .channel(`planning-room-${roomCode}`)
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'rooms', filter: `room_code=eq.${roomCode}` },
        () => navigate('/')
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `room_code=eq.${roomCode}` },
        payload => {
          const { selected_country, selected_opportunity_lat, selected_opportunity_lng } =
            payload.new || {};

          setSelectedCountry(selected_country || null);

          if (selected_opportunity_lat && selected_opportunity_lng) {
            setOpportunityMarker({
              lat: selected_opportunity_lat,
              lng: selected_opportunity_lng,
              name: null,
            });
          } else {
            setOpportunityMarker(null);
          }

          lastMasterActionRef.current = Date.now();

          if (masterIdleTimeoutRef.current)
            clearTimeout(masterIdleTimeoutRef.current);

          masterIdleTimeoutRef.current = setTimeout(() => {
            if (!isMaster) setMasterIdle(true);
          }, 5000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (masterIdleTimeoutRef.current)
        clearTimeout(masterIdleTimeoutRef.current);
    };
  }, [roomCode, navigate, isMaster]);

  // ---------------- LEAVE ROOM ----------------
  const handleLeaveRoom = async () => {
    if (!user) return;

    if (isMaster) {
      await supabase.from('rooms').delete().eq('room_code', roomCode);
    } else {
      await supabase
        .from('room_participants')
        .delete()
        .eq('room_code', roomCode)
        .eq('user_id', userId);
    }

    navigate('/');
  };

  if (loading) return <div className="planning-page">Loading...</div>;
  if (error) return <div className="planning-page">{error}</div>;
  if (!roomExists) return null;

  return (
    <div className={`planning-page ${theme}`}>
      <div className="planning-header">
        <h1>Planning Room: {roomCode}</h1>
        <div>
          <button onClick={toggleTheme}>
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button onClick={handleLeaveRoom}>Leave Room</button>
        </div>
      </div>

      <div className="planning-content">
        <GlobeComponent
          roomCode={roomCode}
          isMaster={isMaster}
          user={user}
          opportunityMarker={opportunityMarker}
          opportunities={
            paginatedOpportunities.length > 0
              ? paginatedOpportunities
              : opportunities
          }
          selectedCountry={selectedCountry}
          onCountrySelect={country => {
            setSelectedCountry(country);
            setOpportunityMarker(null);

            supabase.from('rooms').update({
              selected_country: country || null,
              selected_opportunity_lat: null,
              selected_opportunity_lng: null,
            }).eq('room_code', roomCode);
          }}
        />

        <Chat
          roomCode={roomCode}
          userId={user?.id}
          masterId={masterId}
          allOpportunities={opportunities}
          selectedCountry={selectedCountry}
          onRankUpdate={ids => setRankedOpportunityIds(ids)}
          onRankingLoadingChange={v => setRankingLoading(v)}
          onVoiceCountrySelect={country => {
            setSelectedCountry(country);
            setOpportunityMarker(null);

            supabase.from('rooms').update({
              selected_country: country,
              selected_opportunity_lat: null,
              selected_opportunity_lng: null,
            }).eq('room_code', roomCode);
          }}
          onVoiceOpportunitySelect={index =>
            setVoiceSelectedIndex(index)
          }
          onVoiceGoBack={() => {
            setOpportunityMarker(null);
            setVoiceGoBack(true);

            supabase.from('rooms').update({
              selected_opportunity_lat: null,
              selected_opportunity_lng: null,
            }).eq('room_code', roomCode);
          }}
          paginatedOpportunities={paginatedOpportunities}
          countriesWithOpportunities={
            opportunitiesData
              ? Object.keys(opportunitiesData)
              : []
          }
        />

        <OpportunitiesPanel
          roomCode={roomCode}
          selectedCountry={selectedCountry}
          rankedOpportunityIds={rankedOpportunityIds}
          rankingLoading={rankingLoading}
          initialOpportunities={opportunities}
          initialOpportunitiesData={opportunitiesData}
          onOpportunitySelect={(lat, lng, name) => {
            setOpportunityMarker({ lat, lng, name });
            setSelectedCountry(null);
          }}
          onVoiceOpportunitySelect={(lat, lng, name) => {
            setOpportunityMarker({ lat, lng, name });
          }}
          onCountrySelect={country => {
            setSelectedCountry(country);
            setOpportunityMarker(null);
          }}
          onPaginatedOpportunitiesChange={setPaginatedOpportunities}
          voiceSelectedIndex={voiceSelectedIndex}
          onVoiceSelectionHandled={() => setVoiceSelectedIndex(null)}
          voiceGoBack={voiceGoBack}
          onVoiceGoBackHandled={() => setVoiceGoBack(false)}
        />
      </div>

      {!isMaster && masterIdle && (
        <button onClick={() => setShowDinosaurGame(!showDinosaurGame)}>
          DINO
        </button>
      )}

      {showDinosaurGame && (
        <DinosaurGame
          isMaster={isMaster}
          masterIdle={masterIdle}
          onGameEnd={() => setShowDinosaurGame(false)}
        />
      )}
    </div>
  );
};

export default PlanningPage;
