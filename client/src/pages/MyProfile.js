import React, { useState, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import './MyProfile.css';

const MyProfile = ({ user }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [availabilitySlots, setAvailabilitySlots] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const calendarRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
    } else {
      alert('Please upload a PDF file');
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
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="input-group">
              <input
                type="email"
                placeholder="Email Address"
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {/* CV Upload Section */}
          <div className="info-section">
            <h2>Resume / CV</h2>
            <div className="file-upload-wrapper">
              <input
                type="file"
                id="cv"
                accept=".pdf"
                onChange={handleFileChange}
                className="file-input"
              />
              <label htmlFor="cv" className="file-upload-label">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                {selectedFile ? selectedFile.name : 'Upload PDF'}
              </label>
            </div>
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
