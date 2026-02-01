import React, { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import './OpportunitiesPanel.css';

const OpportunitiesPanel = ({
  roomCode,
  onOpportunitySelect,
  onVoiceOpportunitySelect,
  selectedCountry,
  onOpportunitiesChange,
  onCountrySelect,
  onPaginatedOpportunitiesChange,
  onOpportunitiesDataChange,
  rankedOpportunityIds,
  rankingLoading,
  // --- NEW PROPS FOR SELECTION ---
  selectedCharities,
  onToggleCharity,
  // -------------------------------
  // Voice-related props
  voiceSelectedIndex,
  onVoiceSelectionHandled,
  voiceGoBack,
  onVoiceGoBackHandled,
}) => {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState(null);
  const [error, setError] = useState(null);
  const [showAllOpportunities, setShowAllOpportunities] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const debounceTimerRef = useRef(null);

  // Store the full grouped data (object keyed by country)
  const [opportunitiesData, setOpportunitiesData] = useState(null);
  const [filteredOpportunities, setFilteredOpportunities] = useState([]);

  // Keep a ref to the latest opportunities so realtime subscription handlers
  // don't require re-subscribing when opportunities array identity changes
  const opportunitiesRef = useRef(opportunities);
  useEffect(() => {
    opportunitiesRef.current = opportunities;
  }, [opportunities]);

  // Helper function to validate and normalize opportunities
  // Accepts either the old JSON shape or the new DB row shape.
  const validateAndNormalize = (opportunitiesList) => {
    if (!Array.isArray(opportunitiesList)) {
      console.warn('validateAndNormalize: opportunitiesList is not an array:', opportunitiesList);
      return [];
    }

    const validated = opportunitiesList
      .map((opp, index) => {
        // New DB row format: { charity_id, name, lat, lon, country, link, causes, ... }
        // Old JSON format: { latlon: [lat, lng], name, country, link, id }
        let lat, lng;
        if (Array.isArray(opp.latlon) && opp.latlon.length === 2) {
          [lat, lng] = opp.latlon;
        } else if (typeof opp.lat === 'number' && typeof opp.lon === 'number') {
          lat = opp.lat;
          lng = opp.lon;
        } else if (typeof opp.lat === 'number' && typeof opp.lng === 'number') {
          // defensive: some rows might use lng instead of lon
          lat = opp.lat;
          lng = opp.lng;
        } else if (opp.coordinates && Array.isArray(opp.coordinates) && opp.coordinates.length === 2) {
          [lat, lng] = opp.coordinates;
        }

        const name = opp.name || opp.title || opp.Name || `Opportunity ${index + 1}`;
        const link = opp.link || opp.url || opp.Link || '';
        const country = (opp.country || opp.Country || opp.location || 'Unknown').toString();
        const id = opp.charity_id || opp.id || `opp-${index}`;

        if (typeof lat !== 'number' || typeof lng !== 'number') {
          console.warn(`Invalid coordinates for opportunity ${index}:`, opp);
          return null;
        }

        return {
          id,
          lat,
          lng,
          name,
          link,
          country,
          // keep raw DB fields for later use if needed:
          raw: opp,
        };
      })
      .filter((opp) => opp !== null); // Remove invalid entries

    console.debug(`validateAndNormalize: ${opportunitiesList.length} input, ${validated.length} validated`);
    return validated;
  };

  // Load opportunities (from Supabase 'charities' table). Falls back to legacy JSON if DB fails.
  useEffect(() => {
    let mounted = true;

    const fetchFromDb = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('charities')
          .select('charity_id, name, email, lat, lon, country, causes, link, created_at');

        if (error) {
          console.warn('OpportunitiesPanel: Supabase select error, falling back to JSON:', error);
          // fallback to JSON file (legacy)
          await fetchFromJson();
          return;
        }

        if (!data || !Array.isArray(data)) {
          // fallback to JSON
          await fetchFromJson();
          return;
        }

        if (!mounted) return;

        const flattened = data.map((row) => ({
          charity_id: row.charity_id,
          name: row.name,
          email: row.email,
          lat: Number(row.lat),
          lon: Number(row.lon),
          country: row.country || '',
          causes: row.causes || [],
          link: row.link || '',
          created_at: row.created_at || null,
        }));

        const validated = validateAndNormalize(flattened);

        // Build grouped object keyed by lowercased country
        const grouped = validated.reduce((acc, opp) => {
          const c = (opp.country || 'unknown').toLowerCase();
          if (!acc[c]) acc[c] = [];
          acc[c].push(opp);
          return acc;
        }, {});

        setOpportunities(validated);
        setFilteredOpportunities(validated); // Initialize filtered opportunities
        setOpportunitiesData(grouped);
        setError(null);
        setLoading(false);

        // notify parent
        if (onOpportunitiesChange) onOpportunitiesChange(validated);
        if (onOpportunitiesDataChange) onOpportunitiesDataChange(grouped);
        if (onPaginatedOpportunitiesChange) onPaginatedOpportunitiesChange(validated.slice(0, itemsPerPage));
      } catch (err) {
        console.error('Unexpected error fetching charities:', err);
        // fallback to JSON
        await fetchFromJson();
      }
    };

    const fetchFromJson = async () => {
      try {
        const response = await fetch('/opportunities.json');
        if (!response.ok) throw new Error('Failed to load opportunities.json');
        const data = await response.json();

        // The old JSON used keys per-country and had a 'hardcode' array.
        // Build a flattened array from all country keys.
        const countryKeys = Object.keys(data || {});
        const all = [];

        // If file had the shape { "united kingdom": [...], hardcode: [...] } etc.
        for (const key of countryKeys) {
          const arr = data[key];
          if (!Array.isArray(arr)) continue;
          for (const item of arr) {
            // preserve the original per-country key if individual items don't include country
            const enriched = { ...item, country: item.country || key };
            all.push(enriched);
          }
        }

        const validated = validateAndNormalize(all);

        // group
        const grouped = validated.reduce((acc, opp) => {
          const c = (opp.country || 'unknown').toLowerCase();
          if (!acc[c]) acc[c] = [];
          acc[c].push(opp);
          return acc;
        }, {});

        if (!mounted) return;

        setOpportunities(validated);
        setFilteredOpportunities(validated); // Initialize filtered opportunities
        setOpportunitiesData(grouped);
        setError(null);
        setLoading(false);

        if (onOpportunitiesChange) onOpportunitiesChange(validated);
        if (onOpportunitiesDataChange) onOpportunitiesDataChange(grouped);
        if (onPaginatedOpportunitiesChange) onPaginatedOpportunitiesChange(validated.slice(0, itemsPerPage));
      } catch (err) {
        console.error('Error loading opportunities.json fallback:', err);
        if (!mounted) return;
        setError('Failed to load opportunities (DB and JSON fallback failed).');
        setLoading(false);
      }
    };

    fetchFromDb();

    return () => {
      mounted = false;
    };
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update filtered opportunities when selectedCountry changes
  useEffect(() => {
    if (!opportunities.length || !selectedCountry) {
      setFilteredOpportunities(opportunities);
      // Inform parent that filter was cleared (keep it minimal)
      if (onOpportunitiesChange) onOpportunitiesChange(opportunities);
      if (onPaginatedOpportunitiesChange) onPaginatedOpportunitiesChange(opportunities.slice(0, itemsPerPage));
      return;
    }

    // Normalize the selected country for comparison
    const normalizedSelected = selectedCountry.toLowerCase().trim();
    
    // Filter opportunities based on country match
    const filtered = opportunities.filter((opp) => {
      const oppCountry = opp.country ? opp.country.toLowerCase().trim() : '';
      
      // Direct match
      if (oppCountry === normalizedSelected) {
        return true;
      }
      
      // Check for common variations
      const countryGroups = {
        'united states': ['usa', 'united states of america', 'us', 'u.s.', 'u.s.a.'],
        'united kingdom': ['uk', 'britain', 'great britain', 'england', 'scotland', 'wales'],
        'russia': ['russian federation'],
        'japan': [],
        'brazil': [],
        'india': [],
        'germany': ['deutschland'],
        'australia': ['aus'],
        'mexico': [],
        'china': ['peoples republic of china'],
        'argentina': [],
        'egypt': []
      };

      // Check if selected country is in any group
      for (const [mainCountry, variations] of Object.entries(countryGroups)) {
        if (mainCountry === normalizedSelected || variations.includes(normalizedSelected)) {
          // Check if opportunity country matches any variation in this group
          if (oppCountry === mainCountry || variations.includes(oppCountry)) {
            return true;
          }
        }
      }

      // Check for partial matches (if both strings are long enough)
      if (normalizedSelected.length >= 3 && oppCountry.includes(normalizedSelected)) {
        return true;
      }
      if (oppCountry.length >= 3 && normalizedSelected.includes(oppCountry)) {
        return true;
      }

      return false;
    });

    console.debug(`Filtered ${filtered.length} opportunities for country: ${selectedCountry}`);
    setFilteredOpportunities(filtered);
    setCurrentPage(1); // Reset to first page when filtering

    // Notify parent about filtered opportunities (keep call but this effect doesn't depend on parent callbacks)
    if (onOpportunitiesChange) onOpportunitiesChange(filtered);
    if (onPaginatedOpportunitiesChange) onPaginatedOpportunitiesChange(filtered.slice(0, itemsPerPage));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountry, opportunities]); // intentionally not including parent callbacks in deps to avoid loops

  // When the list of opportunities changes, reset to page 1
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredOpportunities.length, selectedCountry]);

  // Compute displayed opportunities (either all filtered or only the selected one),
  // then apply AI ranking if available
  const displayedOpportunities = useMemo(() => {
    const base = showAllOpportunities 
      ? filteredOpportunities 
      : filteredOpportunities.filter((opp) => opp.id === selectedOpportunityId);

    // Apply AI ranking if we have ranked IDs
    if (rankedOpportunityIds && rankedOpportunityIds.length > 0 && showAllOpportunities) {
      const idToIndex = {};
      rankedOpportunityIds.forEach((id, idx) => {
        idToIndex[id] = idx;
      });
      const sorted = [...base].sort((a, b) => {
        const aIdx = idToIndex[a.id] !== undefined ? idToIndex[a.id] : rankedOpportunityIds.length;
        const bIdx = idToIndex[b.id] !== undefined ? idToIndex[b.id] : rankedOpportunityIds.length;
        return aIdx - bIdx;
      });
      console.log('Ranking applied. Top 5 ranked IDs:', rankedOpportunityIds.slice(0, 5));
      return sorted;
    }

    return base;
  }, [filteredOpportunities, showAllOpportunities, selectedOpportunityId, rankedOpportunityIds]);

  // Pagination calculation (memoized)
  const paginatedOpportunities = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return displayedOpportunities.slice(startIndex, startIndex + itemsPerPage);
  }, [displayedOpportunities, currentPage]);

  // Notify parent when paginated opportunities change — but only if they actually changed.
  const lastPaginatedJSONRef = useRef(null);
  useEffect(() => {
    if (!onPaginatedOpportunitiesChange) return;

    const currentJSON = JSON.stringify(paginatedOpportunities);
    if (lastPaginatedJSONRef.current !== currentJSON) {
      lastPaginatedJSONRef.current = currentJSON;
      onPaginatedOpportunitiesChange(paginatedOpportunities);
      console.debug('onPaginatedOpportunitiesChange fired. paginated length=', paginatedOpportunities.length);
    }
  }, [paginatedOpportunities, onPaginatedOpportunitiesChange]);

  // Handle voice "go back" command
  useEffect(() => {
    if (!voiceGoBack) return;

    console.log('Voice go back: returning to country view');
    setSelectedOpportunityId(null);
    setShowAllOpportunities(true);

    if (onVoiceGoBackHandled) {
      try { onVoiceGoBackHandled(); } catch (e) { console.error(e); }
    }
  }, [voiceGoBack, onVoiceGoBackHandled]);

  // Handle voice selection by index
  useEffect(() => {
    if (voiceSelectedIndex === null || voiceSelectedIndex === undefined) return;

    // Get the opportunity at the specified index from paginated list
    const startIndex = (currentPage - 1) * itemsPerPage;
    const visibleOpps = displayedOpportunities.slice(startIndex, startIndex + itemsPerPage);
    const opp = visibleOpps[voiceSelectedIndex];

    if (opp) {
      console.log('Voice selecting opportunity:', opp.name, 'at index', voiceSelectedIndex);

      // Set local state to show only this opportunity
      setSelectedOpportunityId(opp.id);
      setShowAllOpportunities(false);

      // Do NOT clear country selection for voice - we want to keep it for "go back"

      // Use dedicated voice callback that doesn't clear country
      if (onVoiceOpportunitySelect) {
        try { onVoiceOpportunitySelect(opp.lat, opp.lng, opp.name); } catch (e) { console.error(e); }
      }

      // Update database - keep the country selected
      if (roomCode) {
        supabase
          .from('rooms')
          .update({
            selected_opportunity_lat: opp.lat,
            selected_opportunity_lng: opp.lng,
            // Keep selected_country as is
          })
          .eq('room_code', roomCode)
          .then(({ error }) => {
            if (error) console.error('Error updating room for voice selection:', error);
          });
      }
    }

    // Notify parent that we've handled the voice selection
    if (onVoiceSelectionHandled) {
      try { onVoiceSelectionHandled(); } catch (e) { console.error(e); }
    }
    // include displayedOpportunities to ensure we pick correct index when page changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSelectedIndex, currentPage, displayedOpportunities, onVoiceSelectionHandled, onVoiceOpportunitySelect, roomCode]);

  // Load initial selected opportunity from database
  useEffect(() => {
    if (!roomCode) return;

    const loadSelectedOpportunity = async () => {
      const { data: room } = await supabase
        .from('rooms')
        .select('selected_opportunity_lat, selected_opportunity_lng')
        .eq('room_code', roomCode)
        .single();

      if (room?.selected_opportunity_lat && room?.selected_opportunity_lng) {
        // Find the opportunity that matches these coordinates
        const matchingOpp = opportunities.find(
          (opp) =>
            Math.abs(opp.lat - room.selected_opportunity_lat) < 0.01 &&
            Math.abs(opp.lng - room.selected_opportunity_lng) < 0.01
        );
        if (matchingOpp) {
          setSelectedOpportunityId(matchingOpp.id);
        }
      }
    };

    if (opportunities.length > 0) {
      loadSelectedOpportunity();
    }
  }, [roomCode, opportunities]);

  // Real-time subscription for opportunity and country selection.
  useEffect(() => {
    if (!roomCode) return;

    const channel = supabase
      .channel(`opportunities-${roomCode}`)
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
          const oldSelectedCountry = payload.old?.selected_country;
          const oldLat = payload.old?.selected_opportunity_lat;
          const oldLng = payload.old?.selected_opportunity_lng;

          // Handle country selection changes (only act if changed)
          if (selected_country !== oldSelectedCountry) {
            if (selected_country) {
              setShowAllOpportunities(true);
              setSelectedOpportunityId(null);
            } else if (!selected_opportunity_lat && !selected_opportunity_lng) {
              setShowAllOpportunities(true);
              setSelectedOpportunityId(null);
            }
          }

          // Handle opportunity marker (only if no country is selected)
          if (selected_opportunity_lat && selected_opportunity_lng && !selected_country) {
            if (selected_opportunity_lat !== oldLat || selected_opportunity_lng !== oldLng) {
              // Use the ref to access the latest opportunities without re-subscribing
              const matchingOpp = (opportunitiesRef.current || []).find(
                (opp) =>
                  Math.abs(opp.lat - selected_opportunity_lat) < 0.01 &&
                  Math.abs(opp.lng - selected_opportunity_lng) < 0.01
              );
              if (matchingOpp) {
                setSelectedOpportunityId(matchingOpp.id);
                setShowAllOpportunities(false);
                if (onOpportunitySelect) {
                  try { onOpportunitySelect(matchingOpp.lat, matchingOpp.lng, matchingOpp.name); } catch (e) { console.error(e); }
                }
              }
            }
          } else if (!selected_opportunity_lat && !selected_opportunity_lng && !selected_country) {
            setSelectedOpportunityId(null);
            setShowAllOpportunities(true);
          }
        }
      )
      .subscribe((status) => {
        console.debug('Opportunities subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // only resubscribe when roomCode or onOpportunitySelect changes
  }, [roomCode, onOpportunitySelect]);

  const handleTileClick = (opportunity) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setSelectedOpportunityId(opportunity.id);
      setShowAllOpportunities(false);

      // Clear country selection when a specific opportunity is selected
      if (onCountrySelect) {
        try { onCountrySelect(null); } catch (e) { console.error(e); }
      }

      if (onOpportunitySelect) {
        try { onOpportunitySelect(opportunity.lat, opportunity.lng, opportunity.name); } catch (e) { console.error(e); }
      }

      if (roomCode) {
        supabase
          .from('rooms')
          .update({
            selected_opportunity_lat: opportunity.lat,
            selected_opportunity_lng: opportunity.lng,
            selected_country: null,
          })
          .eq('room_code', roomCode)
          .then(({ error }) => {
            if (error) {
              console.error('Error updating selected opportunity:', error);
            } else {
              console.debug('Selected opportunity updated in database:', opportunity.name);
            }
          });
      }
    }, 100);
  };

  const handleBackClick = () => {
    setShowAllOpportunities(true);
    setSelectedOpportunityId(null);

    if (roomCode) {
      supabase
        .from('rooms')
        .update({
          selected_opportunity_lat: null,
          selected_opportunity_lng: null,
        })
        .eq('room_code', roomCode);
    }

    if (onOpportunitySelect) {
      try { onOpportunitySelect(null, null, null); } catch (e) { console.error(e); }
    }
  };

  const handleSelectThis = (opportunity, e) => {
    e.stopPropagation(); // Prevent tile click

    // Check if this is the specific Shinjuku opportunity (for flight route)
    const shinjukuLat = 35.6897;
    const shinjukuLng = 139.6997;
    const isShinjukuOpportunity = opportunity.lat && opportunity.lng &&
      Math.abs(opportunity.lat - shinjukuLat) < 0.0001 &&
      Math.abs(opportunity.lng - shinjukuLng) < 0.0001;

    if (isShinjukuOpportunity) {
      alert(`Congratulations! You've selected "${opportunity.name}". The flight route from Manchester will be displayed.`);

      if (onCountrySelect) {
        try { onCountrySelect(null); } catch (e) { console.error(e); }
      }

      if (onOpportunitySelect) {
        try { onOpportunitySelect(opportunity.lat, opportunity.lng, opportunity.name); } catch (e) { console.error(e); }
      }

      if (roomCode) {
        supabase
          .from('rooms')
          .update({
            selected_opportunity_lat: opportunity.lat,
            selected_opportunity_lng: opportunity.lng,
            selected_country: null,
          })
          .eq('room_code', roomCode);
      }

      setSelectedOpportunityId(null);
      setShowAllOpportunities(true);
    } else {
      alert(`Congratulations! You've selected "${opportunity.name}". The globe will reset to its default position.`);

      if (onCountrySelect) {
        try { onCountrySelect(null); } catch (e) { console.error(e); }
      }

      if (onOpportunitySelect) {
        try { onOpportunitySelect(opportunity.lat, opportunity.lng, opportunity.name); } catch (e) { console.error(e); }
      }

      setSelectedOpportunityId(null);
      setShowAllOpportunities(true);

      if (roomCode) {
        supabase
          .from('rooms')
          .update({
            selected_opportunity_lat: null,
            selected_opportunity_lng: null,
            selected_country: null,
          })
          .eq('room_code', roomCode);
      }

      // Clear the globe marker after a short delay so the "hadOpportunity" condition triggers the globe reset logic
      setTimeout(() => {
        if (onOpportunitySelect) {
          try { onOpportunitySelect(null, null, null); } catch (e) { console.error(e); }
        }
      }, 100);
    }
  };

  if (loading) {
    return (
      <div className="opportunities-panel">
        <div className="opportunities-header">
          <h3>Opportunities</h3>
        </div>
        <div className="opportunities-loading">
          <p>Loading opportunities...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="opportunities-panel">
        <div className="opportunities-header">
          <h3>Opportunities</h3>
        </div>
        <div className="opportunities-error">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // Calculate pagination UI values
  const totalPages = Math.max(1, Math.ceil(displayedOpportunities.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const visiblePaginated = displayedOpportunities.slice(startIndex, endIndex);

  const handleNextPage = () => {
    setCurrentPage((p) => Math.min(totalPages, p + 1));
  };

  const handlePreviousPage = () => {
    setCurrentPage((p) => Math.max(1, p - 1));
  };

  return (
    <div className="opportunities-panel">
      <div className="opportunities-header">
        <h3>Opportunities</h3>
        {!showAllOpportunities && (
          <button className="back-button" onClick={handleBackClick} title="Back to all opportunities">
            ← Back
          </button>
        )}
        {showAllOpportunities && (
          <span className="opportunities-count">
            {rankingLoading ? 'Ranking...' : filteredOpportunities.length}
          </span>
        )}
      </div>

      <div className="opportunities-list">
        {displayedOpportunities.length === 0 ? (
          <div className="opportunities-empty">
            <p>No opportunities available.</p>
            {selectedCountry && (
              <p className="opportunities-hint">
                Try selecting a different country or clear the country filter.
              </p>
            )}
          </div>
        ) : (
          <>
            {visiblePaginated.map((opp) => (
              <div
                key={opp.id}
                className={`opportunity-tile ${selectedOpportunityId === opp.id ? 'selected' : ''}`}
                onClick={() => handleTileClick(opp)}
              >
                <div className="opportunity-title">{opp.name}</div>
                <div className="opportunity-country">{opp.country}</div>
                <div className="opportunity-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {opp.link && (
                    <a
                      href={opp.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opportunity-link"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: '#3b82f6', textDecoration: 'none' }}
                    >
                      Learn more →
                    </a>
                  )}
                  
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                      className="opportunity-select-button"
                      onClick={(e) => handleSelectThis(opp, e)}
                    >
                      Select this
                    </button>
                    
                    {/* --- NEW CHECKBOX FOR MULTI-SELECTION --- */}
                    <input 
                      type="checkbox" 
                      style={{ 
                        width: '20px', 
                        height: '20px', 
                        cursor: 'pointer',
                        transform: 'scale(1.2)',
                        accentColor: '#3b82f6'
                      }}
                      checked={selectedCharities && selectedCharities.some(c => c.id === opp.id)}
                      disabled={selectedCharities && !selectedCharities.some(c => c.id === opp.id) && selectedCharities.length >= 5}
                      onChange={() => onToggleCharity && onToggleCharity(opp)}
                      onClick={(e) => e.stopPropagation()} // Prevent clicking the checkbox from triggering tile selection
                      title={selectedCharities && !selectedCharities.some(c => c.id === opp.id) && selectedCharities.length >= 5 
                        ? "You can only select up to 5 charities" 
                        : "Select this charity"}
                    />
                  </div>
                </div>
              </div>
            ))}

            {/* Pagination Controls */}
            {displayedOpportunities.length > itemsPerPage && (
              <div className="pagination-controls">
                <button className="pagination-button" onClick={handlePreviousPage} disabled={currentPage === 1} title="Previous page">
                  ← Previous
                </button>
                <span className="pagination-info">
                  Page {currentPage} of {totalPages}
                </span>
                <button className="pagination-button" onClick={handleNextPage} disabled={currentPage === totalPages} title="Next page">
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default OpportunitiesPanel;
