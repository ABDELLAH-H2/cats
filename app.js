import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import bcrypt from 'bcryptjs';

const app = new Hono();

// JWT Secret - in production, use environment variables
const JWT_SECRET = 'abdellahtest';

// CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Helper function to get D1 database from context
const getDB = (c) => c.env.DB;

// Auth middleware
const authenticateToken = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return c.json({ error: 'Access denied. No token provided.' }, 401);
  }

  try {
    const decoded = await verify(token, JWT_SECRET);
    c.set('user', decoded);
    await next();
  } catch (err) {
    return c.json({ error: 'Invalid or expired token.' }, 403);
  }
};

// ==================== AUTH ROUTES ====================

// Register
app.post('/auth/register', async (c) => {
  const db = getDB(c);
  const { username, email, password } = await c.req.json();

  // Validation
  if (!username || !email || !password) {
    return c.json({ error: 'Username, email, and password are required' }, 400);
  }

  if (password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400);
  }

  try {
    // Check if user already exists
    const existing = await db.prepare(
      'SELECT id FROM users WHERE email = ? OR username = ?'
    ).bind(email, username).first();

    if (existing) {
      return c.json({ error: 'User with this email or username already exists' }, 409);
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new user
    const result = await db.prepare(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)'
    ).bind(username, email, hashedPassword).run();

    // Generate token
    const token = await sign(
      { id: result.meta.last_row_id, username, email },
      JWT_SECRET
    );

    return c.json({
      message: 'User registered successfully',
      token,
      user: { id: result.meta.last_row_id, username, email }
    }, 201);
  } catch (error) {
    console.error('Registration error:', error);
    return c.json({ error: 'Server error during registration' }, 500);
  }
});

// Login
app.post('/auth/login', async (c) => {
  const db = getDB(c);
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  try {
    const user = await db.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email).first();

    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // Generate token
    const token = await sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET
    );

    return c.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Login error' }, 500);
  }
});

// Get current user info
app.get('/auth/me', authenticateToken, async (c) => {
  const user = c.get('user');
  return c.json({ user });
});

// ==================== CATS ROUTES ====================

// Get cats with pagination and optional tag search
app.get('/cats', async (c) => {
  const db = getDB(c);
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '10');
  const offset = (page - 1) * limit;
  const tagSearch = c.req.query('tag')?.toLowerCase().trim();

  try {
    let countQuery = 'SELECT COUNT(*) as total FROM cats';
    let dataQuery = 'SELECT * FROM cats';
    let queryParams = [];

    // Add tag filter if provided
    if (tagSearch) {
      const tagPattern = `%${tagSearch}%`;
      countQuery += ' WHERE LOWER(tags) LIKE ?';
      dataQuery += ' WHERE LOWER(tags) LIKE ?';
      queryParams.push(tagPattern);
    }

    dataQuery += ' ORDER BY id DESC LIMIT ? OFFSET ?';

    // Get total count
    const countResult = tagSearch
      ? await db.prepare(countQuery).bind(queryParams[0]).first()
      : await db.prepare(countQuery).first();
    const total = countResult.total;
    const totalPages = Math.ceil(total / limit);

    // Get paginated data
    const rows = tagSearch
      ? await db.prepare(dataQuery).bind(queryParams[0], limit, offset).all()
      : await db.prepare(dataQuery).bind(limit, offset).all();

    return c.json({
      data: rows.results,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        tagFilter: tagSearch || null
      }
    });
  } catch (error) {
    console.error('Query error:', error);
    return c.json({ error: 'Query error' }, 500);
  }
});

// Get cat by id
app.get('/cats/:id', async (c) => {
  const db = getDB(c);
  const id = c.req.param('id');

  try {
    const cat = await db.prepare('SELECT * FROM cats WHERE id = ?').bind(id).first();
    if (!cat) {
      return c.json({ error: 'Cat not found' }, 404);
    }
    return c.json(cat);
  } catch (error) {
    console.error('Query error:', error);
    return c.json({ error: 'Query error' }, 500);
  }
});

// Post cats (protected)
app.post('/cats', authenticateToken, async (c) => {
  const db = getDB(c);
  const { name, pfp, tags } = await c.req.json();

  if (!name) {
    return c.json({ error: 'Name is required' }, 400);
  }

  // Normalize tags: trim whitespace and convert to lowercase
  const normalizedTags = tags ? tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t).join(',') : null;

  try {
    const result = await db.prepare(
      'INSERT INTO cats (name, pfp, tags) VALUES (?, ?, ?)'
    ).bind(name, pfp || null, normalizedTags).run();

    return c.json({
      message: 'Cat added successfully',
      id: result.meta.last_row_id
    }, 201);
  } catch (error) {
    console.error('Query error:', error);
    return c.json({ error: 'Query error' }, 500);
  }
});

// Delete a record (protected)
app.delete('/cats/:id', authenticateToken, async (c) => {
  const db = getDB(c);
  const id = c.req.param('id');

  try {
    await db.prepare('DELETE FROM cats WHERE id = ?').bind(id).run();
    return c.json({ message: `Record Num: ${id} deleted successfully` });
  } catch (error) {
    console.error('Query error:', error);
    return c.json({ error: 'Query error' }, 500);
  }
});

// Update a record by ID (protected)
app.put('/cats/:id', authenticateToken, async (c) => {
  const db = getDB(c);
  const catId = c.req.param('id');
  const updates = await c.req.json();

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No fields provided for update.' }, 400);
  }

  const allowedFields = ['name', 'pfp', 'tags'];
  const fields = [];
  const values = [];

  for (const key in updates) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    }
  }

  if (fields.length === 0) {
    return c.json({ error: 'No valid fields provided for update.' }, 400);
  }

  values.push(catId);

  try {
    const query = `UPDATE cats SET ${fields.join(', ')} WHERE id = ?`;
    const result = await db.prepare(query).bind(...values).run();

    if (result.meta.changes === 0) {
      return c.json({
        message: `Cat with ID ${catId} not found or no change was made.`
      }, 404);
    }

    return c.json({
      message: `Record Num: ${catId} updated successfully (Fields updated: ${fields.length})`
    });
  } catch (error) {
    console.error('Query error:', error);
    return c.json({ error: 'Query error' }, 500);
  }
});

// API info route
app.get('/api', (c) => {
  return c.json({
    message: 'Cats API',
    version: '1.0.0',
    endpoints: [
      'GET /cats - List all cats (paginated, optional ?tag=tagname for tag search)',
      'GET /cats/:id - Get a cat by ID',
      'POST /cats - Create a cat with optional tags (auth required)',
      'PUT /cats/:id - Update a cat (auth required)',
      'DELETE /cats/:id - Delete a cat (auth required)',
      'POST /auth/register - Register a new user',
      'POST /auth/login - Login',
      'GET /auth/me - Get current user (auth required)'
    ]
  });
});

export default app;
