import helmet from "helmet";
import session from "express-session";

export function setupSecurity(app) {
  // 1. Basic security headers
  app.use(helmet());

  // 2. Hide Express info
  app.disable("x-powered-by");

  // 3. Force HTTPS in production
  if (process.env.NODE_ENV === "production") {
    app.use((req, res, next) => {
      if (req.header("x-forwarded-proto") !== "https") {
        return res.redirect(`https://${req.header("host")}${req.url}`);
      }
      next();
    });
  }

  // 4. Secure sessions
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "fallbackSecret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production", // only over HTTPS
        httpOnly: true, // prevents JS access
        sameSite: "lax" // helps against CSRF
      }
    })
  );
}
