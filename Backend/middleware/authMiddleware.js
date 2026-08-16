// const jwt = require("jsonwebtoken");
// const User = require("../models/User");

// // Middleware to protect routes

// const protect = async (req, resizeBy, next) => {
//   let token;
//   if (
//     req.headers.authorization &&
//     req.headers.authorization.startsWith("Bearer")
//   ) {
//     try {
//       token = req.headers.authorization.split(" ")[1];
//       const decode = jwt.verify(token, process.env.JWT_SECRET);
//       req.user = await User.findById(decode.user._id).select("-password"); // Exclude password
//       next();
//     } catch (error) {
//       console.error("Token verification failed", error);
//       resizeBy.status(401).json({ message: "Not authorized, token failed" });
//     }
//   } else {
//     resizeBy.status(401).json({ message: "Not authorized, no token provided" });
//   }
// };

// module.exports = protect;

const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      console.log("Decoded token:", decoded);

      req.user = await User.findById(decoded.user._id).select("-password");

      if (!req.user) {
        return res.status(401).json({
          message: "User not found",
        });
      }

      next();
    } catch (error) {
      console.error("Token verification failed:", error);

      return res.status(401).json({
        message: "Not authorized, token failed",
      });
    }
  } else {
    return res.status(401).json({
      message: "Not authorized, no token provided",
    });
  }
};

module.exports = protect;
