// src/pages/LoginPage.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import useTheme from '../lib/useTheme';
import './LoginPage.css';

const COUNTRY_OPTIONS = [
  'united kingdom',
  'france',
  'kenya',
  'germany',
  'netherlands',
  'italy',
  'spain',
  'united states',
  'canada',
  'australia',
  'india'
];

const CAUSES_LIST = [
  'Animal Welfare',
  'Arts and Culture',
  'Children',
  'Civil Rights and Social Action',
  'Disaster and Humanitarian Relief',
  'Economic Empowerment',
  'Education',
  'Environment',
  'Health',
  'Human Rights',
  'Politics',
  'Poverty Alleviation',
  'Science and Technology',
  'Social Services',
  'Veteran Support'
];

const LoginPage = () => {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [causes, setCauses] = useState([]);
  const [isCharity, setIsCharity] = useState(false);

  // Charity fields
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [country, setCountry] = useState('');
  const [link, setLink] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useTheme('dark');

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  // Toggle a cause on/off (used in both charity and volunteer signups)
  const handleCauseToggle = (cause) => {
    setCauses((prev) => {
      if (prev.includes(cause)) {
        return prev.filter((c) => c !== cause);
      } else {
        // enforce max of 5
        if (prev.length >= 5) return prev;
        return [...prev, cause];
      }
    });
  };

  const validateCharityFields = () => {
    if (!lat || !lon) {
      setError('Latitude and longitude are required for charities.');
      return false;
    }
    if (!country) {
      setError('Country is required for charities.');
      return false;
    }
    if (causes.length < 1 || causes.length > 5) {
      setError('Please select between 1 and 5 causes.');
      return false;
    }
    const latN = Number(lat);
    const lonN = Number(lon);
    if (Number.isNaN(latN) || Number.isNaN(lonN)) {
      setError('Latitude and longitude must be valid numbers.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Pre-check: if signing up as charity, ensure email not already in profiles/charities
      if (isSignUp && isCharity) {
        const [{ data: inProfiles }, { data: inCharities }] = await Promise.all([
          supabase.from('profiles').select('id').ilike('email', email).maybeSingle(),
          supabase.from('charities').select('charity_id').ilike('email', email).maybeSingle(),
        ]);

        if (inProfiles) {
          setError('This email is already registered as a volunteer. Use a different email or contact support.');
          setLoading(false);
          return;
        }
        if (inCharities) {
          setError('This email is already registered as a charity. Please sign in instead.');
          setLoading(false);
          return;
        }
      }

      if (isSignUp) {
        if (isCharity && !validateCharityFields()) {
          setLoading(false);
          return;
        }

        // Create user in Supabase Auth
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username || email.split('@')[0],
              avatar_url: avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username || email.split('@')[0])}`
            }
          }
        });

        if (signUpError) throw signUpError;

        // Supabase may require email confirmation; user row may not be immediately available.
        const user = data?.user;
        if (!user) {
          // Inform the user to confirm email before DB row creation (safe)
          setError('Sign up submitted. Please check your email to confirm your account before continuing.');
          setLoading(false);
          return;
        }

        const userId = user.id;

        if (isCharity) {
          // Insert charity record into charities table
          const charityPayload = {
            charity_id: userId,
            name: username || (email ? email.split('@')[0] : 'Charity'),
            email,
            lat: Number(lat),
            lon: Number(lon),
            country,
            causes,
            link: link || null,
          };

          const { error: insertError } = await supabase.from('charities').insert(charityPayload);
          if (insertError) {
            console.error('Failed inserting charity:', insertError);
            setError(insertError.message || 'Failed to create charity record.');
            setLoading(false);
            return;
          }

          // success -> go to charity area
          navigate('/charity-referrals');
        } else {
          // Volunteer: create/upsert profile row (store causes & avatar)
          const profilePayload = {
            id: userId,
            username: username || (email ? email.split('@')[0] : ''),
            email,
            causes: causes.length ? causes : null,
            avatar_url: avatarUrl || null,
          };

          const { error: upsertError } = await supabase.from('profiles').upsert(profilePayload);
          if (upsertError) {
            console.error('Failed upserting profile:', upsertError);
            // Not fatal — we'll still navigate
          }

          navigate('/');
        }
      } else {
        // Sign in
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          if (signInError.message && (signInError.message.includes('Invalid login credentials') || signInError.message.includes('Email not confirmed'))) {
            setError('You need to sign up. Please use the "Sign Up" option below.');
          } else {
            setError(signInError.message || 'Failed to sign in.');
          }
          setLoading(false);
          return;
        }

        if (data?.user) {
          const userId = data.user.id;

          // Check charities first
          const { data: charityRow, error: charityErr } = await supabase
            .from('charities')
            .select('*')
            .eq('charity_id', userId)
            .maybeSingle();

          if (charityErr) {
            console.error('Error checking charities on sign-in:', charityErr);
          }

          if (charityRow) {
            navigate('/charity-referrals');
            setLoading(false);
            return;
          }

          // Else: volunteer
          navigate('/');
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      setError(err?.message || 'Failed to authenticate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`login-page ${theme}`}>
      <button type="button" className="theme-toggle" onClick={toggleTheme}>
        {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
      </button>
      <div className="login-container">
        <div className="login-logo">
          <img className="login-logo-mark" src="/imc-logo.svg" alt="IMC Trading Logo" />
          <div className="login-logo-text">
            <h1 className="login-title">VisaWorld</h1>
            <p className="login-tagline">Wereld van Leven</p>
          </div>
        </div>

        <p className="login-subtitle">{isSignUp ? 'Create an account' : 'Sign in to your account'}</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          {isSignUp && (
            <>
              <input
                type="text"
                className="form-input"
                placeholder={isCharity ? 'Charity name' : 'Username'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />

              <div className="role-selection" style={{ marginBottom: 12 }}>
                <label style={{ marginRight: 12 }}>
                  <input type="radio" name="role" value="volunteer" checked={!isCharity} onChange={() => setIsCharity(false)} /> Volunteer
                </label>
                <label>
                  <input type="radio" name="role" value="charity" checked={isCharity} onChange={() => setIsCharity(true)} /> Charity
                </label>
              </div>

              {/* Charity-specific fields */}
              {isCharity && (
                <div className="charity-fields" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="number" step="any" className="form-input" placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} required />
                    <input type="number" step="any" className="form-input" placeholder="Longitude" value={lon} onChange={(e) => setLon(e.target.value)} required />
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <select className="form-input" value={country} onChange={(e) => setCountry(e.target.value)} required>
                      <option value="">Select country</option>
                      {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <label>Causes (select 1–5):</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {CAUSES_LIST.map((c) => (
                        <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input type="checkbox" checked={causes.includes(c)} onChange={() => handleCauseToggle(c)} />
                          <span style={{ fontSize: 14 }}>{c}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <input type="url" className="form-input" placeholder="Website (optional)" value={link} onChange={(e) => setLink(e.target.value)} />
                  </div>
                </div>
              )}

              {/* Avatar / profile picture for both roles */}
              <input
                type="url"
                className="form-input"
                placeholder="Profile Picture URL (Optional)"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />

              {/* Causes selection area for volunteers too (optional) */}
              {!isCharity && (
                <div className="causes-container" style={{ marginTop: 8 }}>
                  <label className="causes-label">Select your causes of interest (optional):</label>
                  <div className="causes-grid">
                    {CAUSES_LIST.map((cause) => (
                      <label key={cause} className="cause-checkbox">
                        <input
                          type="checkbox"
                          checked={causes.includes(cause)}
                          onChange={() => handleCauseToggle(cause)}
                        />
                        <span className="cause-text">{cause}</span>
                      </label>
                    ))}
                  </div>
                  {causes.length > 0 && (
                    <p className="causes-selected">
                      Selected: {causes.length} cause{causes.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <input type="email" className="form-input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />

          <input type="password" className="form-input" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={isSignUp ? 'new-password' : 'current-password'} minLength={6} />

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <div className="login-switch">
          <p>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <button type="button" className="btn-link" onClick={() => { setIsSignUp(!isSignUp); setError(''); }}>
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
