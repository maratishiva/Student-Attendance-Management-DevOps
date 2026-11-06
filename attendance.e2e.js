
const { Builder, By, until } = require("selenium-webdriver");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

const BASE_URL = "http://localhost:30080";
const API_URL = `${BASE_URL}/api`;

async function api(driver, endpoint, method = "GET", body) {
  return driver.executeAsyncScript(
    (url, requestMethod, requestBody, callback) => {
      fetch(url, {
        method: requestMethod,
        headers: { "Content-Type": "application/json" },
        body: requestBody ? JSON.stringify(requestBody) : undefined
      })
        .then(async response => ({
          status: response.status,
          data: await response.json()
        }))
        .then(callback)
        .catch(error => callback({ error: error.message }));
    },
    `${API_URL}${endpoint}`,
    method,
    body
  );
}

async function runTests() {
  const driver = await new Builder().forBrowser("chrome").build();

  const roll = `QA${Date.now()}`;
  const name = "Selenium Test Student";
  const department = "CSE-AIML";

  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  const month = date.slice(0, 7);

  try {
    console.log("\nStarting 10 Selenium test cases...\n");

    await driver.get(BASE_URL);
    await driver.wait(
      until.titleContains("Student Attendance"),
      15000
    );

    // Create a separate test student using the application form.
    await driver.findElement(By.id("studentName")).sendKeys(name);
    await driver.findElement(By.id("studentRoll")).sendKeys(roll);
    await driver.findElement(By.id("studentDepartment")).sendKeys(department);
    await driver.findElement(By.css("#studentForm button[type='submit']")).click();

    const studentRow = By.xpath(
      `//tbody[@id='studentTableBody']/tr[td[1][normalize-space()='${roll}']]`
    );

    await driver.wait(until.elementLocated(studentRow), 10000);

    // TEST 1: Verify registered students are displayed.
    assert.ok(await driver.findElement(studentRow).isDisplayed());
    console.log("PASS 1: Registered student is displayed.");

    // Select today's date.
    await driver.executeScript(
      `const el = document.getElementById("attendanceDate");
       el.value = arguments[0];
       el.dispatchEvent(new Event("change", { bubbles: true }));`,
      date
    );

    await driver.wait(async () => {
      const row = await driver.findElement(studentRow);
      return (await row.findElements(By.css("select.period-select"))).length === 7;
    }, 10000);

    // TEST 2: Verify all seven periods can be marked.
    const periodSelects = await driver
      .findElement(studentRow)
      .findElements(By.css("select.period-select"));

    assert.equal(periodSelects.length, 7);

    await driver.executeScript(
      `const selects = document.querySelectorAll(
        "#studentTableBody tr"
      );
      const row = [...selects].find(r => r.cells[0]?.textContent.trim() === arguments[0]);
      const periods = row.querySelectorAll("select.period-select");

      periods.forEach((select, index) => {
        select.value = index === 6 ? "Absent" : "Present";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });`,
      roll
    );

    console.log("PASS 2: All seven periods can be marked.");

    // TEST 3: Save attendance for the selected date.
    await driver.findElement(By.id("saveAttendance")).click();

    await driver.wait(async () => {
      const message = await driver.findElement(By.id("message")).getText();
      return message.includes("Attendance saved successfully");
    }, 10000);

    console.log("PASS 3: Attendance saved successfully.");

    const records = [{
      roll_number: roll,
      periods: [
        "Present", "Present", "Present", "Present",
        "Present", "Present", "Absent"
      ]
    }];

    // TEST 4: Missing student information must be rejected.
    const invalidStudent = await api(
      driver,
      "/students",
      "POST",
      { name: "", roll_number: "", department: "" }
    );

    assert.equal(invalidStudent.status, 400);
    console.log("PASS 4: Missing student information is rejected.");

    // TEST 5: Re-saving the same date and periods must not create duplicates.
    const duplicateSave = await api(
      driver,
      "/attendance",
      "POST",
      { date, records }
    );

    assert.equal(duplicateSave.status, 200);

    const history = await api(
      driver,
      `/attendance/history?roll_number=${encodeURIComponent(roll)}`
    );

    assert.equal(history.status, 200);
    assert.equal(history.data.length, 7);

    console.log("PASS 5: Duplicate attendance entries are prevented.");

    // TEST 6: Verify monthly attendance totals.
    const report = await api(
      driver,
      `/reports/monthly?month=${month}&limit=90`
    );

    assert.equal(report.status, 200);

    const studentReport = report.data.find(
      student => student.roll_number === roll
    );

    assert.ok(studentReport, "Student missing from monthly report.");
    assert.equal(studentReport.working_periods, 7);
    assert.equal(studentReport.present, 6);
    assert.equal(studentReport.absent, 1);

    console.log("PASS 6: Monthly attendance totals are correct.");

    // TEST 7: Verify attendance percentage.
    assert.equal(studentReport.attendance_percentage, 85.71);
    console.log("PASS 7: Attendance percentage is correct (85.71%).");

    // TEST 8: Verify low-attendance identification.
    assert.equal(studentReport.status, "Low Attendance");
    console.log("PASS 8: Low-attendance student is identified.");

    // TEST 9: Verify monthly report and CSV export.
    await driver.executeScript(
      `const el = document.getElementById("reportMonth");
       el.value = arguments[0];
       el.dispatchEvent(new Event("change", { bubbles: true }));`,
      month
    );

    await driver.wait(async () => {
      const rows = await driver.findElements(
        By.css("#reportTableBody tr")
      );
      for (const row of rows) {
        if ((await row.getText()).includes(roll)) return true;
      }
      return false;
    }, 10000);

    const csv = await driver.executeAsyncScript(
      (url, callback) => {
        fetch(url)
          .then(response => response.text())
          .then(callback)
          .catch(error => callback(`ERROR: ${error.message}`));
      },
      `${API_URL}/reports/monthly.csv?month=${month}`
    );

    assert.ok(csv.includes("Roll Number"));
    assert.ok(csv.includes(roll));

    console.log("PASS 9: Monthly report and CSV export work.");

    // TEST 10: Restart Kubernetes deployment and verify saved records.
    console.log("Restarting Kubernetes deployment...");

    execFileSync(
      "kubectl",
      ["rollout", "restart", "deployment/student-attendance"],
      { stdio: "inherit" }
    );

    execFileSync(
      "kubectl",
      [
        "rollout",
        "status",
        "deployment/student-attendance",
        "--timeout=120s"
      ],
      { stdio: "inherit" }
    );

    await driver.get(BASE_URL);

    await driver.wait(
      until.titleContains("Student Attendance"),
      30000
    );

    const savedAfterRestart = await api(
      driver,
      `/attendance/history?roll_number=${encodeURIComponent(roll)}`
    );

    assert.equal(savedAfterRestart.status, 200);
    assert.equal(savedAfterRestart.data.length, 7);

    console.log("PASS 10: Saved attendance remains after application restart.");

    console.log("\n==================================");
    console.log("ALL 10 SELENIUM TESTS PASSED");
    console.log("==================================");

  } finally {
    await driver.quit();
  }
}

runTests().catch(error => {
  console.error("\nSELENIUM TEST SUITE FAILED:");
  console.error(error);
  process.exitCode = 1;
});
