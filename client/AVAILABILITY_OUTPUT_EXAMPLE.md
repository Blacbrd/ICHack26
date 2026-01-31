# Availability Calendar Output Format

## Overview
When users interact with the FullCalendar on the MyProfile page, they can click and drag to select time slots. The output is an array of availability events with precise start/end times and durations.

## Output Data Structure

```javascript
{
  name: "John Doe",
  email: "john.doe@example.com",
  cv: File, // PDF file object
  availability: [
    {
      id: "1738358400000",
      startTime: "2026-02-15T09:00:00.000Z",
      endTime: "2026-02-15T11:00:00.000Z",
      durationMinutes: 120,
      date: "2/15/2026",
      timeRange: "9:00:00 AM - 11:00:00 AM"
    },
    {
      id: "1738444800000",
      startTime: "2026-02-16T14:00:00.000Z",
      endTime: "2026-02-16T16:30:00.000Z",
      durationMinutes: 150,
      date: "2/16/2026",
      timeRange: "2:00:00 PM - 4:30:00 PM"
    },
    {
      id: "1738531200000",
      startTime: "2026-02-17T10:00:00.000Z",
      endTime: "2026-02-17T12:00:00.000Z",
      durationMinutes: 120,
      date: "2/17/2026",
      timeRange: "10:00:00 AM - 12:00:00 PM"
    }
  ]
}
```

## Field Descriptions

- **id**: Unique identifier (timestamp-based string)
- **startTime**: ISO 8601 formatted start datetime (UTC)
- **endTime**: ISO 8601 formatted end datetime (UTC)
- **durationMinutes**: Duration of the availability slot in minutes
- **date**: Human-readable date string
- **timeRange**: Human-readable time range string

## How Users Interact

1. **Add Availability**: Click and drag on the calendar to select a time slot
2. **Set Duration**: Drag the time slot to desired length (minimum 15 minutes)
3. **Edit**: Drag existing slots to move or resize them
4. **Delete**: Click on a slot to delete it
5. **View Multiple Weeks**: Navigate between weeks and add slots across different dates

## Calendar Features

- **Time Grid View**: Shows hourly slots from 6:00 AM to 10:00 PM
- **15-minute Snap**: Slots snap to 15-minute intervals for precision
- **30-minute Slots**: Default slot duration is 30 minutes
- **Week/Day View**: Switch between week and day views
- **Drag & Drop**: Resize and move slots easily
- **Click to Delete**: Simple deletion with confirmation

## Backend Integration

The availability data can be sent to your backend API endpoint:

```javascript
// Example POST request
const response = await fetch('/api/profile/availability', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: user.id,
    availability: formattedAvailability
  })
});
```

## Database Storage Recommendations

Store each availability slot as a separate record:

```sql
CREATE TABLE user_availability (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id),
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  duration_minutes INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```

Or store as JSON array:

```sql
CREATE TABLE user_profiles (
  user_id VARCHAR PRIMARY KEY,
  name VARCHAR,
  email VARCHAR,
  cv_url VARCHAR,
  availability JSONB
);
```
