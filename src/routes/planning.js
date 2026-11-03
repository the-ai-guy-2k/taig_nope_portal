"use strict";
const express = require("express");
const router = express.Router();
router.get("/work-week-plan", (req, res) => {
  res.render("work-week-plan", { pageTitle: "Work Week Plan", activeNav: "work-week-plan" });
});
router.get("/tree-map", (req, res) => {
  res.render("tree-map", { pageTitle: "Tree Map", activeNav: "tree-map" });
});
router.get("/daily-work-log", (req, res) => {
  res.render("daily-work-log", { pageTitle: "Daily Work Log", activeNav: "daily-work-log" });
});
module.exports = router;
