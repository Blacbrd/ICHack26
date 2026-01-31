import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import useTheme from '../lib/useTheme';
import './LoginPage.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [causes, setCauses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useTheme('dark');

  const causesList = [
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
    'Poverty Alleviation',
    'Science and Technology',
    'Social Services',
    'Veteran Support'
  ];

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleCauseToggle = (cause) => {
    setCauses((prev) => {
      if (prev.includes(cause)) {
        return prev.filter((c) => c !== cause);
      } else {
        return [...prev, cause];
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        // Sign up
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username || email.split('@')[0],
            },
          },
        });

        if (signUpError) throw signUpError;

        if (data.user) {
          // Store causes in profiles table
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
              id: data.user.id,
              username: username || email.split('@')[0],
              causes: causes,
            });

          if (profileError) {
            console.error('Error saving causes:', profileError);
          }

          // Successfully signed up, user will be redirected automatically
          navigate('/');
        }
      } else {
        // Sign in
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          // Check if it's an invalid login (user doesn't exist)
          if (signInError.message.includes('Invalid login credentials') || signInError.message.includes('Email not confirmed')) {
            setError('You need to sign up. Please use the "Sign Up" option below.');
          } else {
            throw signInError;
          }
          return;
        }

        if (data.user) {
          navigate('/');
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      setError(err.message || 'Failed to authenticate. Please try again.');
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
        <p className="login-subtitle">
          {isSignUp ? 'Create an account' : 'Sign in to your account'}
        </p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          {isSignUp && (
            <input
              type="text"
              className="form-input"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required={isSignUp}
            />
          )}

          <input
            type="email"
            className="form-input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <input
            type="password"
            className="form-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            minLength={6}
          />

          {isSignUp && (
            <div className="causes-container">
              <label className="causes-label">Select your causes of interest:</label>
              <div className="causes-grid">
                {causesList.map((cause) => (
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

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading
              ? 'Please wait...'
              : isSignUp
              ? 'Sign Up'
              : 'Sign In'}
          </button>
        </form>

        <div className="login-switch">
          <p>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
