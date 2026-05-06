const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// TEST ROUTE
app.get("/", (req, res) => {
  res.send("Exalt Exchange Backend Running");
});

// STATUS API
app.get("/status", (req, res) => {
  res.json({
    ok: true,
    status: "running",
    exchange: "Exalt Exchange",
  });
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
