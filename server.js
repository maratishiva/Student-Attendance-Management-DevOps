
const express = require("express");
const path = require("node:path");
const db = require("./database/database");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Validate date format
function validDate(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

// CSV escaping
function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

// HEALTH CHECK
app.get("/api/health", (req, res) => {
  res.json({
    message: "Attendance backend is running successfully!"
  });
});

// GET ALL STUDENTS
app.get("/api/students", (req, res) => {
  try {
    const students = db.prepare(`
      SELECT roll_number, name, department
      FROM students
      ORDER BY roll_number
    `).all();

    res.json(students);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load students." });
  }
});

// ADD STUDENT
app.post("/api/students", (req, res) => {
  const roll = String(req.body.roll_number ?? "").trim();
  const name = String(req.body.name ?? "").trim();
  const department = String(req.body.department ?? "").trim();

  if (!roll || !name || !department) {
    return res.status(400).json({
      error: "All student details are required."
    });
  }

  try {
    db.prepare(`
      INSERT INTO students (roll_number, name, department)
      VALUES (?, ?, ?)
    `).run(roll, name, department);

    res.status(201).json({
      message: "Student added successfully."
    });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({
        error: "That roll number already exists."
      });
    }

    console.error(error);
    res.status(500).json({ error: "Unable to add student." });
  }
});

// UPDATE STUDENT
app.put("/api/students/:roll_number", (req, res) => {
  const roll = String(req.params.roll_number).trim();
  const name = String(req.body.name ?? "").trim();
  const department = String(req.body.department ?? "").trim();

  if (!name || !department) {
    return res.status(400).json({
      error: "Name and department are required."
    });
  }

  try {
    const result = db.prepare(`
      UPDATE students
      SET name = ?, department = ?
      WHERE roll_number = ?
    `).run(name, department, roll);

    if (!result.changes) {
      return res.status(404).json({
        error: "Student not found."
      });
    }

    res.json({ message: "Student updated successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to update student." });
  }
});

// DELETE STUDENT
app.delete("/api/students/:roll_number", (req, res) => {
  try {
    const roll = String(req.params.roll_number).trim();

    const result = db.prepare(`
      DELETE FROM students WHERE roll_number = ?
    `).run(roll);

    if (!result.changes) {
      return res.status(404).json({
        error: "Student not found."
      });
    }

    res.json({ message: "Student deleted successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to delete student." });
  }
});

// GET DAILY ATTENDANCE
app.get("/api/attendance", (req, res) => {
  const date = req.query.date;

  if (!validDate(date)) {
    return res.status(400).json({
      error: "A valid date is required (YYYY-MM-DD)."
    });
  }

  try {
    const rows = db.prepare(`
      SELECT
        s.roll_number,
        s.name,
        s.department,
        a.period,
        a.status
      FROM students s
      LEFT JOIN attendance a
        ON a.student_id = s.id
        AND a.attendance_date = ?
      ORDER BY s.roll_number, a.period
    `).all(date);

    const result = new Map();

    for (const row of rows) {
      if (!result.has(row.roll_number)) {
        result.set(row.roll_number, {
          roll_number: row.roll_number,
          name: row.name,
          department: row.department,
          periods: Array(7).fill("")
        });
      }

      if (row.period) {
        result.get(row.roll_number).periods[row.period - 1] =
          row.status;
      }
    }

    res.json([...result.values()]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Unable to load attendance."
    });
  }
});

// SAVE DAILY ATTENDANCE
app.post("/api/attendance", (req, res) => {
  const date = req.body.date;
  const records = req.body.records;

  if (!validDate(date) || !Array.isArray(records)) {
    return res.status(400).json({
      error: "A valid date and attendance records are required."
    });
  }

  try {
    const students = db.prepare(`
      SELECT id, roll_number FROM students
    `).all();

    const idByRoll = new Map(
      students.map(student => [
        student.roll_number,
        student.id
      ])
    );

    const insert = db.prepare(`
      INSERT INTO attendance
        (student_id, attendance_date, period, status)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(student_id, attendance_date, period)
      DO UPDATE SET status = excluded.status
    `);

    // Built-in node:sqlite uses db.exec(), not db.transaction()
    db.exec("BEGIN IMMEDIATE");

    for (const record of records) {
      const roll = String(record.roll_number ?? "").trim();
      const studentId = idByRoll.get(roll);

      if (!studentId) {
        throw new Error(
          `Unknown student roll number: ${roll}`
        );
      }

      if (
        !Array.isArray(record.periods) ||
        record.periods.length !== 7
      ) {
        throw new Error(
          `Student ${roll} must have exactly 7 periods.`
        );
      }

      record.periods.forEach((status, index) => {
        if (status !== "Present" && status !== "Absent") {
          throw new Error(
            `Choose Present or Absent for all 7 periods (roll ${roll}, period ${index + 1}).`
          );
        }

        insert.run(
          studentId,
          date,
          index + 1,
          status
        );
      });
    }

    db.exec("COMMIT");

    res.json({
      message: "Attendance saved successfully.",
      saved_students: records.length
    });

  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch (rollbackError) {
      console.error("Rollback error:", rollbackError);
    }

    console.error("Attendance save error:", error);

    res.status(400).json({
      error: error.message || "Unable to save attendance."
    });
  }
});

// STUDENT ATTENDANCE HISTORY
app.get("/api/attendance/history", (req, res) => {
  const roll = String(req.query.roll_number ?? "").trim();

  if (!roll) {
    return res.status(400).json({
      error: "roll_number query parameter is required."
    });
  }

  try {
    const rows = db.prepare(`
      SELECT
        s.roll_number,
        s.name,
        a.attendance_date,
        a.period,
        a.status
      FROM attendance a
      JOIN students s ON s.id = a.student_id
      WHERE s.roll_number = ?
      ORDER BY a.attendance_date DESC, a.period ASC
    `).all(roll);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Unable to load attendance history."
    });
  }
});

// MONTHLY ATTENDANCE REPORT
app.get("/api/reports/monthly", (req, res) => {
  const month = req.query.month;

  if (
    typeof month !== "string" ||
    !/^\d{4}-\d{2}$/.test(month)
  ) {
    return res.status(400).json({
      error: "A valid month is required (YYYY-MM)."
    });
  }

  const limit = Math.min(
    100,
    Math.max(0, Number(req.query.limit) || 75)
  );

  try {
    const rows = db.prepare(`
      SELECT
        s.roll_number,
        s.name,
        COUNT(a.id) AS working_periods,
        SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent
      FROM students s
      LEFT JOIN attendance a
        ON a.student_id = s.id
        AND substr(a.attendance_date, 1, 7) = ?
      GROUP BY s.id, s.roll_number, s.name
      ORDER BY s.roll_number
    `).all(month);

    const report = rows.map(row => {
      const working = Number(row.working_periods) || 0;
      const present = Number(row.present) || 0;
      const absent = Number(row.absent) || 0;

      const percentage = working
        ? Number((present / working * 100).toFixed(2))
        : 0;

      return {
        roll_number: row.roll_number,
        name: row.name,
        working_periods: working,
        present,
        absent,
        attendance_percentage: percentage,
        status: working === 0
          ? "No Records"
          : percentage < limit
            ? "Low Attendance"
            : "Good Attendance"
      };
    });

    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Unable to generate monthly report."
    });
  }
});

// MONTHLY CSV EXPORT
app.get("/api/reports/monthly.csv", (req, res) => {
  const month = req.query.month;

  if (
    typeof month !== "string" ||
    !/^\d{4}-\d{2}$/.test(month)
  ) {
    return res.status(400).json({
      error: "A valid month is required (YYYY-MM)."
    });
  }

  try {
    const rows = db.prepare(`
      SELECT
        s.roll_number,
        s.name,
        COUNT(a.id) AS working_periods,
        SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent
      FROM students s
      LEFT JOIN attendance a
        ON a.student_id = s.id
        AND substr(a.attendance_date, 1, 7) = ?
      GROUP BY s.id
      ORDER BY s.roll_number
    `).all(month);

    const lines = [[
      "Roll Number",
      "Student Name",
      "Working Periods",
      "Present",
      "Absent",
      "Attendance %"
    ]];

    for (const row of rows) {
      const working = Number(row.working_periods) || 0;
      const present = Number(row.present) || 0;
      const absent = Number(row.absent) || 0;

      lines.push([
        row.roll_number,
        row.name,
        working,
        present,
        absent,
        working
          ? (present / working * 100).toFixed(2)
          : "0.00"
      ]);
    }

    const csv = lines
      .map(line => line.map(csvEscape).join(","))
      .join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="attendance-${month}.csv"`
    );

    res.send(csv);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Unable to export monthly report."
    });
  }
});

// API INFORMATION
app.get("/api", (req, res) => {
  res.json({
    message: "Student Attendance API",
    health: "/api/health",
    students: "/api/students",
    attendance: "/api/attendance",
    history: "/api/attendance/history",
    monthlyReport: "/api/reports/monthly",
    monthlyCSV: "/api/reports/monthly.csv"
  });
});

// START SERVER
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(
      `Serving frontend from: ${path.join(__dirname, "public")}`
    );
  });
}

module.exports = app;
