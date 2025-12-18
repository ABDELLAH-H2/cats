# Cats API 🐱

A RESTful API for managing cats, built with **Hono** and deployed on **Cloudflare Workers** with **D1** (serverless SQLite database).

## Tech Stack

- **[Hono](https://hono.dev/)** - Lightweight web framework for Cloudflare Workers
- **[Cloudflare Workers](https://workers.cloudflare.com/)** - Serverless edge computing
- **[Cloudflare D1](https://developers.cloudflare.com/d1/)** - Serverless SQL database
- **bcryptjs** - Password hashing (pure JS, Workers-compatible)
- **JWT** - JSON Web Tokens for authentication

---

## Prerequisites

1. **Node.js** (v18 or later)
2. **GitHub account** with a repository for your project
3. **Cloudflare account** (free tier works)
4. **Wrangler CLI** (Cloudflare's CLI tool)

---

## Deployment Guide: GitHub → Cloudflare Workers

### Step 1: Create a Cloudflare Account

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Sign up for a free account

### Step 2: Install Dependencies Locally

```bash
npm install
```

### Step 3: Login to Cloudflare via Wrangler

```bash
npx wrangler login
```

This will open a browser window for authentication.

### Step 4: Create the D1 Database

```bash
npx wrangler d1 create cats-db
```

Copy the `database_id` from the output and update `wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "cats-db",
      "database_id": "YOUR_DATABASE_ID_HERE"  // ← Paste here
    }
  ]
}
```

### Step 5: Create Database Tables

Run the schema file to create tables:

```bash
npx wrangler d1 execute cats-db --remote --file=schema.sql
```

Or manually:

```bash
npx wrangler d1 execute cats-db --remote --command "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, email TEXT UNIQUE, password TEXT)"
npx wrangler d1 execute cats-db --remote --command "CREATE TABLE IF NOT EXISTS cats (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, pfp TEXT)"
```

### Step 6: Connect GitHub to Cloudflare

1. Go to **Cloudflare Dashboard** → **Workers & Pages**
2. Click **Create** → **Import from Git**
3. Connect your GitHub account
4. Select your repository
5. Configure build settings:
   - **Build command**: `npm install` (or leave empty)
   - **Deploy command**: `npx wrangler deploy`
6. Click **Save and Deploy**

### Step 7: Set Up Automatic Deployments

Once connected, every push to your `main` branch will automatically:
1. Install dependencies
2. Run `npx wrangler deploy`
3. Update your live Worker

---

## Local Development

```bash
# Start local dev server
npx wrangler dev

# The API will be available at http://localhost:8787
```

---

## API Endpoints

### Authentication

| Method | Endpoint          | Description                | Auth Required |
|--------|-------------------|----------------------------|---------------|
| POST   | `/auth/register`  | Register a new user        | No            |
| POST   | `/auth/login`     | Login and get JWT token    | No            |
| GET    | `/auth/me`        | Get current user info      | Yes           |

### Cats

| Method | Endpoint      | Description                      | Auth Required |
|--------|---------------|----------------------------------|---------------|
| GET    | `/cats`       | Get all cats (paginated)         | No            |
| GET    | `/cats/:id`   | Get a specific cat               | No            |
| POST   | `/cats`       | Create a new cat                 | Yes           |
| PUT    | `/cats/:id`   | Update a cat                     | Yes           |
| DELETE | `/cats/:id`   | Delete a cat                     | Yes           |

### Pagination

```
GET /cats?page=1&limit=10
```

### Authentication Header

```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## Example Requests

### Register

```bash
curl -X POST https://your-worker.workers.dev/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "john", "email": "john@example.com", "password": "secret123"}'
```

### Login

```bash
curl -X POST https://your-worker.workers.dev/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com", "password": "secret123"}'
```

### Create a Cat (with auth)

```bash
curl -X POST https://your-worker.workers.dev/cats \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"name": "Whiskers", "pfp": "https://example.com/cat.jpg"}'
```

---

## Common Issues & Fixes

### 1. `__dirname is not defined`

**Problem**: Using Node.js-specific globals like `__dirname` or `require('path')`.

**Solution**: Cloudflare Workers use V8 isolates, not Node.js. Remove these and use ES modules.

### 2. `bcrypt` not working

**Problem**: The `bcrypt` package uses native C++ bindings.

**Solution**: Use `bcryptjs` instead (pure JavaScript implementation).

```bash
npm uninstall bcrypt
npm install bcryptjs
```

### 3. `Cannot assign to read only property 'body'`

**Problem**: Using `serverless-http` or Express with Workers.

**Solution**: Use **Hono** or another Workers-native framework instead of Express.

### 4. MySQL connection fails

**Problem**: Workers can't use TCP sockets for MySQL connections.

**Solution**: Use **Cloudflare D1** (serverless SQLite) or **Hyperdrive** for external databases.

### 5. Static files not serving

**Problem**: `express.static()` doesn't work in Workers.

**Solution**: Add `assets` configuration to `wrangler.jsonc`:

```jsonc
{
  "assets": {
    "directory": "./public",
    "binding": "ASSETS"
  }
}
```

---

## Project Structure

```
├── app.js              # Main Hono application
├── schema.sql          # Database schema
├── package.json        # Dependencies
├── wrangler.jsonc      # Cloudflare Workers config
└── public/             # Static frontend files
    ├── index.html
    ├── login.html
    ├── style.css
    ├── script.js
    └── auth.js
```

---

## Environment Variables

For production, set these in Cloudflare Dashboard → Workers → Settings → Variables:

| Variable     | Description                |
|--------------|----------------------------|
| `JWT_SECRET` | Secret key for JWT signing |

---

## License

ISC
