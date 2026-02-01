# Supabase Availability Slots Setup

## Create the availability_slots Table

Go to your Supabase Dashboard → **SQL Editor** and run this SQL:

```sql
-- Create availability_slots table
CREATE TABLE IF NOT EXISTS availability_slots (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX idx_availability_user_id ON availability_slots(user_id);
CREATE INDEX idx_availability_start_time ON availability_slots(start_time);

-- Enable Row Level Security
ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own availability slots
CREATE POLICY "Users can view own availability"
  ON availability_slots
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own availability slots
CREATE POLICY "Users can insert own availability"
  ON availability_slots
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own availability slots
CREATE POLICY "Users can update own availability"
  ON availability_slots
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own availability slots
CREATE POLICY "Users can delete own availability"
  ON availability_slots
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create a trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_availability_slots_updated_at
  BEFORE UPDATE ON availability_slots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE availability_slots IS 'Stores user availability time slots for volunteering';
COMMENT ON COLUMN availability_slots.user_id IS 'Reference to the user who owns this availability slot';
COMMENT ON COLUMN availability_slots.start_time IS 'Start date and time of availability';
COMMENT ON COLUMN availability_slots.end_time IS 'End date and time of availability';
COMMENT ON COLUMN availability_slots.duration_minutes IS 'Duration of the slot in minutes';
```

## Table Structure

| Column            | Type         | Description                                    |
|-------------------|--------------|------------------------------------------------|
| id                | BIGSERIAL    | Primary key (auto-incrementing)                |
| user_id           | UUID         | Foreign key to auth.users                      |
| start_time        | TIMESTAMPTZ  | Start date/time of availability                |
| end_time          | TIMESTAMPTZ  | End date/time of availability                  |
| duration_minutes  | INTEGER      | Duration in minutes                            |
| created_at        | TIMESTAMPTZ  | When the slot was created                      |
| updated_at        | TIMESTAMPTZ  | When the slot was last updated                 |

## How It Works

1. **Creating Slots**: When a user clicks and drags on the calendar, a new slot is immediately saved to the database
2. **Loading Slots**: When the profile page loads, all the user's availability slots are fetched and displayed on the calendar
3. **Deleting Slots**: When a user clicks on a slot and confirms deletion, it's removed from the database
4. **Security**: Row Level Security ensures users can only see and modify their own availability slots

## Features

✅ Real-time saving - slots are saved as they're created
✅ Automatic loading - slots appear when the page loads
✅ Secure - users can only access their own data
✅ Persistent - data survives page refreshes and across sessions

## Verification

After running the SQL:

1. Go to **Table Editor** in Supabase
2. You should see the `availability_slots` table
3. Try creating some availability slots on the profile page
4. Check the table to see the data being stored

## Optional: Allow Others to View User Availability

If you want charities or other users to view someone's availability (for matching purposes), add this policy:

```sql
-- Policy: Allow authenticated users to view all availability (for matching)
CREATE POLICY "Authenticated users can view all availability"
  ON availability_slots
  FOR SELECT
  TO authenticated
  USING (true);
```

**Note**: Only add this if you need other users to see availability slots for matching/scheduling purposes.
