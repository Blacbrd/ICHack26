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
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [causes, setCauses] = useState([]);
  const [isCharity, setIsCharity] = useState(false);

  // Charity fields
  const [address, setAddress] = useState('');
  const [country, setCountry] = useState('');
  const [link, setLink] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useTheme('dark');

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  // Handle profile picture upload
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Upload avatar to Supabase storage
  const uploadAvatar = async (file, userId) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}-${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file);

    if (uploadError) {
      console.error('Avatar upload error:', uploadError);
      return null;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
    return data.publicUrl;
  };

  // Geocode address to lat/lon using Nominatim API
  const addressToLatLng = async (addressString) => {
    const url = "https://nominatim.openstreetmap.org/search";
    const params = new URLSearchParams({
      q: addressString,
      format: "json",
      limit: "1"
    });

    try {
      const response = await fetch(`${url}?${params}`, {
        headers: {
          "User-Agent": "IMCharitable-App"
        }
      });
      const data = await response.json();

      if (!data || data.length === 0) {
        return null;
      }

      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  };

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
    if (!address) {
      setError('Address is required for charities.');
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

        // Upload avatar if file was selected
        let finalAvatarUrl = avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username || email.split('@')[0])}`;
        if (avatarFile) {
          const uploadedUrl = await uploadAvatar(avatarFile, userId);
          if (uploadedUrl) {
            finalAvatarUrl = uploadedUrl;
          }
        }

        if (isCharity) {
          // Geocode the address to get lat/lon
          const coords = await addressToLatLng(address);
          if (!coords) {
            setError('Could not find coordinates for the provided address. Please check the address and try again.');
            setLoading(false);
            return;
          }

          // Insert charity record into charities table
          const charityPayload = {
            charity_id: userId,
            name: username || (email ? email.split('@')[0] : 'Charity'),
            email,
            lat: coords.lat,
            lon: coords.lon,
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
            avatar_url: finalAvatarUrl,
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
          <img className="login-logo-mark" src="/imcharitable-white.png" alt="IMCharitable" style={{ height: '50px' }} />
        </div>

        <p className="login-subtitle">{isSignUp ? 'Create an account' : 'Sign in to your account'}</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          {isSignUp && (
            <>
              <input
                type="text"
                className="form-input"
                placeholder={isCharity ? 'Charity Name' : 'Username'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />

              {/* Role Selection - Modern Card Style */}
              <div className="role-selection">
                <div className="role-option">
                  <input
                    type="radio"
                    id="role-volunteer"
                    name="role"
                    value="volunteer"
                    checked={!isCharity}
                    onChange={() => setIsCharity(false)}
                  />
                  <label htmlFor="role-volunteer" className="role-label">
                    <div className="role-title">Volunteer</div>
                    <div className="role-description">Join and contribute</div>
                  </label>
                </div>
                <div className="role-option">
                  <input
                    type="radio"
                    id="role-charity"
                    name="role"
                    value="charity"
                    checked={isCharity}
                    onChange={() => setIsCharity(true)}
                  />
                  <label htmlFor="role-charity" className="role-label">
                    <div className="role-title">Charity</div>
                    <div className="role-description">Find volunteers</div>
                  </label>
                </div>
              </div>

              {/* Charity-specific fields */}
              {isCharity && (
                <div className="charity-fields">
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                  />

                  <select className="form-input" value={country} onChange={(e) => setCountry(e.target.value)} required>
                    <option value="">Select Country</option>
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                      </option>
                    ))}
                  </select>

                  <div className="causes-container">
                    <label className="causes-label">Select Causes (1–5)</label>
                    <div className="causes-grid">
                      {CAUSES_LIST.map((c) => (
                        <div key={c} className="cause-chip">
                          <input
                            type="checkbox"
                            id={`charity-cause-${c}`}
                            checked={causes.includes(c)}
                            onChange={() => handleCauseToggle(c)}
                          />
                          <label htmlFor={`charity-cause-${c}`} className="cause-chip-label">
                            {c}
                          </label>
                        </div>
                      ))}
                    </div>
                    {causes.length > 0 && (
                      <p className="causes-selected">
                        {causes.length} of 5 selected
                      </p>
                    )}
                  </div>

                  <input
                    type="url"
                    className="form-input"
                    placeholder="Website (Optional)"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                  />
                </div>
              )}

              {/* Profile Picture Upload */}
              <div className="profile-upload">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Profile preview" className="profile-preview" />
                ) : (
                  <div className="profile-placeholder">
                    {username ? username.charAt(0).toUpperCase() : '?'}
                  </div>
                )}
                <div className="upload-button">
                  <input
                    type="file"
                    id="avatar-upload"
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                  <label htmlFor="avatar-upload" className="upload-label">
                    {avatarPreview ? 'Change Photo' : 'Upload Photo'}
                  </label>
                </div>
                <p className="upload-hint">JPG, PNG or GIF (Max 5MB)</p>
              </div>

              {/* Causes selection area for volunteers */}
              {!isCharity && (
                <div className="causes-container">
                  <label className="causes-label">Select Causes (Optional)</label>
                  <div className="causes-grid">
                    {CAUSES_LIST.map((cause) => (
                      <div key={cause} className="cause-chip">
                        <input
                          type="checkbox"
                          id={`volunteer-cause-${cause}`}
                          checked={causes.includes(cause)}
                          onChange={() => handleCauseToggle(cause)}
                        />
                        <label htmlFor={`volunteer-cause-${cause}`} className="cause-chip-label">
                          {cause}
                        </label>
                      </div>
                    ))}
                  </div>
                  {causes.length > 0 && (
                    <p className="causes-selected">
                      {causes.length} selected
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <input
            type="email"
            className="form-input"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <input
            type="password"
            className="form-input"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            minLength={6}
          />

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
