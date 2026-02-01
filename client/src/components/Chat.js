// src/components/Chat.jsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import './Chat.css';

/**
 * Chat component
 *
 * Props:
 *  - roomCode (string) - required
 *  - userId (string) - required (id of the current user, used when inserting messages)
 *  - masterId (string) - optional (for showing master badge)
 *  - allOpportunities (array) - all currently filtered opportunities for ranking
 *  - onRankUpdate (function) - callback with ranked opportunity IDs
 */

const COUNTRY_ALIASES = {
  'usa': 'United States of America',
  'us': 'United States of America',
  'united states': 'United States of America',
  'america': 'United States of America',
  'uk': 'United Kingdom',
  'britain': 'United Kingdom',
  'great britain': 'United Kingdom',
  'england': 'United Kingdom',
  'uae': 'United Arab Emirates',
  'emirates': 'United Arab Emirates',
  'south korea': 'South Korea',
  'north korea': 'North Korea',
  'new zealand': 'New Zealand',
  'saudi': 'Saudi Arabia',
  'czech': 'Czech Republic',
  'czechia': 'Czech Republic',
  'ivory coast': 'Ivory Coast',
  'cote d\'ivoire': 'Ivory Coast',
  'dr congo': 'Democratic Republic of the Congo',
  'drc': 'Democratic Republic of the Congo',
  'car': 'Central African Republic',
  'papua new guinea': 'Papua New Guinea',
  'png': 'Papua New Guinea',
  'bosnia': 'Bosnia and Herzegovina',
  'sri lanka': 'Sri Lanka',
  'el salvador': 'El Salvador',
  'costa rica': 'Costa Rica',
  'dominican republic': 'Dominican Republic',
  'south africa': 'South Africa',
  'burkina': 'Burkina Faso',
};

const MAJOR_COUNTRIES = [
  'Afghanistan','Albania','Algeria','Argentina','Australia','Austria','Bangladesh',
  'Belarus','Belgium','Brazil','Bulgaria','Canada','Chile','China','Colombia',
  'Croatia','Czech Republic','Denmark','Egypt','Finland','France','Germany',
  'Greece','Hungary','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy',
  'Japan','Kazakhstan','Kenya','Malaysia','Mexico','Morocco','Myanmar','Netherlands',
  'New Zealand','Nigeria','North Korea','Norway','Pakistan','Peru','Philippines',
  'Poland','Portugal','Romania','Russia','Saudi Arabia','South Africa','South Korea',
  'Spain','Sweden','Switzerland','Taiwan','Thailand','Turkey','Ukraine',
  'United Arab Emirates','United Kingdom','United States of America','Uzbekistan',
  'Venezuela','Vietnam','Yemen','Zimbabwe','Angola','Azerbaijan','Belize','Benin',
  'Bolivia','Bosnia and Herzegovina','Botswana','Brunei','Burkina Faso','Burundi',
  'Cambodia','Cameroon','Central African Republic','Chad','Congo','Costa Rica',
  'Cuba','Cyprus','Democratic Republic of the Congo','Dominican Republic','Ecuador',
  'El Salvador','Eritrea','Estonia','Ethiopia','Georgia','Ghana','Guatemala',
  'Guinea','Haiti','Honduras','Iceland','Ivory Coast','Jamaica','Jordan','Kuwait',
  'Kyrgyzstan','Laos','Latvia','Lebanon','Liberia','Libya','Lithuania','Madagascar',
  'Malawi','Mali','Mauritania','Moldova','Mongolia','Mozambique','Nepal','Nicaragua',
  'Niger','Oman','Panama','Papua New Guinea','Paraguay','Qatar','Rwanda','Senegal',
  'Serbia','Sierra Leone','Singapore','Slovakia','Slovenia','Somalia','Sri Lanka',
  'Sudan','Syria','Tajikistan','Tanzania','Tunisia','Turkmenistan','Uganda','Uruguay',
  'Zambia',
];

function extractCountry(text) {
  const lower = text.toLowerCase().trim();
  // Check aliases first
  for (const [alias, country] of Object.entries(COUNTRY_ALIASES)) {
    if (lower.includes(alias)) return country;
  }
  // Check full country names (longest first to match multi-word names first)
  const sorted = [...MAJOR_COUNTRIES].sort((a, b) => b.length - a.length);
  for (const country of sorted) {
    if (lower.includes(country.toLowerCase())) return country;
  }
  return null;
}

const ORDINAL_MAP = {
  'first': 0,
  'one': 0,
  '1st': 0,
  'first one': 0,
  'number one': 0,
  'second': 1,
  'two': 1,
  '2nd': 1,
  'second one': 1,
  'number two': 1,
  'third': 2,
  'three': 2,
  '3rd': 2,
  'third one': 2,
  'number three': 2,
  'fourth': 3,
  'four': 3,
  '4th': 3,
  'fourth one': 3,
  'number four': 3,
  'fifth': 4,
  'five': 4,
  '5th': 4,
  'fifth one': 4,
  'number five': 4,
};

function extractOrdinal(text) {
  const lower = text.toLowerCase().trim();
  // Check longer phrases first to avoid partial matches
  const sorted = Object.entries(ORDINAL_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, index] of sorted) {
    if (lower.includes(phrase)) return index;
  }
  return null;
}

function checkGoBack(text) {
  const lower = text.toLowerCase().trim();
  const goBackPhrases = ['go back', 'goback', 'back', 'return', 'go to country', 'country view', 'unselect'];
  return goBackPhrases.some(phrase => lower.includes(phrase));
}

// Extract message after "send" command
function extractSendMessage(text) {
  const lower = text.toLowerCase();
  const sendIndex = lower.indexOf('send');
  if (sendIndex === -1) return null;

  // Get everything after "send"
  const afterSend = text.slice(sendIndex + 4).trim();
  // Remove leading punctuation and whitespace
  const cleaned = afterSend.replace(/^[^a-zA-Z0-9]+/, '').trim();
  // Remove trailing period if it's the only punctuation at the end
  const withoutTrailingPeriod = cleaned.replace(/\.\s*$/, '').trim();
  return withoutTrailingPeriod.length > 0 ? withoutTrailingPeriod : null;
}

// Hardcoded country codes for Skyscanner
const SKYSCANNER_COUNTRY_CODES = {
  'edinburgh': 'edi',
  'kenya': 'ke',
  'united kingdom': 'uk',
  'uk': 'uk',
  'london': 'lon',
  'manchester': 'man',
  'new york': 'nyc',
  'usa': 'us',
  'united states': 'us',
  'united states of america': 'us',
  'japan': 'jp',
  'tokyo': 'tyo',
  'france': 'fr',
  'paris': 'par',
  'germany': 'de',
  'spain': 'es',
  'italy': 'it',
  'australia': 'au',
  'canada': 'ca',
  'china': 'cn',
  'india': 'in',
  'brazil': 'br',
  'mexico': 'mx',
  'nairobi': 'nbo',
};

const MONTH_MAP = {
  'january': '01', 'jan': '01',
  'february': '02', 'feb': '02',
  'march': '03', 'mar': '03',
  'april': '04', 'apr': '04',
  'may': '05',
  'june': '06', 'jun': '06',
  'july': '07', 'jul': '07',
  'august': '08', 'aug': '08',
  'september': '09', 'sep': '09', 'sept': '09',
  'october': '10', 'oct': '10',
  'november': '11', 'nov': '11',
  'december': '12', 'dec': '12',
};

function getCountryCode(country) {
  const lower = country.toLowerCase().trim();
  if (SKYSCANNER_COUNTRY_CODES[lower]) {
    return SKYSCANNER_COUNTRY_CODES[lower];
  }
  // Use first 3 letters as fallback
  return lower.replace(/[^a-z]/g, '').slice(0, 3);
}

function parseDate(dateStr) {
  // Extract day number (handles 1st, 2nd, 3rd, 21st, 22nd, 23rd, etc.)
  const dayMatch = dateStr.match(/(\d{1,2})(?:st|nd|rd|th)?/i);
  if (!dayMatch) return null;
  const day = dayMatch[1].padStart(2, '0');

  // Extract month
  let month = null;
  for (const [name, num] of Object.entries(MONTH_MAP)) {
    if (dateStr.toLowerCase().includes(name)) {
      month = num;
      break;
    }
  }
  if (!month) return null;

  // Use 2026 as default year (current year from context)
  return `26${month}${day}`;
}

function extractFlightBooking(text) {
  const lower = text.toLowerCase();

  // Check for "book a flight" or "book flight"
  if (!lower.includes('book') || !lower.includes('flight')) return null;

  // Pattern: "from X to Y from DATE to DATE"
  // Try to extract: from [origin] to [destination] from [date1] to [date2]
  const fromToPattern = /from\s+(.+?)\s+to\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+?)(?:\.|$)/i;
  const match = text.match(fromToPattern);

  if (!match) {
    // Try alternative pattern: "from X to Y DATE to DATE"
    const altPattern = /from\s+(.+?)\s+to\s+(.+?)\s+(\d{1,2}(?:st|nd|rd|th)?\s+\w+)\s+to\s+(\d{1,2}(?:st|nd|rd|th)?\s+\w+)/i;
    const altMatch = text.match(altPattern);
    if (altMatch) {
      return {
        origin: altMatch[1].trim(),
        destination: altMatch[2].trim(),
        departDate: altMatch[3].trim(),
        returnDate: altMatch[4].trim(),
      };
    }
    return null;
  }

  return {
    origin: match[1].trim(),
    destination: match[2].trim(),
    departDate: match[3].trim(),
    returnDate: match[4].trim(),
  };
}

function buildSkyscannerUrl(booking) {
  const originCode = getCountryCode(booking.origin);
  const destCode = getCountryCode(booking.destination);
  const departDate = parseDate(booking.departDate);
  const returnDate = parseDate(booking.returnDate);

  if (!departDate || !returnDate) {
    console.log('Could not parse dates:', booking.departDate, booking.returnDate);
    return null;
  }

  return `https://www.skyscanner.net/transport/flights/${originCode}/${destCode}/${departDate}/${returnDate}/?adultsv2=1&cabinclass=economy&childrenv2=&ref=home&rtn=1&preferdirects=false&outboundaltsenabled=false&inboundaltsenabled=false`;
}

// Normalize text: remove punctuation, lowercase, split into words
function normalizeText(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 0);
}

// Check if "select" command is present and extract the query after it
function extractSelectQuery(text) {
  const lower = text.toLowerCase();
  const selectIndex = lower.indexOf('select');
  if (selectIndex === -1) return null;

  // Get everything after "select"
  const afterSelect = text.slice(selectIndex + 6).trim();
  // Remove leading punctuation and whitespace
  const cleaned = afterSelect.replace(/^[^a-zA-Z0-9]+/, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

// Calculate similarity between query and opportunity name
function calculateSimilarity(query, oppName) {
  const queryWords = normalizeText(query);
  const nameWords = normalizeText(oppName);

  if (queryWords.length === 0 || nameWords.length === 0) return 0;

  let matchScore = 0;

  // Check each query word against name words
  for (const qWord of queryWords) {
    if (qWord.length < 2) continue; // Skip very short words

    let bestWordMatch = 0;
    for (const nWord of nameWords) {
      // Exact match
      if (qWord === nWord) {
        bestWordMatch = Math.max(bestWordMatch, 1.0);
      }
      // Query word is contained in name word (e.g., "english" in "english")
      else if (nWord.includes(qWord)) {
        bestWordMatch = Math.max(bestWordMatch, 0.9);
      }
      // Name word is contained in query word
      else if (qWord.includes(nWord)) {
        bestWordMatch = Math.max(bestWordMatch, 0.8);
      }
      // Check if words start the same (prefix match)
      else if (qWord.length >= 3 && nWord.startsWith(qWord.slice(0, 3))) {
        bestWordMatch = Math.max(bestWordMatch, 0.5);
      }
    }
    matchScore += bestWordMatch;
  }

  // Also check if query appears as substring in full normalized name
  const normalizedName = oppName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  if (normalizedName.includes(normalizedQuery)) {
    matchScore += queryWords.length * 0.5; // Bonus for substring match
  }

  // Normalize by query word count
  return matchScore / queryWords.length;
}

function findBestMatchingOpportunity(query, opportunities) {
  if (!opportunities || opportunities.length === 0 || !query) return null;

  let bestMatch = null;
  let bestScore = 0;
  const threshold = 0.4; // Minimum similarity threshold

  console.log('Finding match for query:', query);

  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    const score = calculateSimilarity(query, opp.name);
    console.log(`  "${opp.name}" score: ${score.toFixed(2)}`);

    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = { index: i, opportunity: opp, score };
    }
  }

  console.log('Best match:', bestMatch);
  return bestMatch;
}

const Chat = ({ roomCode, userId, masterId, allOpportunities = [], onRankUpdate, onRankingLoadingChange, onVoiceCountrySelect, onVoiceOpportunitySelect, selectedCountry, paginatedOpportunities = [], onVoiceGoBack }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [usernames, setUsernames] = useState({}); // Cache for usernames
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const rankTimeoutRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const isRecordingRef = useRef(false);
  const handleMicClickRef = useRef(null);
  const allOpportunitiesRef = useRef(allOpportunities);
  const onRankUpdateRef = useRef(onRankUpdate);
  const onRankingLoadingChangeRef = useRef(onRankingLoadingChange);

  // Keep refs updated without causing re-renders/re-subscriptions
  useEffect(() => {
    allOpportunitiesRef.current = allOpportunities;
  }, [allOpportunities]);

  // Keep isRecordingRef in sync
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Space bar hold-to-record (only when not typing in chat input)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      // Ignore if not space bar
      if (e.code !== 'Space') return;
      // Prevent page scroll
      e.preventDefault();
      // Start recording if not already
      if (!isRecordingRef.current && handleMicClickRef.current) {
        handleMicClickRef.current();
      }
    };

    const handleKeyUp = (e) => {
      // Ignore if typing in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      // Ignore if not space bar
      if (e.code !== 'Space') return;
      // Stop recording if currently recording
      if (isRecordingRef.current && handleMicClickRef.current) {
        handleMicClickRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    onRankUpdateRef.current = onRankUpdate;
  }, [onRankUpdate]);

  useEffect(() => {
    onRankingLoadingChangeRef.current = onRankingLoadingChange;
  }, [onRankingLoadingChange]);

  // Auto-rank opportunities whenever new messages arrive (debounced).
  // Uses refs so this function identity is stable and won't cause subscription churn.
  const triggerRanking = useCallback(() => {
    if (rankTimeoutRef.current) {
      clearTimeout(rankTimeoutRef.current);
    }

    rankTimeoutRef.current = setTimeout(async () => {
      const opps = allOpportunitiesRef.current;
      const callback = onRankUpdateRef.current;
      const setLoading = onRankingLoadingChangeRef.current;
      if (!opps || opps.length === 0 || !callback || !roomCode) return;

      const payload = {
        room_code: roomCode,
        opportunities: opps.map(opp => ({
          id: opp.id || '',
          name: opp.name || '',
        })),
      };

      console.log('Calling rank-opportunities with', opps.length, 'opportunities');
      if (setLoading) setLoading(true);

      try {
        const apiBase = process.env.REACT_APP_API_URL ?? '';
        const response = await fetch(`${apiBase}/api/gemini/rank-opportunities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const data = await response.json();
          console.log('Rank response:', data);
          if (data?.ranked_ids && Array.isArray(data.ranked_ids)) {
            callback(data.ranked_ids);
          }
        } else {
          console.error('Rank endpoint returned status', response.status);
        }
      } catch (err) {
        console.error('Error calling rank-opportunities:', err);
      } finally {
        if (setLoading) setLoading(false);
      }
    }, 500);
  }, [roomCode]); // only depends on roomCode now - stable identity

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load initial messages and set up polling as fallback
  useEffect(() => {
    if (!roomCode) return;

    let stopped = false;

    const loadMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('room_code', roomCode)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error loading messages:', error);
          setLoading(false);
          return;
        }

        if (stopped) return;

        console.log('Loaded messages:', data?.length || 0);

        if (data) {
          setMessages(data);

          // Fetch usernames for all unique user IDs (cache them)
          const uniqueUserIds = [...new Set(data.map((m) => m.user_id))];
          const usernamePromises = uniqueUserIds.map(async (uid) => {
            try {
              const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('username, email')
                .eq('id', uid)
                .maybeSingle();

              let username = null;
              if (!profileError && profile) {
                username =
                  profile.username ||
                  (profile.email ? profile.email.split('@')[0] : null) ||
                  profile.email ||
                  null;
              }

              return {
                userId: uid,
                username: username || `User ${uid?.substring ? uid.substring(0, 8) : uid}`,
              };
            } catch (err) {
              // in case profile lookup fails, still return fallback
              return { userId: uid, username: `User ${uid?.substring ? uid.substring(0, 8) : uid}` };
            }
          });

          const usernameData = await Promise.all(usernamePromises);
          const usernameMap = {};
          usernameData.forEach(({ userId, username }) => {
            usernameMap[userId] = username;
          });
          setUsernames(usernameMap);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error in loadMessages:', err);
        setLoading(false);
      }
    };

    loadMessages();

    // Polling fallback: check for new messages every 2 seconds if realtime fails
    const pollInterval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('messages')
          .select('*')
          .eq('room_code', roomCode)
          .order('created_at', { ascending: true });

        if (data) {
          setMessages((prev) => {
            if (data.length > prev.length) {
              console.log('Polling found new messages:', data.length - prev.length);
              return data;
            }
            return prev;
          });
        }
      } catch (err) {
        // ignore polling errors but log
        console.debug('Polling error fetching messages:', err);
      }
    }, 2000);

    return () => {
      stopped = true;
      clearInterval(pollInterval);
      if (rankTimeoutRef.current) {
        clearTimeout(rankTimeoutRef.current);
      }
    };
  }, [roomCode]);

  // Real-time subscription for new messages
  useEffect(() => {
    if (!roomCode) return;

    console.log('Setting up real-time subscription for messages in room:', roomCode);

    const channel = supabase
      .channel(`messages-${roomCode}`, {
        config: {
          broadcast: { self: true }, // include self events for optimistic UI if you want
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_code=eq.${roomCode}`,
        },
        (payload) => {
          try {
            console.log('Real-time message received:', payload);
            const newMsg = payload.new;
            // avoid duplicate
            setMessages((prev) => {
              const exists = prev.some((m) => m.id === newMsg.id);
              if (exists) {
                return prev;
              }
              return [...prev, newMsg];
            });

            // Trigger ranking whenever a new message arrives
            triggerRanking();

            // fetch username if not cached
            setUsernames((prev) => {
              if (prev[newMsg.user_id]) return prev;
              // async fetch
              supabase
                .from('profiles')
                .select('username, email')
                .eq('id', newMsg.user_id)
                .maybeSingle()
                .then(({ data: profile, error: profileError }) => {
                  let username = null;
                  if (!profileError && profile) {
                    username =
                      profile.username ||
                      (profile.email ? profile.email.split('@')[0] : null) ||
                      profile.email ||
                      null;
                  }
                  const displayName = username || `User ${newMsg.user_id?.substring ? newMsg.user_id.substring(0, 8) : newMsg.user_id}`;
                  setUsernames((current) => ({ ...current, [newMsg.user_id]: displayName }));
                })
                .catch((e) => {
                  console.debug('Failed fetching profile for realtime message:', e);
                });

              return prev;
            });
          } catch (e) {
            console.error('Error handling realtime message payload', e);
          }
        }
      )
      .subscribe((status, err) => {
        console.log('Messages subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to real-time messages');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Channel error:', err);
          console.error('Make sure Realtime is enabled for the messages table in Supabase Dashboard');
        } else if (status === 'TIMED_OUT') {
          console.error('❌ Subscription timed out');
        } else if (status === 'CLOSED') {
          console.warn('Subscription closed');
        }
      });

    return () => {
      console.log('Cleaning up messages subscription');
      supabase.removeChannel(channel);
    };
  }, [roomCode, triggerRanking]);

  // Handle sending a message
  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!newMessage.trim() || !roomCode || !userId) {
      console.log('Cannot send message - missing data:', { newMessage: newMessage.trim(), roomCode, userId });
      return;
    }

    const messageText = newMessage.trim();
    console.log('Sending message:', { roomCode, userId, message: messageText });

    // Clear input immediately for better UX
    setNewMessage('');

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          room_code: roomCode,
          user_id: userId,
          message: messageText,
        })
        .select()
        .single();

      if (error) {
        console.error('Error sending message:', error);
        alert(
          `Failed to send message: ${error.message}\n\nPlease check:\n1. Have you run the SQL script to create the messages table?\n2. Is Realtime enabled for the messages table?`
        );
        // Restore the message text so user can try again
        setNewMessage(messageText);
      } else {
        console.log('Message sent successfully:', data);
        // Message will appear via real-time subscription; also add it optimistically if missing
        if (data) {
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === data.id);
            if (!exists) {
              return [...prev, data];
            }
            return prev;
          });
        }
        // Trigger ranking after sending a message
        triggerRanking();
        inputRef.current?.focus();
      }
    } catch (err) {
      console.error('Unexpected error sending message:', err);
      setNewMessage(messageText);
    }
  };

  const handleMicClick = async () => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks so the browser mic indicator goes away
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];

        // Send to ElevenLabs STT
        try {
          const formData = new FormData();
          formData.append('file', blob, 'recording.webm');
          formData.append('model_id', 'scribe_v1');
          formData.append('language_code', 'en');

          const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
            method: 'POST',
            headers: {
              'xi-api-key': process.env.REACT_APP_ELEVENLABS_API_KEY,
            },
            body: formData,
          });

          if (!res.ok) {
            console.error('ElevenLabs STT error:', res.status);
            return;
          }

          const data = await res.json();
          const transcript = data.text || '';
          console.log('Voice transcript:', transcript);

          // Check for "book a flight" command first
          const flightBooking = extractFlightBooking(transcript);
          if (flightBooking) {
            console.log('Voice command: book flight:', flightBooking);
            const url = buildSkyscannerUrl(flightBooking);
            if (url) {
              console.log('Opening Skyscanner URL:', url);
              window.open(url, '_blank');
            } else {
              console.log('Could not build Skyscanner URL from booking:', flightBooking);
            }
            return;
          }

          // Check for "send" command (send chat message)
          const sendMessage = extractSendMessage(transcript);
          if (sendMessage) {
            console.log('Voice command: send message:', sendMessage);
            // Send the message via the chat
            try {
              const { error } = await supabase
                .from('messages')
                .insert({
                  room_code: roomCode,
                  user_id: userId,
                  message: sendMessage,
                });
              if (error) {
                console.error('Error sending voice message:', error);
              } else {
                console.log('Voice message sent successfully');
              }
            } catch (err) {
              console.error('Error sending voice message:', err);
            }
            return;
          }

          // Check for "go back" command
          if (checkGoBack(transcript)) {
            console.log('Voice command: go back');
            if (onVoiceGoBack) {
              onVoiceGoBack();
            }
            return;
          }

          // If a country is already selected, check for ordinal or "select <name>" command
          if (selectedCountry && paginatedOpportunities.length > 0) {
            // Try ordinal first
            const ordinalIndex = extractOrdinal(transcript);
            if (ordinalIndex !== null && onVoiceOpportunitySelect) {
              console.log('Voice selected opportunity index:', ordinalIndex);
              onVoiceOpportunitySelect(ordinalIndex);
              return;
            }

            // Try "select <name>" command with fuzzy matching
            const selectQuery = extractSelectQuery(transcript);
            if (selectQuery) {
              const match = findBestMatchingOpportunity(selectQuery, paginatedOpportunities);
              if (match && onVoiceOpportunitySelect) {
                console.log('Voice matched opportunity by title:', match.opportunity.name, 'score:', match.score);
                onVoiceOpportunitySelect(match.index);
                return;
              }
            }
          }

          // Otherwise, try to extract a country name
          const country = extractCountry(transcript);
          if (country && onVoiceCountrySelect) {
            console.log('Voice selected country:', country);
            onVoiceCountrySelect(country);
          } else {
            console.log('No command found in transcript:', transcript);
          }
        } catch (err) {
          console.error('Error calling ElevenLabs STT:', err);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone permission denied or unavailable:', err);
    }
  };

  // Keep ref updated for keyboard handler
  handleMicClickRef.current = handleMicClick;

  const getUsername = (uid) => {
    return usernames[uid] || `User ${uid?.substring ? uid.substring(0, 8) : uid}`;
  };

  const isMaster = (uid) => {
    return uid === masterId;
  };

  if (loading) {
    return (
      <div className="chat-container">
        <div className="chat-header">
          <h3>Chat</h3>
          <button
            className={`mic-button${isRecording ? ' recording' : ''}`}
            onClick={handleMicClick}
            title={isRecording ? 'Stop recording' : 'Say a country name'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
        </div>
        <div className="chat-loading">
          <p>Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h3>Chat</h3>
        <button
          className={`mic-button${isRecording ? ' recording' : ''}`}
          onClick={handleMicClick}
          title={isRecording ? 'Stop recording' : 'Say a country name'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="chat-message">
              <div className="message-header">
                <span className="message-username">
                  {isMaster(msg.user_id) && <span className="master-emoji">Host</span>}
                  {getUsername(msg.user_id)}
                </span>
                <span className="message-time">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="message-text">{msg.message}</div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSendMessage}>
        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
        />
        <button type="submit" className="chat-send-btn" disabled={!newMessage.trim()}>
          Send
        </button>
      </form>
    </div>
  );
};

export default Chat;
