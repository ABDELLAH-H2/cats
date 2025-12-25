import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import bcrypt from 'bcryptjs';

const app = new Hono();

// JWT settings
const JWT_EXPIRES_IN = 60 * 60 * 24 * 7; // 7 days in seconds

// Helper function to get JWT secret from environment
const getJWTSecret = (c) => c.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

// CORS middleware - Allow Authorization header
app.use('*', cors({
  origin: (origin) => origin || '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Helper function to get D1 database from context
const getDB = (c) => c.env.DB;

// Generate JWT token
async function generateToken(secret, payload) {
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + JWT_EXPIRES_IN
  };
  return await sign(tokenPayload, secret);
}

// Verify JWT token
async function verifyToken(secret, token) {
  try {
    const payload = await verify(token, secret);
    return payload;
  } catch (error) {
    return null;
  }
}

// Auth middleware - Validate JWT from Authorization header
const authenticateJWT = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Access denied. No token provided.' }, 401);
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const secret = getJWTSecret(c);

  try {
    const payload = await verifyToken(secret, token);

    if (!payload) {
      return c.json({ error: 'Invalid or expired token.' }, 401);
    }

    // Set user info on context from JWT payload
    c.set('user', {
      id: payload.id,
      username: payload.username,
      email: payload.email
    });

    await next();
  } catch (err) {
    console.error('JWT validation error:', err);
    return c.json({ error: 'Token validation error.' }, 500);
  }
};

// ==================== AUTH ROUTES ====================

// Register
app.post('/auth/register', async (c) => {
  const db = getDB(c);
  const secret = getJWTSecret(c);
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

    const userId = result.meta.last_row_id;

    // Generate JWT token
    const token = await generateToken(secret, {
      id: userId,
      username,
      email
    });

    return c.json({
      message: 'User registered successfully',
      user: { id: userId, username, email },
      token
    }, 201);
  } catch (error) {
    console.error('Registration error:', error);
    return c.json({ error: 'Server error during registration' }, 500);
  }
});

// Login
app.post('/auth/login', async (c) => {
  const db = getDB(c);
  const secret = getJWTSecret(c);
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

    // Generate JWT token
    const token = await generateToken(secret, {
      id: user.id,
      username: user.username,
      email: user.email
    });

    return c.json({
      message: 'Login successful',
      user: { id: user.id, username: user.username, email: user.email },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Login error' }, 500);
  }
});

// Logout - With JWT, logout is handled client-side by removing the token
app.post('/auth/logout', async (c) => {
  // JWT logout is stateless - client simply discards the token
  return c.json({ message: 'Logged out successfully' });
});

// Get current user info
app.get('/auth/me', authenticateJWT, async (c) => {
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
app.post('/cats', authenticateJWT, async (c) => {
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
app.delete('/cats/:id', authenticateJWT, async (c) => {
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
app.put('/cats/:id', authenticateJWT, async (c) => {
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

// ==================== CART ROUTES ====================

// Get user's cart
app.get('/cart', authenticateJWT, async (c) => {
  const db = getDB(c);
  const user = c.get('user');

  try {
    const result = await db.prepare(`
      SELECT c.id, c.name, c.pfp, c.tags, cart.added_at 
      FROM cart 
      JOIN cats c ON cart.cat_id = c.id 
      WHERE cart.user_id = ?
      ORDER BY cart.added_at DESC
    `).bind(user.id).all();

    return c.json({ cart: result.results });
  } catch (error) {
    console.error('Cart fetch error:', error);
    return c.json({ error: 'Failed to fetch cart' }, 500);
  }
});

// Add cat to cart
app.post('/cart', authenticateJWT, async (c) => {
  const db = getDB(c);
  const user = c.get('user');
  const { catId } = await c.req.json();

  if (!catId) {
    return c.json({ error: 'Cat ID is required' }, 400);
  }

  try {
    // Check if cat exists
    const cat = await db.prepare('SELECT id FROM cats WHERE id = ?').bind(catId).first();
    if (!cat) {
      return c.json({ error: 'Cat not found' }, 404);
    }

    // Check if already in cart
    const existing = await db.prepare(
      'SELECT id FROM cart WHERE user_id = ? AND cat_id = ?'
    ).bind(user.id, catId).first();

    if (existing) {
      return c.json({ error: 'Cat already in cart' }, 409);
    }

    // Add to cart
    await db.prepare(
      'INSERT INTO cart (user_id, cat_id) VALUES (?, ?)'
    ).bind(user.id, catId).run();

    return c.json({ message: 'Cat added to cart' }, 201);
  } catch (error) {
    console.error('Cart add error:', error);
    return c.json({ error: 'Failed to add to cart' }, 500);
  }
});

// Remove cat from cart
app.delete('/cart/:catId', authenticateJWT, async (c) => {
  const db = getDB(c);
  const user = c.get('user');
  const catId = c.req.param('catId');

  try {
    const result = await db.prepare(
      'DELETE FROM cart WHERE user_id = ? AND cat_id = ?'
    ).bind(user.id, catId).run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Item not found in cart' }, 404);
    }

    return c.json({ message: 'Cat removed from cart' });
  } catch (error) {
    console.error('Cart remove error:', error);
    return c.json({ error: 'Failed to remove from cart' }, 500);
  }
});

// Clear entire cart
app.delete('/cart', authenticateJWT, async (c) => {
  const db = getDB(c);
  const user = c.get('user');

  try {
    await db.prepare('DELETE FROM cart WHERE user_id = ?').bind(user.id).run();
    return c.json({ message: 'Cart cleared' });
  } catch (error) {
    console.error('Cart clear error:', error);
    return c.json({ error: 'Failed to clear cart' }, 500);
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
      'GET /auth/me - Get current user (auth required)',
      'GET /cart - Get user cart (auth required)',
      'POST /cart - Add cat to cart (auth required)',
      'DELETE /cart/:catId - Remove cat from cart (auth required)',
      'DELETE /cart - Clear cart (auth required)'
    ]
  });
});

export default app;

