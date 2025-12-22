# 🐱 Cats Gallery API

A full-stack cat gallery application built with **Hono.js** and deployed on **Cloudflare Workers** with **D1 SQLite** database. Features user authentication with secure cookie-based sessions, a shopping cart system, and CRUD operations for managing cat entries.

---

## 📑 Table of Contents

- [Project Overview](#-project-overview)
- [Technology Stack](#-technology-stack)
- [Project Structure](#-project-structure)
- [Database Schema](#-database-schema)
- [Authentication System](#-authentication-system)
- [Cookies & Sessions Explained](#-cookies--sessions-explained)
- [API Endpoints](#-api-endpoints)
- [Frontend Features](#-frontend-features)
- [Getting Started](#-getting-started)

---

## 🌟 Project Overview

This project is a cat gallery web application that allows users to:
- Browse and search for cats by name or tags
- Register and login with secure authentication
- Add, edit, and delete cat entries (authenticated users only)
- Add cats to a shopping cart (authenticated users only)

---

## 🛠 Technology Stack

| Technology | Purpose |
|------------|---------|
| **Hono.js** | Lightweight web framework for Cloudflare Workers |
| **Cloudflare Workers** | Serverless edge computing platform |
| **Cloudflare D1** | SQLite database at the edge |
| **bcryptjs** | Password hashing library |
| **Vanilla JavaScript** | Frontend interactivity |
| **CSS3** | Styling with modern design |

---

## 📁 Project Structure

```
api/
├── app.js              # Main backend API (Hono.js routes)
├── schema.sql          # Database schema definitions
├── package.json        # Node.js dependencies
├── wrangler.jsonc      # Cloudflare Workers configuration
├── middleware/         # Custom middleware (if any)
└── public/             # Frontend files
    ├── index.html      # Main gallery page
    ├── login.html      # Authentication page
    ├── script.js       # Main frontend JavaScript
    ├── auth.js         # Authentication frontend logic
    └── style.css       # Stylesheets
```

---

## 🗄 Database Schema

The application uses 4 tables in the D1 SQLite database:

### Users Table
```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT  -- Hashed with bcrypt
);
```

### Cats Table
```sql
CREATE TABLE IF NOT EXISTS cats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    pfp TEXT,   -- Profile picture URL
    tags TEXT   -- Comma-separated tags
);
```

### Cart Table
```sql
CREATE TABLE IF NOT EXISTS cart (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    cat_id INTEGER NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (cat_id) REFERENCES cats(id) ON DELETE CASCADE,
    UNIQUE(user_id, cat_id)
);
```

### Sessions Table
```sql
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## 🔐 Authentication System

The application implements a **cookie-based session authentication** system. Here's how it works:

### Registration Flow
1. User submits username, email, and password
2. Server validates input and checks for existing users
3. Password is hashed using **bcrypt** with 10 salt rounds
4. User is saved to the `users` table
5. A new session is created and stored in the `sessions` table
6. Session ID is sent back as an **HTTP-only cookie**

### Login Flow
1. User submits email and password
2. Server retrieves user by email
3. Password is verified using `bcrypt.compare()`
4. If valid, a new session is created
5. Session ID is sent back as an **HTTP-only cookie**

### Logout Flow
1. Server reads the session ID from the cookie
2. Session is deleted from the `sessions` table
3. Cookie is deleted from the client

---

## 🍪 Cookies & Sessions Explained

### What are Cookies?

Cookies are small pieces of data stored by the browser and sent with every HTTP request to the same domain. In this application, cookies are used to maintain user authentication state.

### What are Sessions?

Sessions are server-side records that link a unique session ID to a user. The session ID is stored in a cookie on the client, while the session data (user info, expiration) is stored in the database.

---

### Cookie Configuration in This Project

Located in `app.js`:

```javascript
const SESSION_DURATION_DAYS = 7;

const COOKIE_OPTIONS = {
  httpOnly: true,     // Cannot be accessed by JavaScript (XSS protection)
  secure: true,       // Only sent over HTTPS
  sameSite: 'None',   // Required for cross-origin requests
  path: '/',          // Cookie is valid for all paths
  maxAge: 60 * 60 * 24 * SESSION_DURATION_DAYS  // 7 days in seconds
};
```

### Cookie Options Explained

| Option | Value | Purpose |
|--------|-------|---------|
| `httpOnly` | `true` | **Security**: Prevents JavaScript from accessing the cookie, protecting against XSS attacks |
| `secure` | `true` | **Security**: Cookie is only sent over HTTPS connections |
| `sameSite` | `'None'` | Allows cookie to be sent in cross-origin requests (needed for Cloudflare Workers) |
| `path` | `'/'` | Cookie is valid for all routes on the domain |
| `maxAge` | `604800` | Cookie expires after 7 days (in seconds) |

---

### Session Management Functions

#### 1. Generate Session ID
```javascript
function generateSessionId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let sessionId = '';
  for (let i = 0; i < 64; i++) {
    sessionId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return sessionId;
}
```
Generates a random 64-character alphanumeric string for secure session identification.

#### 2. Create Session
```javascript
async function createSession(db, userId) {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await db.prepare(
    'INSERT INTO sessions (session_id, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, userId, expiresAt).run();

  return sessionId;
}
```
Creates a new session record in the database with an expiration date.

#### 3. Get Session
```javascript
async function getSession(db, sessionId) {
  const session = await db.prepare(
    'SELECT s.*, u.id as user_id, u.username, u.email FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.session_id = ? AND s.expires_at > datetime("now")'
  ).bind(sessionId).first();

  return session;
}
```
Retrieves session data if it exists and hasn't expired.

#### 4. Delete Session
```javascript
async function deleteSession(db, sessionId) {
  await db.prepare('DELETE FROM sessions WHERE session_id = ?').bind(sessionId).run();
}
```
Removes a session from the database (used for logout).

---

### Authentication Middleware

The `authenticateSession` middleware protects routes that require authentication:

```javascript
const authenticateSession = async (c, next) => {
  // 1. Get session ID from cookie
  const sessionId = getCookie(c, 'sessionId');
  
  if (!sessionId) {
    return c.json({ error: 'Access denied. Not authenticated.' }, 401);
  }

  // 2. Validate session in database
  const session = await getSession(db, sessionId);

  if (!session) {
    // Session expired or invalid - clear the cookie
    deleteCookie(c, 'sessionId', { path: '/' });
    return c.json({ error: 'Session expired. Please sign in again.' }, 401);
  }

  // 3. Set user info on request context
  c.set('user', {
    id: session.user_id,
    username: session.username,
    email: session.email
  });

  await next();
};
```

---

### Frontend Cookie Handling

All frontend API requests include `credentials: 'include'` to send cookies:

```javascript
// Example: Checking authentication state
const response = await fetch(`${API_URL}/auth/me`, {
  credentials: 'include'  // This sends cookies with the request
});

// Example: Login request
const response = await fetch(`${API_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',  // This allows receiving and sending cookies
  body: JSON.stringify({ email, password })
});
```

### CORS Configuration for Cookies

To allow cookies in cross-origin requests, the server configures CORS:

```javascript
app.use('*', cors({
  origin: (origin) => origin || '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  credentials: true  // This is required for cookies to work cross-origin
}));
```

---

## 🔌 API Endpoints

### Authentication Routes

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/register` | Register a new user | No |
| POST | `/auth/login` | Login and get session cookie | No |
| POST | `/auth/logout` | Logout and clear session | No |
| GET | `/auth/me` | Get current user info | Yes (Cookie) |

### Cats Routes

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/cats` | List all cats (paginated) | No |
| GET | `/cats?tag=cute` | Search cats by tag | No |
| GET | `/cats/:id` | Get a single cat | No |
| POST | `/cats` | Create a new cat | Yes |
| PUT | `/cats/:id` | Update a cat | Yes |
| DELETE | `/cats/:id` | Delete a cat | Yes |

### Cart Routes

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/cart` | Get user's cart | Yes |
| POST | `/cart` | Add cat to cart | Yes |
| DELETE | `/cart/:catId` | Remove cat from cart | Yes |
| DELETE | `/cart` | Clear entire cart | Yes |

---

## 🎨 Frontend Features

### Main Gallery (`index.html` + `script.js`)
- **Cat Grid Display**: Shows all cats in a responsive grid
- **Pagination**: Navigate through pages of cats
- **Name Search**: Filter cats by name (client-side)
- **Tag Search**: Filter cats by tags (server-side)
- **CRUD Operations**: Add, edit, delete cats (authenticated only)
- **Shopping Cart**: Sidebar cart for authenticated users

### Authentication Page (`login.html` + `auth.js`)
- **Tab-based UI**: Switch between login and register forms
- **Form Validation**: Client-side validation with error messages
- **Auto-redirect**: Already logged-in users are redirected to gallery
- **Session Persistence**: Login state persists across browser sessions

---

## 🚀 Getting Started

### Prerequisites
- Node.js installed
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create the D1 database**
   ```bash
   wrangler d1 create cats-db
   ```

3. **Run the database migrations**
   ```bash
   wrangler d1 execute cats-db --file=schema.sql
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Deploy to Cloudflare**
   ```bash
   npm run deploy
   ```

---

## 🔒 Security Best Practices Used

1. **HTTP-Only Cookies**: Session cookies cannot be accessed by JavaScript
2. **Secure Flag**: Cookies are only sent over HTTPS
3. **Password Hashing**: bcrypt with salt rounds for secure password storage
4. **Session Expiration**: Sessions automatically expire after 7 days
5. **CORS Configuration**: Properly configured for cross-origin requests
6. **Input Validation**: Server-side validation for all inputs
7. **XSS Prevention**: HTML escaping in frontend rendering

---

## 📝 Summary: Cookie & Session Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        LOGIN FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Client                          Server                         │
│   ──────                          ──────                         │
│                                                                  │
│   1. POST /auth/login ───────────────►                          │
│      { email, password }                                         │
│                                                                  │
│                              2. Validate credentials             │
│                              3. Hash compare password            │
│                              4. Generate session ID              │
│                              5. Store in sessions table          │
│                                                                  │
│   ◄─────────────────────────── 6. Set-Cookie: sessionId=xxx     │
│                                   (httpOnly, secure)             │
│                                                                  │
│   7. Store cookie locally                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   AUTHENTICATED REQUEST                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Client                          Server                         │
│   ──────                          ──────                         │
│                                                                  │
│   1. GET /cart ──────────────────────►                          │
│      Cookie: sessionId=xxx                                       │
│                                                                  │
│                              2. Read sessionId from cookie       │
│                              3. Query sessions table             │
│                              4. Verify not expired               │
│                              5. Get user from session            │
│                                                                  │
│   ◄─────────────────────────── 6. Return user's cart data       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        LOGOUT FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Client                          Server                         │
│   ──────                          ──────                         │
│                                                                  │
│   1. POST /auth/logout ──────────────►                          │
│      Cookie: sessionId=xxx                                       │
│                                                                  │
│                              2. Delete session from DB           │
│                                                                  │
│   ◄─────────────────────────── 3. Set-Cookie: sessionId=;       │
│                                   expires=past (delete cookie)   │
│                                                                  │
│   4. Cookie removed from browser                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📄 License

ISC License
