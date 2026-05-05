import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { COURSES } from "./src/constants/courses.ts";
import { User, ContactMessage } from "./src/types/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Mock database
  const users: User[] = [
    {
      id: 'admin-id',
      email: 'admin@skillfor.edu',
      name: 'Administrador General',
      address: 'Politécnico Virgen de la Altagracia',
      role: 'admin',
      courses: []
    },
    {
      id: 'pamela-id',
      email: 'pamelapayanocaceres@gmail.com',
      name: 'Pamela Payano',
      address: 'Santo Domingo',
      role: 'admin',
      courses: []
    }
  ];
  const messages: ContactMessage[] = [];
  const auditLogs: any[] = [];
  const loginAttempts: Record<string, { count: number, lastAttempt: number }> = {};

  // Helper to log actions
  const logAction = (userId: string, action: string, details: string, status: string, req: express.Request) => {
    const log = {
      id: Date.now().toString(),
      userId,
      userEmail: users.find(u => u.id === userId)?.email || 'Unknown',
      action,
      details,
      status,
      timestamp: new Date().toISOString(),
      ip: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
      device: req.headers['user-agent'] || 'Unknown Device'
    };
    auditLogs.push(log);
    // Keep only last 1000 logs for performance in memory
    if (auditLogs.length > 1000) auditLogs.shift();
  };

  // API Routes
  app.get("/api/courses", (req, res) => {
    res.json(COURSES);
  });

  app.post("/api/register", (req, res) => {
    const { name, email, address, password, courseId } = req.body;
    // Check if user exists
    if (users.find(u => u.email === email)) {
      return res.status(400).json({ error: "El correo ya está registrado." });
    }

    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      email,
      address,
      role: email === 'pamelapayanocaceres@gmail.com' ? 'admin' : 'student',
      courses: courseId ? [
        {
          courseId,
          progress: 5,
          status: 'enrolled',
          completedModules: [],
          completedTasks: [],
          completedExams: [],
          grades: COURSES.find(c => c.id === courseId)?.subjects.reduce((acc: any, sub) => {
            acc[sub.name] = Math.floor(Math.random() * 30) + 70;
            return acc;
          }, {}) || {}
        }
      ] : []
    };
    users.push(newUser);
    res.json(newUser);
  });

  app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    const ip = req.ip || 'unknown';

    // 1. Check if both fields are provided
    if (!email || !password) {
      return res.status(400).json({ error: "Ingresar los dos datos (Email y Contraseña)." });
    }

    // 2. Check login attempts limit
    const attempts = loginAttempts[ip] || { count: 0, lastAttempt: 0 };
    if (attempts.count >= 5 && Date.now() - attempts.lastAttempt < 600000) { // 10 min penalty
      return res.status(403).json({ error: "Límite de intentos alcanzado. Límite de intentos con sanción (10 minutos)." });
    }

    const user = users.find(u => u.email === email);
    
    // Check password - For the specific user, use their new password, otherwise default 123456
    const expectedPassword = email === 'pamelapayanocaceres@gmail.com' ? 'pamla243454' : '123456';

    if (!user || password !== expectedPassword) {
      attempts.count++;
      attempts.lastAttempt = Date.now();
      loginAttempts[ip] = attempts;
      
      logAction('anonymous', 'LOGIN_FAILED', `Intento fallido para ${email}`, 'FELLED', req);
      return res.status(401).json({ error: "Los dos están mal. Verifica tu correo y contraseña." });
    }

    // Success
    delete loginAttempts[ip];
    user.lastLogin = new Date().toISOString();
    logAction(user.id, 'LOGIN_SUCCESS', 'Inicio de sesión exitoso', 'COMPLETED', req);
    res.json(user);
  });

  app.get("/api/admin/audit-logs", (req, res) => {
    res.json(auditLogs);
  });

  app.post("/api/contact", (req, res) => {
    const { name, email, message } = req.body;
    const newMessage: ContactMessage = {
      id: Date.now().toString(),
      name,
      email,
      message,
      timestamp: new Date().toISOString()
    };
    messages.push(newMessage);
    res.json({ success: true });
  });

  app.get("/api/admin/users", (req, res) => {
    res.json(users);
  });

  app.get("/api/admin/messages", (req, res) => {
    res.json(messages);
  });

  app.post("/api/user/add-course", (req, res) => {
    const { userId, courseId } = req.body;
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    
    if (user.courses.find(c => c.courseId === courseId)) {
      return res.status(400).json({ error: "Ya estás registrado en este curso" });
    }

    user.courses.push({
      courseId,
      progress: 0,
      status: 'enrolled',
      completedModules: [],
      completedTasks: [],
      completedExams: [],
      grades: COURSES.find(c => c.id === courseId)?.subjects.reduce((acc: any, sub) => {
        acc[sub.name] = 0;
        return acc;
      }, {}) || {}
    });
    res.json(user);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
