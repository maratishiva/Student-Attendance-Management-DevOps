const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../server");

test("health endpoint responds with success message", async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.message, "Attendance backend is running successfully!");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("attendance history requires a roll number", async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/attendance/history`);
    assert.equal(response.status, 400);
    const data = await response.json();
    assert.match(data.error, /roll_number/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
