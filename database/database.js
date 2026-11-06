const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const fs = require("node:fs");

const databaseDirectory = __dirname;
fs.mkdirSync(databaseDirectory, { recursive: true });
const dbPath = path.join(databaseDirectory, "attendance.db");
const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_number TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    attendance_date TEXT NOT NULL,
    period INTEGER NOT NULL CHECK(period BETWEEN 1 AND 7),
    status TEXT NOT NULL CHECK(status IN ('Present', 'Absent')),
    UNIQUE(student_id, attendance_date, period),
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_attendance_date
  ON attendance(attendance_date);

  CREATE INDEX IF NOT EXISTS idx_attendance_student_date
  ON attendance(student_id, attendance_date);
`);

module.exports = db;
