# RemotePilot Architecture

## System Overview

RemotePilot is a multi-tenant remote device management platform with three user tiers:

```
┌─────────────────────────────────────────────────────┐
│              OWNER (Platform Admin)                  │
│  /owner - Manage all users & devices globally       │
│  - Create/delete user accounts                      │
│  - View all devices across all users                │
│  - No notifications to users/devices                │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│      RESELLERS/TECHNICIANS (User Role)              │
│  / - Dashboard with their devices                   │
│  - Register devices via support codes               │
│  - Manage remote sessions                           │
│  - Send/receive messages                            │
│  - Generate unique support codes                    │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│         TARGET USERS (Public, No Auth)              │
│  /connect - Public landing page                     │
│  - Enter unique support code                        │
│  - Download agent (Windows/macOS)                   │
│  - Agent auto-connects with support code           │
└─────────────────────────────────────────────────────┘
```

## Key Features by Tier

### Owner Dashboard (`/owner`)
- **Admin-only** access (role-based security)
- Create user accounts with custom email + password
- Delete users and cascade delete their devices
- View ALL devices across ALL users
- Monitor user activity and session history
- Revenue metrics (MRR, active users)
- No notifications sent to users or devices

### User Dashboard (`/`)
- Personal device list (only their devices visible)
- Register new devices via support codes
- Manage remote sessions (screen sharing, control)
- Chat with target users in real-time
- Device settings (quality, wallpaper, input control)
- Session history and analytics
- Profile management

### Public Connect Page (`/connect`)
- No authentication required
- Enter unique 32-character support code
- Download links for Windows/macOS agent
- Code pre-fills from URL parameter (`?code=xyz`)
- One-time code validation
- support code generation

## Data Model

### Entities

**User**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "User Name",
  "role": "admin|user",
  "subscription_plan": "free|pro|enterprise",
  "created_by_id": "owner_id",
  "agent_pairing_token": "token_for_device_agent",
  "created_date": "2026-06-19T...",
  "updated_date": "2026-06-19T..."
}
```

**Device**
```json
{
  "id": "uuid",
  "user_id": "user_id",
  "device_name": "John's PC",
  "device_uid": "stable_device_identifier",
  "registration_token": "token_from_agent",
  "operating_system": "Windows|macOS|Linux",
  "online_status": "online|offline",
  "last_seen": "2026-06-19T...",
  "ip_address": "192.168.1.1",
  "remote_input_disabled": false,
  "wallpaper_enabled": true,
  "video_quality": "high",
  "screen_width": 1920,
  "screen_height": 1080,
  "black_screen": false,
  "black_screen_message": "",
  "pending_command": ""
}
```

**SupportCode**
```json
{
  "id": "uuid",
  "user_id": "user_id",
  "code": "a1b2c3d4e5f6...32chars",
  "pairing_token": "token_generated_for_user",
  "expires_at": "2026-06-20T12:00:00Z",
  "used": false,
  "label": "Client Name (optional)",
  "created_date": "2026-06-19T..."
}
```

**Message**
```json
{
  "id": "uuid",
  "device_id": "device_id",
  "user_id": "sender_id",
  "sender_type": "admin|user",
  "content": "Message text",
  "read": false,
  "created_date": "2026-06-19T..."
}
```

**Session**
```json
{
  "id": "uuid",
  "user_id": "user_id",
  "device_id": "device_id",
  "device_name": "snapshot at time",
  "session_start": "2026-06-19T10:00:00Z",
  "session_end": "2026-06-19T10:45:30Z",
  "duration_minutes": 45,
  "status": "active|completed|disconnected"
}
```

## API Endpoints (Backend Functions)

All endpoints are in `functions/deviceApi.js` unless noted.

### Device Registration
- `POST /register-device` - Agent registers with support code
- `POST /heartbeat` - Agent sends alive signal
- `GET /device-status` - Check device status
- `DELETE /device` - Remove device

### User Management
- `POST /create-user` - Owner creates user account (admin-only)
- `DELETE /user` - Owner deletes user (admin-only)

### Support Codes
- `POST /generateSupportCode` - User generates unique code (`functions/generateSupportCode.js`)
- `POST /resolveSupportCode` - Validate code and verify support code (`functions/resolveSupportCode.js`)

### Device Control
- `POST /device-config` - Update settings (quality, wallpaper, input)
- `POST /set-screen-resolution` - Change resolution
- `POST /send-special-key` - Send Ctrl+Alt+Del, Alt+Tab
- `POST /reboot-device` - Reboot or safe mode reboot
- `POST /black-screen` - Toggle black screen overlay

### Messaging
- `POST /send-message` - Send chat message
- `GET /messages` - Fetch conversation history

### WebRTC Signaling
- `GET /webrtc-pending` - Agent polls for pending screen share
- `POST /webrtc-answer` - Agent sends answer SDP

## Support Code Generation

**Algorithm: UUID-based Unique Codes**

```javascript
function generateUniqueCode() {
  // Generate 32-character hex string from UUID
  // e.g., "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
  return crypto.randomUUID().replace(/-/g, "").substring(0, 32);
}

// Check uniqueness: up to 10 attempts to avoid collision
// (collision probability: negligible)
```

**Properties:**
- ✅ Never repeats (UUID-based, cryptographically random)
- ✅ 32-character hex (portable, user-friendly)
- ✅ One-time use (marked after validation)
- ✅ Time-limited (default 24 hours)
- ✅ Can be shared as URL: `/connect?code=xyz...`

## Security Model

### Authentication
- **Owner**: Must be `role="admin"`
- **User**: Authenticated via email + password (Base44 built-in)
- **Target User**: No auth required, code-based access only

### Authorization
- Owner can see/manage all users & devices
- User can see only their own devices
- Target user sees nothing (only downloads agent)

### Data Privacy
- No cross-user data visibility
- Messages only visible to involved parties
- Device control commands never show on target device
- Silent execution (no popups, notifications, or logs visible to target user)

### Code Security
- UUID-based: impossible to guess
- One-time: marked used immediately
- Expiring: default 24 hours
- HTTPS-only: transmitted over encrypted channel

## Deployment

See `DEPLOYMENT.md` for:
- Custom domain setup
- HTTPS configuration
- Docker containerization
- Environment variables
- Monitoring & logging

## Workflow Examples

### Scenario 1: Owner Reselling to Technician
1. Owner logs in to `/owner`
2. Creates user account: `tech@company.com` / `password123`
3. Technician logs in to `/` with credentials
4. Technician registers their own machines
5. Technician generates support codes for clients
6. Owner can see all devices, technician's activity, etc.

### Scenario 2: Technician Supporting a Client
1. Technician logs in to `/`
2. Generates support code with label "Client ABC"
3. Sends link: `https://yourcompany.com/connect?code=abc123...xyz`
4. Client visits link, downloads agent
5. Agent runs, device appears in technician's dashboard (online)
6. Technician clicks "View Screen"
7. WebRTC connects, can control device
8. Chat box appears to send/receive messages
9. Session logged with duration and completion time

### Scenario 3: Device Offline Support
1. Device shows offline in technician's dashboard
2. Technician can regenerate code, share again
3. When device comes online, technician gets access
4. All previous chat history visible

## Performance Considerations

- **Real-time updates**: WebRTC for screen sharing, subscriptions for device status
- **Scalability**: Device list paginated, message history limited to 100
- **Heartbeat interval**: 30 seconds (configurable)
- **Signal polling**: 5 seconds (agent checks for screen share requests)
- **Offline timeout**: Devices marked offline after 2 minutes without heartbeat

## Monitoring Points

- User account creation/deletion events
- Support code generation and redemption
- Device registration and removal
- Session start/end with duration
- Remote input disable/wallpaper changes
- Special commands executed (reboot, Ctrl+Alt+Del)
- Chat message exchanges
- Device online/offline transitions

---

**RemotePilot: Private, Secure, Multi-Tenant Device Management**