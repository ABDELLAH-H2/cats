const express = require("express");
const mysql = require("mysql2");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { authenticateToken, JWT_SECRET } = require("./middleware/auth");

const app = express();
const post = "5000";

// Serve static files from public folder
app.use(express.static(path.join(__dirname, "public")));

// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "test",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ==================== AUTH ROUTES ====================

// Register
app.post("/auth/register", async (req, res) => {
  const { username, email, password } = req.body;

  // Validation
  if (!username || !email || !password) {
    return res.status(400).json({ error: "Username, email, and password are required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    pool.getConnection((err, connection) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ error: "DB connection error" });
      }

      // Check if user already exists
      connection.query(
        "SELECT id FROM users WHERE email = ? OR username = ?",
        [email, username],
        (qerr, rows) => {
          if (qerr) {
            connection.release();
            console.log(qerr);
            return res.status(500).json({ error: "Query error" });
          }

          if (rows.length > 0) {
            connection.release();
            return res.status(409).json({ error: "User with this email or username already exists" });
          }

          // Insert new user
          connection.query(
            "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
            [username, email, hashedPassword],
            (insertErr, result) => {
              connection.release();
              if (insertErr) {
                console.log(insertErr);
                return res.status(500).json({ error: "Failed to create user" });
              }

              // Generate token
              const token = jwt.sign(
                { id: result.insertId, username, email },
                JWT_SECRET,
                { expiresIn: "24h" }
              );

              res.status(201).json({
                message: "User registered successfully",
                token,
                user: { id: result.insertId, username, email }
              });
            }
          );
        }
      );
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Server error during registration" });
  }
});

// Login
app.post("/auth/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  pool.getConnection((err, connection) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ error: "DB connection error" });
    }

    connection.query(
      "SELECT * FROM users WHERE email = ?",
      [email],
      async (qerr, rows) => {
        connection.release();

        if (qerr) {
          console.log(qerr);
          return res.status(500).json({ error: "Query error" });
        }

        if (rows.length === 0) {
          return res.status(401).json({ error: "Invalid email or password" });
        }

        const user = rows[0];

        try {
          const validPassword = await bcrypt.compare(password, user.password);
          if (!validPassword) {
            return res.status(401).json({ error: "Invalid email or password" });
          }

          // Generate token
          const token = jwt.sign(
            { id: user.id, username: user.username, email: user.email },
            JWT_SECRET,
            { expiresIn: "24h" }
          );

          res.json({
            message: "Login successful",
            token,
            user: { id: user.id, username: user.username, email: user.email }
          });
        } catch (compareError) {
          console.error("Password comparison error:", compareError);
          res.status(500).json({ error: "Login error" });
        }
      }
    );
  });
});

// Get current user info
app.get("/auth/me", authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// ==================== CATS ROUTES ====================

// Get cats with pagination
app.get("/cats", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  pool.getConnection((err, connection) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ error: "DB connection error" });
    }

    // First get total count
    connection.query("SELECT COUNT(*) as total FROM cats", (countErr, countRows) => {
      if (countErr) {
        connection.release();
        console.log(countErr);
        return res.status(500).json({ error: "Query error" });
      }

      const total = countRows[0].total;
      const totalPages = Math.ceil(total / limit);

      // Then get paginated data
      connection.query(
        "SELECT * FROM cats ORDER BY id DESC LIMIT ? OFFSET ?",
        [limit, offset],
        (qerr, rows) => {
          connection.release();
          if (qerr) {
            console.log(qerr);
            return res.status(500).json({ error: "Query error" });
          }

          res.json({
            data: rows,
            pagination: {
              page,
              limit,
              total,
              totalPages
            }
          });
        }
      );
    });
  });
});

// Get cat by id
app.get("/cats/:id", (req, res) => {
  const { id } = req.params;

  pool.getConnection((err, connection) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ error: "DB connection error" });
    }
    connection.query("SELECT * FROM cats WHERE id = ?", [id], (qerr, rows) => {
      connection.release();
      if (qerr) {
        console.log(qerr);
        return res.status(500).json({ error: "Query error" });
      }
      if (rows.length === 0) {
        return res.status(404).json({ error: "Cat not found" });
      }
      res.json(rows[0]);
    });
  });
});

// Post cats (protected)
app.post("/cats", authenticateToken, (req, res) => {
  const { name, pfp } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Name is required" });
  }

  pool.getConnection((err, connection) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ error: "DB connection error" });
    }
    const query = pfp
      ? "INSERT INTO cats (name, pfp) VALUES (?, ?)"
      : "INSERT INTO cats (name) VALUES (?)";
    const params = pfp ? [name, pfp] : [name];
    connection.query(query, params, (qerr, result) => {
      connection.release();
      if (qerr) {
        console.log(qerr);
        return res.status(500).json({ error: "Query error" });
      }
      res
        .status(201)
        .json({ message: "Cat added successfully", id: result.insertId });
    });
  });
});

// Delete a record (protected)
app.delete("/cats/:id", authenticateToken, (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) {
      console.error("DB connection error:", err);
      return res.status(500).json({ error: "DB connection error" });
    }
    connection.query(
      "DELETE FROM cats where id = ?",
      [req.params.id],
      (qErr, rows) => {
        connection.release();
        if (qErr) {
          console.error("Query error:", qErr);
          return res.status(500).json({ error: "Query error" });
        }
        res.json({
          message: `Record Num: ${req.params.id} deleted successfully`,
        });
      }
    );
  });
});

// Update a record by ID (protected)
app.put("/cats/:id", authenticateToken, (req, res) => {
  const catId = req.params.id;
  const updates = req.body;
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields provided for update." });
  }
  pool.getConnection((err, connection) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ error: "DB connection error" });
    }
    const fields = [];
    const values = [];
    for (const key in updates) {
      if (["name", "pfp"].includes(key)) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }
    values.push(catId);
    const query = `
      UPDATE cats 
      SET ${fields.join(", ")} 
      WHERE id = ?
    `;
    connection.query(query, values, (qerr, result) => {
      connection.release();

      if (qerr) {
        console.log(qerr);
        return res.status(500).json({ error: "Query error" });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: `Cat with ID ${catId} not found or no change was made.`,
        });
      }
      res.json({
        message: `Record Num: ${catId} updated successfully (Fields updated: ${fields.length})`,
      });
    });
  });
});

app.listen(post, () => {
  console.log("Server is running on port " + post);
});

// This tells Cloudflare to send all traffic to your Express app
export default {
  async fetch(request, env, ctx) {
    // We use a library like 'serverless-http' to make Express compatible
    const serverless = require('serverless-http');
    const handler = serverless(app);
    return handler(request, env, ctx);
  }
};
