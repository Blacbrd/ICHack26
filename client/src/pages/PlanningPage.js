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
  const [opportunities, setOpportunities] = useState([]); // flattened array of opportunities
  const [paginatedOpportunities, setPaginatedOpportunities] = useState([]);
  const [opportunitiesData, setOpportunitiesData] = useState(null); // grouped by country if needed
  const [rankedOpportunityIds, setRankedOpportunityIds] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  // ... (kept your fun UI/game state)
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
  const [masterIdle, setMasterIdle] = useState(false);
  const masterIdleTimeoutRef = useRef(null);
  const lastMasterActionRef = useRef(Date.now());
  const [showDinosaurGame, setShowDinosaurGame] = useState(false);
  const [theme, setTheme] = useTheme('dark');

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // ------------- LOAD ROOM + PARTICIPANT -------------
  useEffect(() => {
    (async () => {
      if (!user) {
        navigate('/login');
        return;
      }

      // Verify room exists and planning has started
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('planning_started, master_id, selected_opportunity_lat, selected_opportunity_lng, selected_country')
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

      // initial opportunity marker if exists
      if (room.selected_opportunity_lat && room.selected_opportunity_lng) {
        setOpportunityMarker({
          lat: room.selected_opportunity_lat,
          lng: room.selected_opportunity_lng,
          name: null
        });
      }

      if (room.selected_country) {
        setSelectedCountry(room.selected_country);
        if (userIsMaster) {
          lastMasterActionRef.current = Date.now();
        }
      }

      if (room.selected_opportunity_lat && room.selected_opportunity_lng && userIsMaster) {
        lastMasterActionRef.current = Date.now();
      }

      // add participant if missing
      const { data: participant } = await supabase
        .from('room_participants')
        .select('*')
        .eq('room_code', roomCode)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!participant) {
        await supabase
          .from('room_participants')
          .insert({
            room_code: roomCode,
            user_id: user.id,
            is_master: userIsMaster,
          });
      }

      setRoomExists(true);
      setLoading(false);
    })();
  }, [user, roomCode, navigate]);

  // ------------- LOAD OPPORTUNITIES FROM 'charities' TABLE -------------
  useEffect(() => {
    // Fetch all charities -> transform to the old "opportunity" shape your UI expects:
    // { latlon: [lat, lon], country: 'united kingdom', link: '...', name: '...' }
    // Also build grouped data keyed by lowercase country string.
    const fetchCharities = async () => {
      try {
        const { data, error } = await supabase
          .from('charities')
          .select('charity_id, name, email, lat, lon, country, causes, link, created_at');

        if (error) {
          console.error('Failed to fetch charities:', error);
          return;
        }
        if (!data) return;

        const flattened = data.map(row => ({
          // Keep compatibility with previous shape (latlon array + country lowercase)
          latlon: [Number(row.lat), Number(row.lon)],
          country: (row.country || '').toLowerCase(),
          link: row.link || null,
          name: row.name || '(no name)',
          charity_id: row.charity_id,
          email: row.email || null,
          causes: row.causes || [],
          created_at: row.created_at || null,
        }));

        // grouped by country (object with keys being country name)
        const grouped = flattened.reduce((acc, opp) => {
          const c = opp.country || 'unknown';
          if (!acc[c]) acc[c] = [];
          acc[c].push(opp);
          return acc;
        }, {});

        // Update local state and notify any child components
        setOpportunities(flattened);
        setOpportunitiesData(grouped);

        // Keep paginatedOpportunities defaulting to entire list; OpportunitiesPanel may override
        setPaginatedOpportunities(flattened.slice(0, 50)); // first page by default

      } catch (err) {
        console.error('Unexpected error loading charities:', err);
      }
    };

    fetchCharities();

    // Optionally, you could create a realtime subscription to 'charities' for live updates.
    // For now I'm only doing a single fetch — add realtime if desired.
  }, []); // run once on mount

  // ------------- Realtime subscription for rooms (deletion + updates) -------------
  useEffect(() => {
    if (!roomCode) return;

    const channel = supabase
      .channel(`planning-room-${roomCode}`)
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'rooms', filter: `room_code=eq.${roomCode}` },
        () => {
          alert('Room has been deleted.');
          navigate('/');
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `room_code=eq.${roomCode}`,
        },
        (payload) => {
          const { selected_opportunity_lat, selected_opportunity_lng, selected_country } = payload.new || {};
          const oldLat = payload.old?.selected_opportunity_lat;
          const oldLng = payload.old?.selected_opportunity_lng;
          const oldSelectedCountry = payload.old?.selected_country;

          if (selected_country !== oldSelectedCountry ||
              selected_opportunity_lat !== oldLat ||
              selected_opportunity_lng !== oldLng) {
            setMasterIdle(false);
            setShowDinosaurGame(false);
            if (masterIdleTimeoutRef.current) {
              clearTimeout(masterIdleTimeoutRef.current);
              masterIdleTimeoutRef.current = null;
            }
            lastMasterActionRef.current = Date.now();
            masterIdleTimeoutRef.current = setTimeout(() => {
              if (!isMaster) {
                setMasterIdle(true);
              }
            }, 5000);
          }

          if (selected_country !== oldSelectedCountry) {
            setSelectedCountry(selected_country);
            if (selected_country) {
              setOpportunityMarker(null);
            }
          }

          if (selected_opportunity_lat !== oldLat || selected_opportunity_lng !== oldLng) {
            if (!selected_country) {
              if (selected_opportunity_lat && selected_opportunity_lng) {
                setOpportunityMarker({
                  lat: selected_opportunity_lat,
                  lng: selected_opportunity_lng,
                  name: null
                });
              } else {
                setOpportunityMarker(null);
              }
            } else {
              setOpportunityMarker(null);
            }
          }
        }
      )
      .subscribe();

    const hasSelection = selectedCountry || (opportunityMarker && opportunityMarker.lat);
    if (!hasSelection) {
      lastMasterActionRef.current = Date.now();
      masterIdleTimeoutRef.current = setTimeout(() => {
        if (!isMaster) {
          setMasterIdle(true);
        }
      }, 5000);
    }

    return () => {
      supabase.removeChannel(channel);
      if (masterIdleTimeoutRef.current) {
        clearTimeout(masterIdleTimeoutRef.current);
      }
    };
  }, [roomCode, navigate, isMaster, selectedCountry, opportunityMarker]);

  // ------------- Cat invasion, mouse, explosion, and cleanup (kept same) -------------
  // ... (all your existing cat/waft/explosion/hanzila code stays exactly the same)
  // For brevity I keep your code but it is unchanged — copy/paste from your original file:
  // startCatInvasion, stopCatInvasion, handleMouseDown, handleMouseUp, handleMouseMove,
  // useEffect for bounds, ESC handler, handleExplosionClick, handleExplosionEnd, handleHanzilaClick,
  // final cleanup effect, handleLeaveRoom, etc.
  // -------------------------------
  // (I'm including those functions below exactly as you had them.)

  // Cat invasion functionality (same as your original)
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
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [catsActive]);

  const handleExplosionClick = () => {
    if (!explosionActive) {
      setExplosionActive(true);
      if (explosionGifRef.current) {
        const currentSrc = explosionGifRef.current.src;
        explosionGifRef.current.src = '';
        setTimeout(() => {
          if (explosionGifRef.current) {
            explosionGifRef.current.src = currentSrc;
          }
        }, 10);
      }
      if (explosionTimeoutRef.current) {
        clearTimeout(explosionTimeoutRef.current);
      }
      explosionTimeoutRef.current = setTimeout(() => {
        setExplosionActive(false);
        explosionTimeoutRef.current = null;
      }, 5000);
    }
  };

  const handleExplosionEnd = () => {
    if (explosionTimeoutRef.current) {
      clearTimeout(explosionTimeoutRef.current);
      explosionTimeoutRef.current = null;
    }
    setExplosionActive(false);
  };

  const handleHanzilaClick = () => {
    setGlobeImageUrl('/hanzila.png');
    if (globeImageTimeoutRef.current) {
      clearTimeout(globeImageTimeoutRef.current);
    }
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
          <button onClick={() => navigate('/')} className="btn btn-primary">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (!roomExists) {
    return null;
  }

  return (
    <div className={`planning-page ${theme}`}>
      <div className="planning-header">
        <h1>Planning Room: {roomCode}</h1>
        <div className="planning-header-actions">
          <button type="button" className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button 
            onClick={handleLeaveRoom} 
            className="btn btn-leave-room"
          >
            Leave Room
          </button>
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
          title="Explosion!"
          disabled={explosionActive}
        >
          BOOM
        </button>
        <button
          className={`google-careers-button ${buttonsVisible ? 'visible' : ''}`}
          onClick={() => window.open('https://www.google.com/about/careers/applications/jobs/results?target_level=INTERN_AND_APPRENTICE#!t=jo&jid=127025001&', '_blank')}
          title="Google Careers - Internships"
        >
          <span className="google-logo">G</span>
        </button>
        <button
          className={`hanzila-button ${buttonsVisible ? 'visible' : ''}`}
          onClick={handleHanzilaClick}
          title="Change globe to Hanzila (10 seconds)"
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
              setTimeout(() => {
                setExplosionActive(false);
              }, 1000);
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
              console.log('PlanningPage: Country selected:', country);
              setSelectedCountry(country);
              setOpportunityMarker(null);
              if (roomCode) {
                supabase
                  .from('rooms')
                  .update({
                    selected_opportunity_lat: null,
                    selected_opportunity_lng: null,
                    selected_country: country || null
                  })
                  .eq('room_code', roomCode);
              }
            }}
          />
        </div>

        <Chat 
          roomCode={roomCode} 
          userId={user?.id} 
          masterId={masterId} 
          allOpportunities={opportunities}
          onRankUpdate={(ids) => setRankedOpportunityIds(ids)}
          onRankingLoadingChange={(v) => setRankingLoading(v)}
        />

        <OpportunitiesPanel
          roomCode={roomCode}
          selectedCountry={selectedCountry}
          rankedOpportunityIds={rankedOpportunityIds}
          rankingLoading={rankingLoading}
          onOpportunitySelect={(lat, lng, name) => {
            if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) {
              setOpportunityMarker({ lat, lng, name });
              setSelectedCountry(null);
            } else {
              setOpportunityMarker(null);
            }
          }}
          onCountrySelect={(country) => {
            setSelectedCountry(country);
            setOpportunityMarker(null);
            if (roomCode) {
              supabase
                .from('rooms')
                .update({
                  selected_opportunity_lat: null,
                  selected_opportunity_lng: null,
                  selected_country: country || null
                })
                .eq('room_code', roomCode);
            }
          }}
          onOpportunitiesChange={(opps) => {
            setOpportunities(opps);
          }}
          onPaginatedOpportunitiesChange={(paginatedOpps) => {
            setPaginatedOpportunities(paginatedOpps);
          }}
          onOpportunitiesDataChange={(data) => {
            setOpportunitiesData(data);
          }}
          // provide current fetched data directly so panel doesn't need to re-fetch the JSON:
          initialOpportunities={opportunities}
          initialOpportunitiesData={opportunitiesData}
        />
      </div>

      {!isMaster && masterIdle && (
        <button
          className="dinosaur-game-toggle-button"
          onClick={() => setShowDinosaurGame(!showDinosaurGame)}
          title={showDinosaurGame ? "Hide Dinosaur Game" : "Show Dinosaur Game"}
        >
          DINO
        </button>
      )}

      {showDinosaurGame && (
        <DinosaurGame 
          isMaster={isMaster}
          masterIdle={masterIdle}
          onGameEnd={() => {
            setShowDinosaurGame(false);
          }}
        />
      )}
    </div>
  );
};

export default PlanningPage;
