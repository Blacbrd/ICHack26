import React, { useState, useRef, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { supabase } from '../lib/supabaseClient';
import './MyProfile.css';

const MyProfile = ({ user }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [cvUrl, setCvUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [availabilitySlots, setAvailabilitySlots] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const calendarRef = useRef(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError) throw userError;
        
        if (user) {
          setUserId(user.id);
          // Get email from auth user
          setEmail(user.email || '');
          
          // Fetch profile data for username/full name and cv_url
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('username, cv_url')
            .eq('id', user.id)
            .single();
          
          if (profileError) {
            console.error('Error fetching profile:', profileError);
          } else if (profile) {
            setName(profile.username || '');
            setCvUrl(profile.cv_url || null);
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      await uploadCV(file);
    } else {
      alert('Please upload a PDF file');
    }
    // Reset the input
    e.target.value = '';
  };

  const uploadCV = async (file) => {
    if (!userId) {
      alert('User not authenticated');
      return;
    }

    setUploading(true);
    try {
      // Delete old CV if it exists
      if (cvUrl) {
        await removeCV(false);
      }

      // Upload new CV to storage
      const fileExt = 'pdf';
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      const filePath = `cvs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('resumes')
        .getPublicUrl(filePath);

      // Update profile with CV URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ cv_url: publicUrl })
        .eq('id', userId);

      if (updateError) throw updateError;

      setCvUrl(publicUrl);
      setSelectedFile(file);
      alert('CV uploaded successfully!');
    } catch (error) {
      console.error('Error uploading CV:', error);
      alert('Error uploading CV: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const removeCV = async (showAlert = true) => {
    if (!userId || !cvUrl) return;

    setUploading(true);
    try {
      // Extract file path from URL
      const urlParts = cvUrl.split('/resumes/');
      if (urlParts.length > 1) {
        const filePath = urlParts[1].split('?')[0]; // Remove query params if any

        // Delete from storage
        const { error: deleteError } = await supabase.storage
          .from('resumes')
          .remove([`cvs/${filePath}`]);

        if (deleteError) console.error('Error deleting file:', deleteError);
      }

      // Update profile to remove CV URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ cv_url: null })
        .eq('id', userId);

      if (updateError) throw updateError;

      setCvUrl(null);
      setSelectedFile(null);
      if (showAlert) alert('CV removed successfully!');
    } catch (error) {
      console.error('Error removing CV:', error);
      if (showAlert) alert('Error removing CV: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDateSelect = (selectInfo) => {
    const calendarApi = selectInfo.view.calendar;
    calendarApi.unselect();

    const start = selectInfo.start;
    const end = selectInfo.end;
    const durationMinutes = (end - start) / (1000 * 60);

    const newEvent = {
      id: Date.now().toString(),
      title: 'Available',
      start: start,
      end: end,
      backgroundColor: '#171717',
      borderColor: '#171717',
      extendedProps: {
        durationMinutes: durationMinutes
      }
    };

    setAvailabilitySlots([...availabilitySlots, newEvent]);
  };

  const handleEventClick = (clickInfo) => {
    if (window.confirm(`Delete availability slot on ${clickInfo.event.start.toLocaleString()}?`)) {
      clickInfo.event.remove();
      setAvailabilitySlots(availabilitySlots.filter(slot => slot.id !== clickInfo.event.id));
    }
  };

  const handleSave = () => {
    const formattedAvailability = availabilitySlots.map(slot => ({
      id: slot.id,
      startTime: slot.start.toISOString(),
      endTime: slot.end.toISOString(),
      durationMinutes: slot.extendedProps.durationMinutes,
      date: slot.start.toLocaleDateString(),
      timeRange: `${slot.start.toLocaleTimeString()} - ${slot.end.toLocaleTimeString()}`
    }));

    console.log('Saving profile:', { 
      name, 
      email, 
      cv: selectedFile, 
      availability: formattedAvailability 
    });
    alert('Profile saved successfully!');
  };



  return (
    <div className="myprofile-page">
      <div className="myprofile-container">
        <div className="myprofile-header">
          <h1>Profile</h1>
        </div>

        <div className="profile-content">
          {/* Personal Info Section */}
          <div className="info-section">
            <h2>Personal Information</h2>
            <div className="input-group">
              <input
                type="text"
                placeholder="Full Name"
                className="input-field"
                value={name}
                readOnly
                disabled
              />
            </div>
            <div className="input-group">
              <input
                type="email"
                placeholder="Email Address"
                className="input-field"
                value={email}
                readOnly
                disabled
              />
            </div>
          </div>

          {/* CV Upload Section */}
          <div className="info-section">
            <h2>Resume / CV</h2>
            {cvUrl ? (
              <div className="cv-display">
                <div className="cv-info">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                  </svg>
                  <span>Resume uploaded</span>
                  <a href={cvUrl} target="_blank" rel="noopener noreferrer" className="cv-view-link">
                    View
                  </a>
                </div>
                <button 
                  onClick={removeCV} 
                  className="cv-remove-btn"
                  disabled={uploading}
                >
                  {uploading ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ) : (
              <div className="file-upload-wrapper">
                <input
                  type="file"
                  id="cv"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="file-input"
                  disabled={uploading}
                />
                <label htmlFor="cv" className="file-upload-label">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  {uploading ? 'Uploading...' : 'Upload PDF'}
                </label>
              </div>
            )}
          </div>

          {/* Availability Section */}
          <div className="info-section">
            <h2>Availability Calendar</h2>
            <p className="calendar-instructions">
              Click and drag on the calendar to select your available time slots
            </p>
            <div className="calendar-wrapper">
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="timeGridWeek"
                headerToolbar={{
                  left: 'prev,next today',
                  center: 'title',
                  right: 'timeGridWeek,timeGridDay'
                }}
                editable={true}
                selectable={true}
                selectMirror={true}
                dayMaxEvents={true}
                weekends={true}
                events={availabilitySlots}
                select={handleDateSelect}
                eventClick={handleEventClick}
                slotMinTime="06:00:00"
                slotMaxTime="22:00:00"
                allDaySlot={false}
                height="auto"
                slotDuration="00:30:00"
                snapDuration="00:15:00"
              />
            </div>
            {availabilitySlots.length > 0 && (
              <div className="slots-summary">
                <p className="summary-text">
                  {availabilitySlots.length} availability slot{availabilitySlots.length !== 1 ? 's' : ''} selected
                </p>
              </div>
            )}
          </div>

          {/* Save Button */}
          <button className="save-button" onClick={handleSave}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default MyProfile;
