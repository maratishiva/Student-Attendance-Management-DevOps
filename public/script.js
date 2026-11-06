const API = "/api";
let students = [];
let attendance = {};

const tableBody = document.getElementById("studentTableBody");
const dateInput = document.getElementById("attendanceDate");
const message = document.getElementById("message");
const historyStudent = document.getElementById("historyStudent");
const historyTableBody = document.getElementById("historyTableBody");
const historyMessage = document.getElementById("historyMessage");

function showMessage(text, type = "") {
  message.textContent = text;
  message.className = `message ${type}`;
}
function showReportMessage(text, type = "") {
  const el = document.getElementById("reportMessage");
  el.textContent = text;
  el.className = `message ${type}`;
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const detail = typeof data === "string" ? data.slice(0, 180) : data.error;
    throw new Error(detail || `Request failed (${response.status})`);
  }
  if (typeof data === "string") throw new Error("The server returned a page instead of JSON. Check the API URL and server route.");
  return data;
}
function selectedDate() {
  return dateInput.value || new Date().toISOString().slice(0, 10);
}
function renderHistoryStudentOptions() {
  const previous = historyStudent.value;
  historyStudent.innerHTML = '<option value="">Select a student</option>';
  students.forEach(student => {
    const option = document.createElement("option");
    option.value = student.roll_number;
    option.textContent = `${student.name} — ${student.roll_number}`;
    historyStudent.appendChild(option);
  });
  if (students.some(s => s.roll_number === previous)) historyStudent.value = previous;
}
function renderStudents() {
  if (!students.length) {
    tableBody.innerHTML = '<tr><td colspan="10" class="empty">No students yet. Add a student above.</td></tr>';
    updateStats();
    return;
  }
  tableBody.innerHTML = "";
  students.forEach(student => {
    const tr = document.createElement("tr");
    const periods = attendance[student.roll_number] || Array(7).fill("");
    tr.innerHTML = `<td>${escapeHTML(student.roll_number)}</td><td>${escapeHTML(student.name)}</td><td>${escapeHTML(student.department)}</td>`;
    periods.forEach((status, index) => {
      const td = document.createElement("td");
      const select = document.createElement("select");
      select.className = "period-select";
      select.setAttribute("aria-label", `Period ${index + 1} for ${student.name}`);
      select.dataset.roll = student.roll_number;
      select.dataset.period = String(index);
      select.innerHTML = '<option value="">Choose</option><option value="Present">Present</option><option value="Absent">Absent</option>';
      select.value = status;
      select.addEventListener("change", () => {
        if (!attendance[student.roll_number]) attendance[student.roll_number] = Array(7).fill("");
        attendance[student.roll_number][index] = select.value;
        updateStats();
      });
      td.appendChild(select);
      tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });
  updateStats();
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[char]);
}
function updateStats() {
  let present = 0, absent = 0;
  Object.values(attendance).forEach(periods => periods.forEach(status => {
    if (status === "Present") present++;
    if (status === "Absent") absent++;
  }));
  const total = present + absent;
  document.getElementById("totalStudents").textContent = students.length;
  document.getElementById("presentCount").textContent = present;
  document.getElementById("absentCount").textContent = absent;
  document.getElementById("attendanceRate").textContent = `${total ? (present / total * 100).toFixed(1) : 0}%`;
}
async function loadStudents() {
  students = await api(`${API}/students`);
  renderHistoryStudentOptions();
}
async function loadAttendance() {
  attendance = {};
  const rows = await api(`${API}/attendance?date=${encodeURIComponent(selectedDate())}`);
  rows.forEach(row => attendance[row.roll_number] = row.periods);
  renderStudents();
}
async function loadDaily() {
  try {
    await loadStudents();
    await loadAttendance();
    showMessage("Student list and attendance loaded.", "success");
  } catch (error) {
    showMessage(`Unable to load data: ${error.message}`, "error");
  }
}
async function loadMonthlyReport() {
  const month = document.getElementById("reportMonth").value;
  const limit = document.getElementById("attendanceLimit").value || 75;
  const body = document.getElementById("reportTableBody");
  if (!month) {
    body.innerHTML = '<tr><td colspan="7" class="empty">Choose a month.</td></tr>';
    return;
  }
  try {
    const rows = await api(`${API}/reports/monthly?month=${encodeURIComponent(month)}&limit=${encodeURIComponent(limit)}`);
    body.innerHTML = "";
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty">No students found.</td></tr>';
      return;
    }
    rows.forEach(row => {
      const tr = document.createElement("tr");
      const statusClass = row.status === "Low Attendance" ? "status-low" : row.status === "Good Attendance" ? "status-good" : "status-none";
      tr.innerHTML = `<td>${escapeHTML(row.roll_number)}</td><td>${escapeHTML(row.name)}</td><td>${row.working_periods}</td><td>${row.present}</td><td>${row.absent}</td><td>${row.attendance_percentage}%</td><td class="${statusClass}">${escapeHTML(row.status)}</td>`;
      body.appendChild(tr);
    });
    showReportMessage("Monthly report updated.", "success");
  } catch (error) {
    showReportMessage(`Unable to load report: ${error.message}`, "error");
  }
}
async function loadStudentHistory() {
  const roll = historyStudent.value;
  historyTableBody.innerHTML = "";
  if (!roll) {
    historyTableBody.innerHTML = '<tr><td colspan="5" class="empty">No student selected.</td></tr>';
    historyMessage.textContent = "Choose a student to view attendance history.";
    historyMessage.className = "message";
    return;
  }
  try {
    const rows = await api(`${API}/attendance/history?roll_number=${encodeURIComponent(roll)}`);
    if (!rows.length) {
      historyTableBody.innerHTML = '<tr><td colspan="5" class="empty">No attendance records found for this student.</td></tr>';
      historyMessage.textContent = "No saved history yet.";
      historyMessage.className = "message";
      return;
    }
    rows.forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHTML(row.attendance_date)}</td><td>${escapeHTML(row.roll_number)}</td><td>${escapeHTML(row.name)}</td><td>${row.period}</td><td>${escapeHTML(row.status)}</td>`;
      historyTableBody.appendChild(tr);
    });
    historyMessage.textContent = `${rows.length} attendance records loaded.`;
    historyMessage.className = "message success";
  } catch (error) {
    historyMessage.textContent = `Unable to load history: ${error.message}`;
    historyMessage.className = "message error";
  }
}
async function saveAttendance() {
  try {
    const records = students.map(student => ({
      roll_number: student.roll_number,
      periods: attendance[student.roll_number] || Array(7).fill("")
    }));
    const result = await api(`${API}/attendance`, {
      method: "POST",
      body: JSON.stringify({ date: selectedDate(), records })
    });
    showMessage(result.message, "success");
    await loadMonthlyReport();
    if (historyStudent.value) await loadStudentHistory();
  } catch (error) {
    showMessage(`Unable to save: ${error.message}`, "error");
  }
}
document.getElementById("studentForm").addEventListener("submit", async event => {
  event.preventDefault();
  const payload = {
    name: document.getElementById("studentName").value.trim(),
    roll_number: document.getElementById("studentRoll").value.trim(),
    department: document.getElementById("studentDepartment").value.trim()
  };
  try {
    await api(`${API}/students`, { method: "POST", body: JSON.stringify(payload) });
    event.target.reset();
    await loadDaily();
    await loadMonthlyReport();
    showMessage("Student added successfully.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});
document.getElementById("markAllPresent").addEventListener("click", () => {
  students.forEach(student => attendance[student.roll_number] = Array(7).fill("Present"));
  renderStudents();
});
document.getElementById("markAllAbsent").addEventListener("click", () => {
  students.forEach(student => attendance[student.roll_number] = Array(7).fill("Absent"));
  renderStudents();
});
document.getElementById("saveAttendance").addEventListener("click", saveAttendance);
dateInput.addEventListener("change", loadAttendance);
historyStudent.addEventListener("change", loadStudentHistory);
document.getElementById("loadReport").addEventListener("click", loadMonthlyReport);
document.getElementById("reportMonth").addEventListener("change", loadMonthlyReport);
document.getElementById("attendanceLimit").addEventListener("change", loadMonthlyReport);
document.getElementById("exportCSV").addEventListener("click", () => {
  const month = document.getElementById("reportMonth").value;
  if (!month) return showReportMessage("Choose a report month before exporting.", "error");
  window.location.href = `${API}/reports/monthly.csv?month=${encodeURIComponent(month)}`;
});

const today = new Date();
dateInput.value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
document.getElementById("reportMonth").value = dateInput.value.slice(0, 7);
loadDaily().then(loadMonthlyReport);
