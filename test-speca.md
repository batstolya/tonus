Xiaomi Smart Band 10 → Health Connect → Backend
Project Goal

Build a system that collects health and activity data from Xiaomi Smart Band 10 using the official Android Health Connect API and synchronizes it with a backend service for storage, analytics, dashboards, and AI processing.

The solution must not depend on Xiaomi cloud APIs or reverse-engineering of Bluetooth protocols.

High-Level Architecture
+-------------------+
| Xiaomi Smart Band |
+-------------------+
          |
          | Bluetooth
          v
+-------------------+
| Mi Fitness App    |
+-------------------+
          |
          | Sync
          v
+-------------------+
| Health Connect    |
+-------------------+
          |
          | Android API
          v
+-------------------+
| Collector App     |
+-------------------+
          |
          | HTTPS JSON
          v
+-------------------+
| Backend API       |
+-------------------+
          |
          v
+-------------------+
| PostgreSQL        |
+-------------------+
          |
          +--> Analytics
          |
          +--> Grafana
          |
          +--> AI Agent
System Components
1. Xiaomi Smart Band 10

Source of health and activity data.

Expected metrics:

Steps
Calories
Heart Rate
Sleep
Blood Oxygen (SpO₂)
Distance
Exercise Sessions
Active Minutes

The device synchronizes exclusively through Mi Fitness.

2. Mi Fitness

Responsibilities:

Pairing with the band
Synchronization
Writing health data into Android Health Connect

Requirements:

Health Connect integration enabled
User granted permissions
3. Android Collector Application

Custom Android application.

Responsibilities:

Read data from Health Connect
Normalize records
Upload data to backend API
Maintain synchronization state

Technology:

Kotlin
Android SDK
Health Connect SDK
WorkManager
Health Connect Integration
Required Permissions
<uses-permission android:name="android.permission.health.READ_STEPS"/>
<uses-permission android:name="android.permission.health.READ_HEART_RATE"/>
<uses-permission android:name="android.permission.health.READ_SLEEP"/>
<uses-permission android:name="android.permission.health.READ_EXERCISE"/>
<uses-permission android:name="android.permission.health.READ_DISTANCE"/>
<uses-permission android:name="android.permission.health.READ_CALORIES_BURNED"/>
<uses-permission android:name="android.permission.health.READ_OXYGEN_SATURATION"/>
Supported Health Connect Records
StepsRecord
{
  "type": "steps",
  "timestamp": "2026-06-16T08:00:00Z",
  "count": 842
}
HeartRateRecord
{
  "type": "heart_rate",
  "timestamp": "2026-06-16T08:00:00Z",
  "bpm": 74
}
SleepSessionRecord
{
  "type": "sleep",
  "start": "2026-06-15T22:34:00Z",
  "end": "2026-06-16T06:57:00Z",
  "duration_minutes": 503
}
ExerciseSessionRecord
{
  "type": "exercise",
  "exercise_type": "walking",
  "start": "2026-06-16T09:00:00Z",
  "end": "2026-06-16T09:45:00Z",
  "calories": 315
}
OxygenSaturationRecord
{
  "type": "spo2",
  "timestamp": "2026-06-16T08:00:00Z",
  "spo2": 98
}
Collector Sync Logic
Sync Frequency

Every 15 minutes.

Algorithm
1. Read last_sync_time
2. Query Health Connect
3. Fetch records newer than last_sync_time
4. Transform records to unified JSON format
5. Send to backend API
6. Update last_sync_time
Unified Record Format

All metrics should be transformed into a common schema before upload.

{
  "user_id": "uuid",
  "source": "health_connect",
  "metric": "heart_rate",
  "timestamp": "2026-06-16T08:00:00Z",
  "value": 74,
  "metadata": {}
}

Examples:

{
  "metric": "steps",
  "value": 842
}
{
  "metric": "spo2",
  "value": 98
}
Backend API

Base URL:

/api/v1
POST /health/import

Upload health records.

Request:

{
  "user_id": "uuid",
  "records": [
    {
      "metric": "heart_rate",
      "timestamp": "2026-06-16T08:00:00Z",
      "value": 74
    }
  ]
}

Response:

{
  "status": "ok",
  "imported": 1
}
GET /health/latest

Returns latest values.

Response:

{
  "heart_rate": 74,
  "steps_today": 8342,
  "sleep_last_night": 503
}
Database Design
users
CREATE TABLE users (
    id UUID PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
metrics
CREATE TABLE metrics (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    metric_type VARCHAR(50) NOT NULL,
    value NUMERIC NOT NULL,
    ts TIMESTAMP NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

Indexes:

CREATE INDEX idx_metrics_user_time
ON metrics(user_id, ts);

CREATE INDEX idx_metrics_type
ON metrics(metric_type);
Analytics Layer

The backend should calculate derived metrics instead of relying on Xiaomi proprietary scores.

Examples:

Sleep Analytics
Sleep duration
Sleep deficit
Weekly average
Sleep consistency
Heart Rate Analytics
Resting HR
Average HR
HR trend
Recovery trend
Activity Analytics
Daily steps
Weekly steps
Calories burned
Activity streaks
Alerts

Examples:

Sleep below 6 hours for 3 consecutive days
Resting HR above personal baseline
Activity below weekly average
AI Integration

Future AI modules should consume normalized data from PostgreSQL.

Potential use cases:

Daily health summaries
Personalized recommendations
Fatigue detection
Sleep quality prediction
Habit tracking
Long-term health trend analysis
Known Limitations

Health Connect only exposes data that Mi Fitness chooses to publish.

Metrics potentially unavailable:

Stress Score
Body Energy
Recovery Time
Training Load
Readiness Score
Proprietary Xiaomi algorithms

The system must be designed to compute its own analytics from raw health data whenever possible.

Recommended Tech Stack

Android:

Kotlin
Health Connect SDK
WorkManager
Retrofit

Backend:

FastAPI or NestJS
PostgreSQL
Redis (optional)

Analytics:

Grafana
TimescaleDB (optional)

AI:

Python
Pandas
LangGraph
OpenAI API / Claude API