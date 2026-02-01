// PlanningPage.js
import React, { useEffect, useState, useRef, useCallback } from 'react';
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

  // Loading / room state
  const [loading, setLoading] = useState(true);
  const [roomExists, setRoomExists] = useState(false);
  const [error, setError] = useState('');
  const [isMaster, setIsMaster] = useState(false);
  const [masterId, setMasterId] = useState(null);
  const [userId, setUserId] = useState(null);

  // Selection state
  const [opportunityMarker, setOpportunityMarker] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);

  // Opportunities data
  const [opportunities, setOpportunities] = useState([]);
  const [paginatedOpportunities, setPaginatedOpportunities] = useState([]);
  const [opportunitiesData, setOpportunitiesData] = useState(null);

  // Ranking
  const [rankedOpportunityIds, setRankedOpportunityIds] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);

  // Referral / multi-selection state
  const [selectedCharities, setSelectedCharities] = useState([]); // full objects
  const [selectedCharityIds, setSelectedCharityIds] = useState([]); // ids for DB
  const [showSelectedPopup, setShowSelectedPopup] = useState(false);

  // Voice feature state
  const [voiceSelectedIndex, setVoiceSelectedIndex] = useState(null);
  const [voiceGoBack, setVoiceGoBack] = useState(false);

  // UI / fun state
  const [catsActive, setCatsActive] = useState(false);
  const [cats, setCats] = useState([]);
  const catIntervalRef = useRef(null);
  const catContainerRef = useRef(null);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [previousMousePosition, setPreviousMousePosition] = useState({ x: 0, y: 0 });
  const waftRadius = 150;
  const waftPower = 3.5;
  const [explosionActive, setExplosionActive] = useState(false);
  const explosionGifRef = useRef(null);
  const explosionTimeoutRef = useRef(null);
  const [buttonsVisible, setButtonsVisible] = useState(false);
  const hideButtonsTimeoutRef = useRef(null);
  const [globeImageUrl, setGlobeImageUrl] = useState(null);
  const globeImageTimeoutRef = useRef(null);

  // Master idle / dino
  const [masterIdle, setMasterIdle] = useState(false);
  const masterIdleTimeoutRef = useRef(null);
  const lastMasterActionRef = useRef(Date.now());
  const [showDinosaurGame, setShowDinosaurGame] = useState(false);

  // Theme
  const [theme, setTheme] = useTheme('dark');

  // Confirm button loading
  const [confirmLoading, setConfirmLoading] = useState(false);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Helper: get full charity object by id
  const getCharityById = (id) => opportunities.find(c => c.id === id || c.charity_id === id);

  // Toggle charity selection (keeps selectedCharityIds and selectedCharities in sync and writes to rooms.selected_charities)
  const toggleCharitySelection = async (charity) => {
    const exists = selectedCharityIds.includes(charity.id || charity.charity_id);
    let newIds;
    if (exists) {
      newIds = selectedCharityIds.filter(id => id !== (charity.id || charity.charity_id));
    } else {
      if (selectedCharityIds.length >= 5) {
        alert('You can only select up to 5 charities.');
        return;
      }
      newIds = [...selectedCharityIds, (charity.id || charity.charity_id)];
    }

    // Optimistically update UI
    setSelectedCharityIds(newIds);
    const newSelectedObjects = opportunities.filter(opp => newIds.includes(opp.id || opp.charity_id));
    setSelectedCharities(newSelectedObjects);

    // Persist to DB
    try {
      const { error } = await supabase
        .from('rooms')
        .update({ selected_charities: newIds })
        .eq('room_code', roomCode);

      if (error) {
        console.error('Failed to persist selected_charities:', error);
        // revert on error
        // (best-effort: refetch current room value; here we simply revert locally)
        // Revert
        setSelectedCharityIds(selectedCharityIds);
        setSelectedCharities(selectedCharities);
        alert('Failed to save selection. Please try again.');
      }
    } catch (err) {
      console.error('Unexpected error persisting selected_charities:', err);
      setSelectedCharityIds(selectedCharityIds);
      setSelectedCharities(selectedCharities);
    }
  };

  // ----------------- LOAD ROOM + PARTICIPANT -----------------
  useEffect(() => {
    (async () => {
      if (!user) {
        navigate('/login');
        return;
      }

      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('planning_started, master_id, selected_opportunity_lat, selected_opportunity_lng, selected_country, selected_charities')
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

      // selected country / marker
      if (room.selected_country) {
        setSelectedCountry(room.selected_country);
        lastMasterActionRef.current = Date.now();
      }

      if (room.selected_opportunity_lat && room.selected_opportunity_lng) {
        setOpportunityMarker({
          lat: room.selected_opportunity_lat,
          lng: room.selected_opportunity_lng,
          name: null,
        });
        if (userIsMaster) lastMasterActionRef.current = Date.now();
      }

      // ensure participant exists
      const { data: participant } = await supabase
        .from('room_participants')
        .select('*')
        .eq('room_code', roomCode)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!participant) {
        await supabase.from('room_participants').insert({
          room_code: roomCode,
          user_id: user.id,
          is_master: userIsMaster,
        });
      }

      // load selected_charities ids from room if present
      if (room.selected_charities && Array.isArray(room.selected_charities)) {
        setSelectedCharityIds(room.selected_charities);
      }

      setRoomExists(true);
      setLoading(false);
    })();
  }, [user, roomCode, navigate]);

  // ----------------- LOAD CHARITIES -----------------
  useEffect(() => {
    let mounted = true;
    const fetchCharities = async () => {
      try {
        const { data, error } = await supabase
          .from('charities')
          .select('charity_id, name, email, lat, lon, country, causes, link, created_at');

        if (error || !data) {
          // If DB fails, don't crash — keep empty list
          console.warn('Failed to fetch charities or empty result', error);
          if (!mounted) return;
          setOpportunities([]);
          setPaginatedOpportunities([]);
          setOpportunitiesData({});
          setLoading(false);
          return;
        }

        if (!mounted) return;

        const flattened = data.map(row => ({
          // keep compatibility with previous shape
          id: row.charity_id,
          charity_id: row.charity_id,
          name: row.name,
          email: row.email || null,
          lat: Number(row.lat),
          lon: Number(row.lon),
          country: (row.country || '').toLowerCase(),
          causes: row.causes || [],
          link: row.link || '',
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
        setLoading(false);

        // map any pre-loaded selectedCharityIds into full objects
        if (selectedCharityIds && selectedCharityIds.length > 0) {
          const selectedObjects = flattened.filter(opp => selectedCharityIds.includes(opp.id));
          setSelectedCharities(selectedObjects);
        }
      } catch (err) {
        console.error('Unexpected error loading charities:', err);
        if (!mounted) return;
        setOpportunities([]);
        setPaginatedOpportunities([]);
        setOpportunitiesData({});
        setLoading(false);
      }
    };

    fetchCharities();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  // When selectedCharityIds changes (for example loaded from DB), map to full objects if opportunities are loaded
  useEffect(() => {
    if (!opportunities || opportunities.length === 0) return;
    const objs = opportunities.filter(opp => selectedCharityIds.includes(opp.id));
    setSelectedCharities(objs);
  }, [selectedCharityIds, opportunities]);

  // ----------------- Realtime subscription for room changes -----------------
  useEffect(() => {
    if (!roomCode) return;

    const channel = supabase
      .channel(`planning-room-${roomCode}`)
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'rooms', filter: `room_code=eq.${roomCode}` },
        () => {
          alert('Room deleted. Returning to home.');
          navigate('/');
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `room_code=eq.${roomCode}` },
        (payload) => {
          const { selected_opportunity_lat, selected_opportunity_lng, selected_country, selected_charities } = payload.new || {};
          const oldSelectedCharities = payload.old?.selected_charities;

          // Update selected_charities if changed
          if (JSON.stringify(selected_charities || []) !== JSON.stringify(oldSelectedCharities || [])) {
            setSelectedCharityIds(selected_charities || []);
            // Map to objects (opportunities might be already loaded)
            const mapped = (opportunities || []).filter(opp => (selected_charities || []).includes(opp.id));
            setSelectedCharities(mapped);
            console.log('Realtime: selected_charities updated:', selected_charities?.length || 0);
          }

          // Update selected country and opportunity marker
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

          // Master idle handling
          lastMasterActionRef.current = Date.now();
          if (masterIdleTimeoutRef.current) {
            clearTimeout(masterIdleTimeoutRef.current);
          }
          masterIdleTimeoutRef.current = setTimeout(() => {
            if (!isMaster) setMasterIdle(true);
          }, 5000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (masterIdleTimeoutRef.current) clearTimeout(masterIdleTimeoutRef.current);
    };
  }, [roomCode, navigate, isMaster, opportunities]);

  // ----------------- Cat invasion & UI bits -----------------
  const startCatInvasion = () => {
    setCatsActive(true);
    setCats([]);

    const catImages = ['/cat.png', '/cat2.png'];
    const baseCatSize = 80;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const catsPerRow = Math.ceil(screenWidth / baseCatSize) + 2;
    const catsPerCol = Math.ceil(screenHeight / baseCatSize) + 2;
    const totalCats = catsPerRow * catsPerCol;

    let catCount = 0;

    catIntervalRef.current = setInterval(() => {
      if (catCount >= totalCats) {
        clearInterval(catIntervalRef.current);
        return;
      }

      const row = Math.floor(catCount / catsPerRow);
      const col = catCount % catsPerRow;
      const x = col * baseCatSize + (Math.random() * 30 - 15);
      const y = row * baseCatSize + (Math.random() * 30 - 15);
      const rotation = Math.random() * 360;
      const image = catImages[Math.floor(Math.random() * catImages.length)];

      const sizeMultiplier = 0.5 + Math.random() * 3.5;
      const catSize = baseCatSize * sizeMultiplier;

      setCats(prev => [...prev, {
        id: catCount,
        x,
        y,
        rotation,
        image,
        size: catSize
      }]);

      catCount++;
    }, 30);
  };

  const stopCatInvasion = () => {
    setCatsActive(false);
    setCats([]);
    setIsMouseDown(false);
    if (catIntervalRef.current) {
      clearInterval(catIntervalRef.current);
      catIntervalRef.current = null;
    }
  };

  const handleMouseDown = (e) => {
    if (catsActive) {
      setIsMouseDown(true);
      const pos = { x: e.clientX, y: e.clientY };
      setMousePosition(pos);
      setPreviousMousePosition(pos);
    }
  };

  const handleMouseUp = () => {
    setIsMouseDown(false);
  };

  const handleMouseMove = (e) => {
    if (catsActive && isMouseDown) {
      const newPosition = { x: e.clientX, y: e.clientY };
      const deltaX = newPosition.x - previousMousePosition.x;
      const deltaY = newPosition.y - previousMousePosition.y;
      const mouseVelocity = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      setMousePosition(newPosition);
      setPreviousMousePosition(newPosition);

      setCats(prev => prev.map(cat => {
        const catCenterX = cat.x + (cat.size / 2);
        const catCenterY = cat.y + (cat.size / 2);
        const distance = Math.sqrt(
          Math.pow(catCenterX - newPosition.x, 2) +
          Math.pow(catCenterY - newPosition.y, 2)
        );

        if (distance < waftRadius) {
          const angle = Math.atan2(catCenterY - newPosition.y, catCenterX - newPosition.x);
          const distanceFactor = (waftRadius - distance) / waftRadius;
          const velocityFactor = Math.min(mouseVelocity / 10, 2);
          const basePush = (waftRadius - distance) * waftPower;
          const pushDistance = basePush * (1 + distanceFactor) * (1 + velocityFactor * 0.5);
          const newX = cat.x + Math.cos(angle) * pushDistance;
          const newY = cat.y + Math.sin(angle) * pushDistance;

          return {
            ...cat,
            x: newX,
            y: newY
          };
        }

        return cat;
      }));
    } else if (catsActive) {
      const pos = { x: e.clientX, y: e.clientY };
      setMousePosition(pos);
      setPreviousMousePosition(pos);
    }
  };

  useEffect(() => {
    if (!catsActive || cats.length === 0) return;

    const checkCatsBounds = () => {
      setCats(prev => prev.filter(cat => {
        const catRight = cat.x + cat.size;
        const catBottom = cat.y + cat.size;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        return cat.x > -cat.size &&
               cat.y > -cat.size &&
               catRight < screenWidth + cat.size &&
               catBottom < screenHeight + cat.size;
      }));
    };

    const interval = setInterval(checkCatsBounds, 100);
    return () => clearInterval(interval);
  }, [catsActive, cats.length]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && catsActive) {
        stopCatInvasion();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [catsActive]);

  const handleExplosionClick = () => {
    if (!explosionActive) {
      setExplosionActive(true);
      if (explosionGifRef.current) {
        const currentSrc = explosionGifRef.current.src;
        explosionGifRef.current.src = '';
        setTimeout(() => {
          if (explosionGifRef.current) explosionGifRef.current.src = currentSrc;
        }, 10);
      }
      if (explosionTimeoutRef.current) clearTimeout(explosionTimeoutRef.current);
      explosionTimeoutRef.current = setTimeout(() => {
        setExplosionActive(false);
        explosionTimeoutRef.current = null;
      }, 5000);
    }
  };

  const handleHanzilaClick = () => {
    setGlobeImageUrl('/hanzila.png');
    if (globeImageTimeoutRef.current) clearTimeout(globeImageTimeoutRef.current);
    globeImageTimeoutRef.current = setTimeout(() => {
      setGlobeImageUrl(null);
      globeImageTimeoutRef.current = null;
    }, 10000);
  };

  useEffect(() => {
    return () => {
      if (catIntervalRef.current) clearInterval(catIntervalRef.current);
      if (explosionTimeoutRef.current) clearTimeout(explosionTimeoutRef.current);
      if (hideButtonsTimeoutRef.current) clearTimeout(hideButtonsTimeoutRef.current);
      if (globeImageTimeoutRef.current) clearTimeout(globeImageTimeoutRef.current);
      if (masterIdleTimeoutRef.current) clearTimeout(masterIdleTimeoutRef.current);
    };
  }, []);

  // ----------------- Leave room -----------------
  const handleLeaveRoom = async () => {
    if (!user) return;

    if (isMaster) {
      if (!window.confirm('Are you sure you want to leave and delete this room? All participants will be returned to the landing page.')) {
        return;
      }

      const { error } = await supabase
        .from('rooms')
        .delete()
        .eq('room_code', roomCode)
        .eq('master_id', userId);

      if (error) {
        alert('Failed to delete room.');
        console.error('Error deleting room:', error);
      } else {
        navigate('/');
      }
    } else {
      const { error } = await supabase
        .from('room_participants')
        .delete()
        .eq('room_code', roomCode)
        .eq('user_id', userId);

      if (error) {
        alert('Failed to leave room.');
        console.error('Error leaving room:', error);
      } else {
        navigate('/');
      }
    }
  };

  // ----------------- Memoized callbacks for OpportunitiesPanel -----------------
  const handleOpportunitySelect = useCallback((lat, lng, name) => {
    if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) {
      setOpportunityMarker({ lat, lng, name });
      setSelectedCountry(null);
    } else {
      setOpportunityMarker(null);
    }
  }, []);

  const handleCountrySelect = useCallback((country) => {
    setSelectedCountry(country);
    setOpportunityMarker(null);
    if (roomCode) {
      supabase.from('rooms').update({
        selected_opportunity_lat: null,
        selected_opportunity_lng: null,
        selected_country: country || null
      }).eq('room_code', roomCode);
    }
  }, [roomCode]);

  const handleOpportunitiesChange = useCallback((opps) => {
    setOpportunities(opps);
  }, []);

  const handlePaginatedOpportunitiesChange = useCallback((paginatedOpps) => {
    setPaginatedOpportunities(paginatedOpps);
  }, []);

  const handleOpportunitiesDataChange = useCallback((data) => {
    setOpportunitiesData(data);
  }, []);

  // ----------------- Confirm choices -> create referrals -----------------
  const handleConfirmChoices = async () => {
    if (!selectedCharityIds || selectedCharityIds.length === 0) {
      alert('No charities selected to refer. Please select at least one charity.');
      return;
    }
    if (!roomCode) {
      alert('Room code missing. Cannot create referrals.');
      return;
    }

    setConfirmLoading(true);

    try {
      // Get room id
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('id')
        .eq('room_code', roomCode)
        .single();

      if (roomError || !roomData) {
        throw new Error('Unable to find room id for referrals.');
      }

      const roomId = roomData.id;
      const inserts = selectedCharityIds.map(cid => ({ room_id: roomId, charity_id: cid }));

      const { data: inserted, error: insertError } = await supabase
        .from('referrals')
        .insert(inserts)
        .select('*');

      if (insertError) {
        console.error('Error inserting referrals:', insertError);
        alert('Failed to create referrals: ' + (insertError.message || JSON.stringify(insertError)));
      } else {
        const createdCount = Array.isArray(inserted) ? inserted.length : (inserted ? 1 : 0);
        alert(`Successfully created ${createdCount} referral${createdCount === 1 ? '' : 's'}.`);
        console.log('Referrals created:', inserted);
        setShowSelectedPopup(false);
      }
    } catch (err) {
      console.error('Unexpected error creating referrals:', err);
      alert('Unexpected error creating referrals. See console for details.');
      setShowSelectedPopup(false);
    } finally {
      setConfirmLoading(false);
    }
  };

  // ----------------- Render -----------------
  if (loading) {
    return (
      <div className="planning-page">
        <div className="planning-loading">
          <p>Loading planning session...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="planning-page">
        <div className="planning-error">
          <p>{error}</p>
          <button onClick={() => navigate('/')} className="btn btn-primary">Go Home</button>
        </div>
      </div>
    );
  }

  if (!roomExists) return null;

  return (
    <div className={`planning-page ${theme}`}>
      <div className="planning-header">
        <h1>Planning Room: {roomCode}</h1>

        {/* Selected charities button (multi-select panel) */}
        <button
          className="btn btn-primary"
          style={{ margin: '0 20px' }}
          onClick={() => setShowSelectedPopup(true)}
        >
          Show selected charities ({selectedCharities.length})
        </button>

        <div className="planning-header-actions">
          <button type="button" className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button onClick={handleLeaveRoom} className="btn btn-leave-room">Leave Room</button>
        </div>
      </div>

      <div
        className="button-container"
        onMouseEnter={() => {
          if (hideButtonsTimeoutRef.current) {
            clearTimeout(hideButtonsTimeoutRef.current);
            hideButtonsTimeoutRef.current = null;
          }
          setButtonsVisible(true);
        }}
        onMouseLeave={() => {
          hideButtonsTimeoutRef.current = setTimeout(() => {
            setButtonsVisible(false);
          }, 300);
        }}
      >
        <div className="button-hover-area" />
        <button
          className={`cat-invasion-button ${buttonsVisible ? 'visible' : ''}`}
          onClick={catsActive ? stopCatInvasion : startCatInvasion}
          title={catsActive ? "Stop cat invasion (or press ESC)" : "Start cat invasion!"}
        >
          CAT
        </button>
        <button
          className={`explosion-button ${buttonsVisible ? 'visible' : ''}`}
          onClick={handleExplosionClick}
          disabled={explosionActive}
        >
          BOOM
        </button>
        <button
          className={`google-careers-button ${buttonsVisible ? 'visible' : ''}`}
          onClick={() => window.open('https://www.google.com/about/careers/', '_blank')}
        >
          <span className="google-logo">G</span>
        </button>
        <button
          className={`hanzila-button ${buttonsVisible ? 'visible' : ''}`}
          onClick={handleHanzilaClick}
        >
          MAP
        </button>
      </div>

      {catsActive && (
        <div
          className="cat-overlay"
          ref={catContainerRef}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onMouseMove={handleMouseMove}
          style={{ cursor: isMouseDown ? 'grab' : 'default' }}
        >
          {cats.map(cat => (
            <img
              key={cat.id}
              src={cat.image}
              alt="cat"
              className="cat-image"
              style={{
                position: 'absolute',
                left: `${cat.x}px`,
                top: `${cat.y}px`,
                transform: `rotate(${cat.rotation}deg)`,
                width: `${cat.size}px`,
                height: `${cat.size}px`,
                pointerEvents: 'none',
                zIndex: 9999,
                transition: isMouseDown ? 'left 0.1s ease-out, top 0.1s ease-out' : 'none',
              }}
            />
          ))}
          {isMouseDown && (
            <div
              style={{
                position: 'absolute',
                left: `${mousePosition.x - waftRadius}px`,
                top: `${mousePosition.y - waftRadius}px`,
                width: `${waftRadius * 2}px`,
                height: `${waftRadius * 2}px`,
                borderRadius: '50%',
                border: '2px dashed rgba(252, 211, 77, 0.5)',
                pointerEvents: 'none',
                zIndex: 10000,
              }}
            />
          )}
        </div>
      )}

      {explosionActive && (
        <div className="explosion-overlay">
          <img
            ref={explosionGifRef}
            src="/explosion-green-screen.gif"
            alt="explosion"
            className="explosion-gif"
            onError={(e) => {
              console.error('Failed to load explosion GIF:', e);
              setTimeout(() => setExplosionActive(false), 1000);
            }}
          />
        </div>
      )}

      <div className="planning-content">
        <div className="globe-wrapper">
          <GlobeComponent
            roomCode={roomCode}
            isMaster={isMaster}
            user={user}
            opportunityMarker={opportunityMarker}
            opportunities={paginatedOpportunities.length > 0 ? paginatedOpportunities : opportunities}
            customGlobeImage={globeImageUrl}
            onCountrySelect={(country) => {
              setSelectedCountry(country);
              setOpportunityMarker(null);
              if (roomCode) {
                supabase.from('rooms').update({
                  selected_opportunity_lat: null,
                  selected_opportunity_lng: null,
                  selected_country: country || null
                }).eq('room_code', roomCode);
              }
            }}
          />
        </div>

        <Chat
          roomCode={roomCode}
          userId={user?.id}
          masterId={masterId}
          allOpportunities={opportunities}
          selectedCountry={selectedCountry}
          onRankUpdate={(ids) => setRankedOpportunityIds(ids)}
          onRankingLoadingChange={(v) => setRankingLoading(v)}
          onVoiceCountrySelect={(country) => {
            setSelectedCountry(country);
            setOpportunityMarker(null);
            supabase.from('rooms').update({
              selected_country: country,
              selected_opportunity_lat: null,
              selected_opportunity_lng: null,
            }).eq('room_code', roomCode);
          }}
          onVoiceOpportunitySelect={(index) => setVoiceSelectedIndex(index)}
          onVoiceGoBack={() => {
            setOpportunityMarker(null);
            setVoiceGoBack(true);
            supabase.from('rooms').update({
              selected_opportunity_lat: null,
              selected_opportunity_lng: null,
            }).eq('room_code', roomCode);
          }}
          paginatedOpportunities={paginatedOpportunities}
          countriesWithOpportunities={opportunitiesData ? Object.keys(opportunitiesData) : []}
        />

        <OpportunitiesPanel
          roomCode={roomCode}
          selectedCountry={selectedCountry}
          rankedOpportunityIds={rankedOpportunityIds}
          rankingLoading={rankingLoading}

          // selection props
          selectedCharities={selectedCharities}
          onToggleCharity={toggleCharitySelection}

          // opportunity/country handlers (memoized)
          onOpportunitySelect={handleOpportunitySelect}
          onCountrySelect={handleCountrySelect}
          onOpportunitiesChange={handleOpportunitiesChange}
          onPaginatedOpportunitiesChange={handlePaginatedOpportunitiesChange}
          onOpportunitiesDataChange={handleOpportunitiesDataChange}

          // voice props
          voiceSelectedIndex={voiceSelectedIndex}
          onVoiceSelectionHandled={() => setVoiceSelectedIndex(null)}
          voiceGoBack={voiceGoBack}
          onVoiceGoBackHandled={() => setVoiceGoBack(false)}

          // voice -> globe handler
          onVoiceOpportunitySelect={(lat, lng, name) => {
            setOpportunityMarker({ lat, lng, name });
          }}

          // provide current fetched data directly so panel doesn't need to re-fetch:
          initialOpportunities={opportunities}
          initialOpportunitiesData={opportunitiesData}

          // update local paginated/opportunities if child decides to notify:
          // (child will call these stable handlers)
          // onPaginatedOpportunitiesChange passed above already points to handlePaginatedOpportunitiesChange
        />
      </div>

      {!isMaster && masterIdle && (
        <button className="dinosaur-game-toggle-button" onClick={() => setShowDinosaurGame(!showDinosaurGame)}>
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

      {/* Selected charities popup */}
      {showSelectedPopup && (
        <div
          className="selected-charities-overlay"
          onClick={() => setShowSelectedPopup(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 20000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            className="selected-charities-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme === 'dark' ? '#1f2937' : '#fff',
              color: theme === 'dark' ? '#fff' : '#000',
              padding: '2rem',
              borderRadius: '12px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
          >
            <h2>Selected Charities</h2>
            <p style={{ marginBottom: '1rem', opacity: 0.7 }}>
              You have selected {selectedCharities.length} / 5 charities.
            </p>

            <div className="modal-list">
              {selectedCharities.length === 0 && <p>No charities selected yet.</p>}

              {selectedCharities.map(opp => (
                <div
                  key={opp.id}
                  style={{
                    border: '1px solid #4b5563',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{opp.name}</div>
                  <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>{opp.country}</div>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '5px'
                  }}>
                    {opp.link && (
                      <a href={opp.link} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none' }}>
                        Learn more →
                      </a>
                    )}

                    <input
                      type="checkbox"
                      checked={true}
                      onChange={() => toggleCharitySelection(opp)}
                      style={{ transform: 'scale(1.5)', cursor: 'pointer' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={handleConfirmChoices}
                disabled={confirmLoading}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: confirmLoading ? 'not-allowed' : 'pointer',
                  opacity: confirmLoading ? 0.8 : 1
                }}
              >
                {confirmLoading ? 'Creating referrals...' : `Confirm Choices (${selectedCharities.length})`}
              </button>

              <button
                onClick={() => setShowSelectedPopup(false)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanningPage;
