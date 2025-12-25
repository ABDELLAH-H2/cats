# 🐱 Cats Gallery API

A full-stack cat gallery application built with **Hono.js** and deployed on **Cloudflare Workers** with **D1 SQLite** database. Features user authentication with **JWT (JSON Web Tokens)**, a shopping cart system, and CRUD operations for managing cat entries.

---

## 📑 Table of Contents

- [Project Overview](#-project-overview)
- [Technology Stack](#-technology-stack)
- [Project Structure](#-project-structure)
- [Database Schema](#-database-schema)
- [Authentication System](#-authentication-system)
- [JWT Explained](#-jwt-explained)
- [API Endpoints](#-api-endpoints)
- [Frontend Features](#-frontend-features)
- [Getting Started](#-getting-started)

---

## 🌟 Project Overview

This project is a cat gallery web application that allows users to:
- Browse and search for cats by name or tags
- Register and login with secure JWT authentication
- Add, edit, and delete cat entries (authenticated users only)
- Add cats to a shopping cart (authenticated users only)

---

## 🛠 Technology Stack

| Technology | Purpose |
|------------|---------|
| **Hono.js** | Lightweight web framework for Cloudflare Workers |
| **Cloudflare Workers** | Serverless edge computing platform |
| **Cloudflare D1** | SQLite database at the edge |
| **hono/jwt** | JWT token signing and verification |
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

The application uses 3 tables in the D1 SQLite database:

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

> **Note**: Unlike session-based authentication, JWT authentication is **stateless** - no sessions table is needed!

---

## 🔐 Authentication System

The application implements **JWT (JSON Web Token)** authentication. Here's how it works:

### Registration Flow
1. User submits username, email, and password
2. Server validates input and checks for existing users
3. Password is hashed using **bcrypt** with 10 salt rounds
4. User is saved to the `users` table
5. A JWT token is generated with user info and expiration
6. Token is returned in the response body

### Login Flow
1. User submits email and password
2. Server retrieves user by email
3. Password is verified using `bcrypt.compare()`
4. If valid, a JWT token is generated
5. Token is returned in the response body

### Logout Flow
1. Client removes the token from localStorage
2. No server-side action needed (stateless!)

---

## 🔑 JWT Explained

### What is JWT?

JWT (JSON Web Token) is a compact, URL-safe means of representing claims between two parties. It consists of three parts:

```
header.payload.signature
```

- **Header**: Contains the token type (JWT) and signing algorithm
- **Payload**: Contains the claims (user data, expiration, etc.)
- **Signature**: Verifies the token hasn't been tampered with

---

### JWT Configuration in This Project

Located in `app.js`:

```javascript
// JWT settings
const JWT_EXPIRES_IN = 60 * 60 * 24 * 7; // 7 days in seconds

// Helper function to get JWT secret from environment
const getJWTSecret = (c) => c.env.JWT_SECRET || 'your-super-secret-key-change-in-production';
```

### JWT Token Structure

When a user logs in or registers, they receive a token like:

```json
{
  "id": 1,
  "username": "john",
  "email": "john@example.com",
  "iat": 1703500000,
  "exp": 1704104800
}
```

| Field | Description |
|-------|-------------|
| `id` | User's database ID |
| `username` | User's username |
| `email` | User's email |
| `iat` | Issued At timestamp (when token was created) |
| `exp` | Expiration timestamp (when token expires) |

---

### JWT Helper Functions

#### 1. Generate Token
```javascript
async function generateToken(secret, payload) {
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + JWT_EXPIRES_IN
  };
  return await sign(tokenPayload, secret);
}
```
Creates a signed JWT token with user data and expiration.

#### 2. Verify Token
```javascript
async function verifyToken(secret, token) {
  try {
    const payload = await verify(token, secret);
    return payload;
  } catch (error) {
    return null;
  }
}
```
Validates the token signature and checks if it's expired.

---

### Authentication Middleware

The `authenticateJWT` middleware protects routes that require authentication:

```javascript
const authenticateJWT = async (c, next) => {
  // 1. Get token from Authorization header
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Access denied. No token provided.' }, 401);
  }

  // 2. Extract token (remove 'Bearer ' prefix)
  const token = authHeader.substring(7);
  const secret = getJWTSecret(c);

  // 3. Verify token
  const payload = await verifyToken(secret, token);

  if (!payload) {
    return c.json({ error: 'Invalid or expired token.' }, 401);
  }

  // 4. Set user info on request context from JWT payload
  c.set('user', {
    id: payload.id,
    username: payload.username,
    email: payload.email
  });

  await next();
};
```

---

### Frontend Token Handling

#### Storing the Token
After login or registration, the token is stored in `localStorage`:

```javascript
// After successful login
const data = await response.json();
localStorage.setItem('token', data.token);
```

#### Sending the Token
All authenticated requests include the token in the `Authorization` header:

```javascript
function getAuthHeaders() {
  const token = localStorage.getItem('token');
  if (token) {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }
  return {
    'Content-Type': 'application/json'
  };
}

// Example: Protected API call
const response = await fetch(`${API_URL}/cart`, {
  headers: getAuthHeaders()
});
```

#### Checking Authentication State
```javascript
async function checkAuthState() {
  const token = localStorage.getItem('token');
  
  if (!token) {
    showLoggedOutState();
    return;
  }

  const response = await fetch(`${API_URL}/auth/me`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (response.ok) {
    const data = await response.json();
    currentUser = data.user;
    // Show logged-in UI...
  } else {
    localStorage.removeItem('token');
    showLoggedOutState();
  }
}
```

#### Logout
```javascript
async function logout() {
  // Simply remove the token from localStorage
  localStorage.removeItem('token');
  currentUser = null;
  showLoggedOutState();
}
```

---

## 🔌 API Endpoints

### Authentication Routes

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/register` | Register a new user (returns JWT) | No |
| POST | `/auth/login` | Login and get JWT token | No |
| POST | `/auth/logout` | Logout (client-side) | No |
| GET | `/auth/me` | Get current user info | Yes (JWT) |

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
- **Token Persistence**: JWT stored in localStorage persists across sessions

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

4. **Configure JWT Secret**
   
   Add to your `wrangler.toml` or set in Cloudflare dashboard:
   ```toml
   [vars]
   JWT_SECRET = "your-super-secret-key-here-make-it-long-and-random"
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Deploy to Cloudflare**
   ```bash
   npm run deploy
   ```

---

## 🔒 Security Best Practices

1. **Password Hashing**: bcrypt with salt rounds for secure password storage
2. **JWT Secret**: Use a long, random secret key in production
3. **Token Expiration**: Tokens automatically expire after 7 days
4. **CORS Configuration**: Properly configured for cross-origin requests
5. **Input Validation**: Server-side validation for all inputs
6. **XSS Prevention**: HTML escaping in frontend rendering
7. **Authorization Header**: Tokens sent via secure header, not URL

---

## 📝 Summary: JWT Authentication Flow

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
│                              4. Generate JWT token               │
│                                 (sign with secret)               │
│                                                                  │
│   ◄─────────────────────────── 5. Return { token, user }        │
│                                                                  │
│   6. Store token in localStorage                                 │
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
│      Authorization: Bearer <token>                               │
│                                                                  │
│                              2. Extract token from header        │
│                              3. Verify signature with secret     │
│                              4. Check expiration (exp claim)     │
│                              5. Extract user from payload        │
│                                                                  │
│   ◄─────────────────────────── 6. Return user's cart data       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        LOGOUT FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Client                                                         │
│   ──────                                                         │
│                                                                  │
│   1. localStorage.removeItem('token')                            │
│                                                                  │
│   2. Update UI to logged-out state                               │
│                                                                  │
│   (No server request needed - JWT is stateless!)                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🆚 JWT vs Session Authentication

| Feature | Session-Based | JWT (Current) |
|---------|---------------|---------------|
| **Storage** | Server database + Cookie | Client localStorage |
| **Scalability** | Database query per request | Stateless, no DB query |
| **Logout** | Delete from database | Client removes token |
| **Token Size** | Small session ID | Larger (contains payload) |
| **Server State** | Stateful | Stateless |
| **Revocation** | Easy (delete session) | Harder (wait for expiry) |

---

## 📄 License

ISC License
